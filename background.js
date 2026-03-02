chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'start_flow') {
        runFlow(request.data);
    }
});

async function runFlow(data) {
    const { loginUrl, emailUrl, login, password, emailIndex } = data;

    try {
        console.log('Iniciando fluxo...');

        // 1. Abrir e Carregar Aba de Login
        const loginTab = await createTab(loginUrl);
        await waitForTabLoad(loginTab.id);

        // 2. Verificar se precisa logar
        const needsLogin = await checkLoginState(loginTab.id);

        if (needsLogin) {
            console.log('Campos de login detectados. Executando login...');
            // Injeção manual é redundante se o manifesto já cuida disso, mas para garantir o content script:
            // A injeção automática ocorre no 'complete', então já deve estar lá.

            await executeLogin(loginTab.id, login, password);

            // Se tiver URL de email, prosseguir para MFA
            if (emailUrl) {
                console.log('URL de email fornecida. Iniciando fluxo MFA...');
                await executeMFA(loginTab.id, emailUrl, emailIndex);
            } else {
                console.log('Sem URL de email. MFA pulado.');
            }

        } else {
            console.log('Campos de login NÃO detectados. Assumindo usuário já logado.');
            // Se já está logado, talvez não precise de MFA? 
            // Ou talvez a sessão expirou só parcialmente? 
            // Por segurança, vamos assumir que se não tem campo de login, o fluxo terminou com sucesso (dashboard).
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

async function executeMFA(loginTabId, emailUrl, emailIndex) {
    // 1. Aguardar navegação para a tela de MFA
    console.log('Aguardando navegação para tela de MFA...');
    await waitForMfaPage(loginTabId);

    let mfaResolved = false;
    let lastUsedTimestamp = null; // Guardar o timestamp do último email processado

    while (!mfaResolved) {
        // 2. Abrir página de email silenciosamente
        const emailTab = await createTab(emailUrl, false);
        await waitForTabLoad(emailTab.id);

        let code = null;
        let currentEmailTimestamp = null;

        // Tentar buscar email
        for (let i = 0; i < 5; i++) {
            console.log(`Tentativa de extração ${i + 1}...`);

            const results = await chrome.scripting.executeScript({
                target: { tabId: emailTab.id, allFrames: true },
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

            await new Promise(r => setTimeout(r, 2000));
        }

        if (code) {
            console.log('Código NOVO e VÁLIDO encontrado:', code);
            lastUsedTimestamp = currentEmailTimestamp; // Gravar como último utilizado

            // Pode fechar o email para limpar
            try { await chrome.tabs.remove(emailTab.id); } catch (e) { }

            // Voltar para a guia de login e colar o MFA
            await chrome.tabs.update(loginTabId, { active: true });
            await sendMessageToTab(loginTabId, {
                action: 'paste_mfa',
                data: { code: code }
            });

            console.log('Aguardando navegação da página de MFA...');
            const stillOnMfa = await waitForMfaResult(loginTabId);

            if (stillOnMfa) {
                console.log('Ainda em auth/mfa. Reexecutando o processo...');
                // O loop continua
            } else {
                console.log('Concluiu e saiu de auth/mfa. Fluxo encerrado!');
                mfaResolved = true; // Finaliza loop
            }
        } else {
            console.log('Nenhum código novo e válido encontrado após timeout do email.');
            try { await chrome.tabs.remove(emailTab.id); } catch (e) { }
            // Dá um respiro e continua o loop para aguardar um novo email chegar
            await new Promise(r => setTimeout(r, 4000));
        }
    }
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
