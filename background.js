console.log('Background Service Worker carregado.');
importScripts('config.js');

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Mensagem recebida no background:', request);
    if (request.action === 'start_flow') {
        console.log('Ação start_flow detectada. Iniciando runFlow...');
        runFlow(request.data).catch(err => console.error('Erro fatal no runFlow:', err));
    }
    return true;
});


async function runFlow(data) {
    const { project, loginUrl, emailUrl, login, password, emailIndex } = data;
    console.log('Dados do fluxo:', { project, loginUrl, emailUrl, login, emailIndex });

    try {
        console.log('Iniciando fluxo principal...');

        let mfaPageReached = false;
        let attempts = 0;
        const maxAttempts = 2;

        while (!mfaPageReached && attempts < maxAttempts) {
            attempts++;
            console.log(`Iniciando tentativa de login ${attempts}/${maxAttempts}...`);
            console.log('Gerando token OAuth2...');
            const token = await generateToken();

            console.log(`Injetando cabeçalhos dinâmicos para projeto: ${project}...`);
            await injectHeaders(token, project);

            // 1. Abrir e Carregar Aba de Login
            const loginTab = await createTab(loginUrl);
            await waitForTabLoad(loginTab.id);

            // 2. Verificar se precisa logar
            const needsLogin = await checkLoginState(loginTab.id);

            if (needsLogin) {
                console.log('Campos de login detectados. Executando login...');
                await executeLogin(loginTab.id, login, password);

                if (emailUrl) {
                    console.log('Aguardando até 10s pela mudança de URL para auth/mfa...');
                    const reachedMfa = await waitForMfaPageWithTimeout(loginTab.id, 10000);

                    if (reachedMfa) {
                        console.log('Chegou na página de MFA. Continuando fluxo de email...');
                        mfaPageReached = true;

                        // Pula MFA se for projeto 'docs'
                        if (project === 'docs') {
                            console.log('Projeto DOCS detectado. Pulando MFA conforme solicitado.');
                        } else {
                            // O parâmetro true pula a espera inicial do executeMFA
                            await executeMFA(loginTab.id, emailUrl, emailIndex, true);
                        }
                    } else {
                        console.log('Timeout (10s): Não chegou em auth/mfa. Removendo regras, gerando novo token e tentando de novo...');
                        await removeHeaders();
                        try { await chrome.tabs.remove(loginTab.id); } catch (e) { }
                        // Volta ao topo do loop while para reinicio completo
                    }
                } else {
                    console.log('Sem URL de email. MFA pulado.');
                    mfaPageReached = true;
                }
            } else {
                console.log('Campos de login NÃO detectados. Verificando estado atual da página...');
                const tab = await chrome.tabs.get(loginTab.id);
                if (tab && tab.url && tab.url.includes('auth/mfa') && emailUrl) {
                    mfaPageReached = true;
                    await executeMFA(loginTab.id, emailUrl, emailIndex, true);
                } else {
                    console.log('Fluxo finalizado ou dashboard alcançado silenciosamente.');
                    mfaPageReached = true;
                }
            }
        }
        if (!mfaPageReached && attempts >= maxAttempts) {
            console.error(`Falha no fluxo: Limite de ${maxAttempts} tentativas atingido.`);
        }
    } catch (err) {
        console.error('Fluxo falhou:', err);
    }
}

async function checkLoginState(tabId) {
    // Dá um tempinho pro script ser injetado/inicializado se necessário
    await new Promise(r => setTimeout(r, 1000));

    try {
        const response = await sendMessageToTab(tabId, { action: 'check_login_fields' });
        if (response && response.present !== undefined) {
            return response.present;
        }
    } catch (e) {
        console.warn('Erro ao checar estado de login:', e);
    }
    // Se falhar ou der erro, assume false (não tenta preencher) ou true?
    // Melhor assumir false para não quebrar a página tentando digitar onde não deve.
    return false;
}

async function executeLogin(tabId, login, password) {
    const loginResult = await sendMessageToTab(tabId, {
        action: 'perform_login',
        data: { login, password }
    });
    console.log('Login preenchido:', loginResult);
}

async function executeMFA(loginTabId, emailUrl, emailIndex, skipWait = false) {
    // 1. Aguardar navegação para a tela de MFA
    if (!skipWait) {
        console.log('Aguardando navegação para tela de MFA...');
        await waitForMfaPage(loginTabId);
    }

    let mfaResolved = false;
    let lastUsedTimestamp = null; // Guardar o timestamp do último email processado

    let emailTabId = null;

    while (!mfaResolved) {
        // 2. Abrir página de email silenciosamente se não tiver uma aberta
        if (!emailTabId) {
            const emailTab = await createTab(emailUrl, false);
            emailTabId = emailTab.id;
            await waitForTabLoad(emailTabId);
        } else {
            console.log('Recarregando página de email para novo código...');
            await chrome.tabs.reload(emailTabId);
            await waitForTabLoad(emailTabId);
        }

        let code = null;
        let currentEmailTimestamp = null;

        // Tentar buscar email - Aumentado para 10 tentativas de 3s (30s total)
        for (let i = 0; i < 10; i++) {
            console.log(`Tentativa de extração ${i + 1}/10...`);

            const results = await chrome.scripting.executeScript({
                target: { tabId: emailTabId, allFrames: true },
                func: (lastTs) => {
                    let emailTimestamp = null;
                    const firstEmailRow = document.querySelector('tr.zA');
                    if (firstEmailRow) {
                        const timeElements = firstEmailRow.querySelectorAll('[title]');
                        for (let el of timeElements) {
                            const parsed = Date.parse(el.getAttribute('title'));
                            if (!isNaN(parsed) && parsed > 1000000000) {
                                emailTimestamp = parsed;
                                break;
                            }
                        }
                    }

                    let elapsed = -1;
                    let isValid = false;

                    // Validar obrigatoriamente
                    if (emailTimestamp) {
                        elapsed = Date.now() - emailTimestamp;
                        // Temp Decorrido <= 2 minutos (120000ms)
                        if (elapsed <= 120000 && elapsed >= 0) {
                            // Não reutilizar o e-mail anterior
                            if (lastTs === null || emailTimestamp !== lastTs) {
                                isValid = true;
                            }
                        }
                    }

                    const codeRegex = /(?:Code:\s*|Verification Code:\s*)(\d{6})|\b(\d{6})\b/;
                    const bodyText = document.body.innerText;
                    const match = bodyText.match(codeRegex);
                    const extractedCode = match ? (match[1] || match[2]) : null;

                    return {
                        code: extractedCode,
                        isValid,
                        hasTimestamp: !!emailTimestamp,
                        emailTimestamp,
                        elapsed
                    };
                },
                args: [lastUsedTimestamp]
            });

            let foundValidCode = false;

            for (const frame of results) {
                const data = frame.result;
                if (data && data.code) {
                    if (data.hasTimestamp) {
                        if (data.isValid) {
                            code = data.code;
                            currentEmailTimestamp = data.emailTimestamp;
                            foundValidCode = true;
                            break;
                        } else {
                            console.log(`Email rejeitado (antigo > 2min ou repetido). Ts: ${data.emailTimestamp}, Decorrido: ${data.elapsed}ms`);
                        }
                    } else {
                        console.log('Frame com código, mas sem timestamp. Ignorando...');
                    }
                }
            }

            if (foundValidCode) break;

            await new Promise(r => setTimeout(r, 3000));
        }

        if (code) {
            console.log('Código NOVO e VÁLIDO encontrado:', code);
            lastUsedTimestamp = currentEmailTimestamp; // Gravar como último utilizado

            // Voltar para a guia de login e colar o MFA
            await chrome.tabs.update(loginTabId, { active: true });
            await sendMessageToTab(loginTabId, {
                action: 'paste_mfa',
                data: { code: code }
            });

            console.log('Aguardando navegação da página de MFA...');
            const stillOnMfa = await waitForMfaResult(loginTabId);

            if (stillOnMfa) {
                console.log('Ainda em auth/mfa. O código pode ser inválido ou expirado. Tentando novamente...');
                // O loop continua, o emailTabId será recarregado no topo
            } else {
                console.log('Concluiu e saiu de auth/mfa. Sucesso!');
                if (emailTabId) {
                    try { await chrome.tabs.remove(emailTabId); } catch (e) { }
                    emailTabId = null;
                }
                mfaResolved = true; // Finaliza loop
            }
        } else {
            console.log('Nenhum código novo e válido encontrado após timeout do email.');
            if (emailTabId) {
                try { await chrome.tabs.remove(emailTabId); } catch (e) { }
                emailTabId = null;
            }
            // Dá um respiro e continua o loop para aguardar um novo email chegar
            await new Promise(r => setTimeout(r, 4000));
        }
    }
}


// Funções de OAuth e Headers
async function generateToken() {
    const credentials = btoa(`${CONFIG.CLIENT_ID}:${CONFIG.CLIENT_SECRET}`);

    const response = await fetch(CONFIG.TOKEN_ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': CONFIG.CONTENT_TYPE,
            'Authorization': `Basic ${credentials}`
        },
        body: new URLSearchParams({
            grant_type: CONFIG.GRANT_TYPE,
            scope: CONFIG.SCOPE
        })
    });

    if (!response.ok) {
        throw new Error(`Falha ao obter token. Status HTTP: ${response.status}`);
    }

    const data = await response.json();
    if (!data.access_token) {
        throw new Error('access_token não encontrado na resposta');
    }

    return data.access_token;
}

async function injectHeaders(token, project) {
    const keyMap = {
        'fin': CONFIG.X_API_KEY_FIN,
        'mar': CONFIG.X_API_KEY_MAR,
        'connect': CONFIG.X_API_KEY_CONNECT,
        'docs': CONFIG.X_API_KEY_DOCS,
        'agent': CONFIG.X_API_KEY_AGENT
    };

    const apiKey = keyMap[project] || CONFIG.X_API_KEY_AGENT;
    console.log(`Usando API Key para ${project}: ${apiKey}`);

    const ruleCondition = {
        resourceTypes: ["main_frame", "xmlhttprequest", "script", "stylesheet", "image"]
    };


    if (CONFIG.BASE_URL && CONFIG.BASE_URL !== "*://*/*") {
        ruleCondition.urlFilter = CONFIG.BASE_URL;
    }

    const rules = [{
        id: 1,
        priority: 1,
        action: {
            type: "modifyHeaders",
            requestHeaders: [
                {
                    header: CONFIG.TOKEN_HEADER_NAME,
                    operation: "set",
                    value: token
                },
                {
                    header: "x-api-key",
                    operation: "set",
                    value: apiKey
                }
            ]
        },
        condition: ruleCondition
    }];

    await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [1],
        addRules: rules
    });
}

async function removeHeaders() {
    await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [1]
    });
}

// Auxiliares
function createTab(url, active = true) {
    return new Promise(resolve => {
        chrome.tabs.create({ url, active }, tab => resolve(tab));
    });
}

function waitForTabLoad(tabId) {
    return new Promise(resolve => {
        chrome.tabs.onUpdated.addListener(function listener(tid, changeInfo, tab) {
            if (tid === tabId && changeInfo.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listener);
                resolve();
            }
        });
    });
}

function waitForMfaPage(tabId) {
    return new Promise(resolve => {
        chrome.tabs.onUpdated.addListener(function listener(tid, changeInfo, tab) {
            // Confirmamos que a aba é a nossa, o carregamento concluiu e a URL mudou
            if (tid === tabId && changeInfo.status === 'complete' && tab.url) {
                // Verificar se a URL contém 'auth/mfa'
                if (tab.url.includes('auth/mfa')) {
                    chrome.tabs.onUpdated.removeListener(listener);
                    resolve();
                }
            }
        });
    });
}

function waitForMfaPageWithTimeout(tabId, timeoutMs) {
    return new Promise(resolve => {
        let isResolved = false;

        function listener(tid, changeInfo, tab) {
            if (tid === tabId && changeInfo.status === 'complete' && tab.url) {
                if (tab.url.includes('auth/mfa')) {
                    if (!isResolved) {
                        isResolved = true;
                        clearTimeout(timer);
                        chrome.tabs.onUpdated.removeListener(listener);
                        resolve(true);
                    }
                }
            }
        }

        const timer = setTimeout(() => {
            if (!isResolved) {
                isResolved = true;
                chrome.tabs.onUpdated.removeListener(listener);
                resolve(false);
            }
        }, timeoutMs);

        chrome.tabs.onUpdated.addListener(listener);
    });
}

function waitForMfaResult(tabId) {
    return new Promise(resolve => {
        let hasNavigatedOrLoaded = false;
        chrome.tabs.onUpdated.addListener(function listener(tid, changeInfo, tab) {
            if (tid === tabId) {
                // Se a URL mudou fisicamente e não é mais mfa, sucesso.
                if (tab.url !== undefined && !tab.url.includes('auth/mfa')) {
                    chrome.tabs.onUpdated.removeListener(listener);
                    resolve(false);
                }
                // Se o carregamento completou (reload) e ainda é mfa
                else if (changeInfo.status === 'complete') {
                    chrome.tabs.get(tabId, (currentTab) => {
                        if (currentTab.url.includes('auth/mfa')) {
                            // Houve navegação (ou DOM completou) mas continuou no mfa
                            chrome.tabs.onUpdated.removeListener(listener);
                            resolve(true);
                        } else {
                            chrome.tabs.onUpdated.removeListener(listener);
                            resolve(false);
                        }
                    });
                }
            }
        });
    });
}

function sendMessageToTab(tabId, message) {
    return new Promise(resolve => {
        chrome.tabs.sendMessage(tabId, message, response => {
            if (chrome.runtime.lastError) {
                resolve(null);
            } else {
                resolve(response);
            }
        });
    });
}
