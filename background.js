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
    // 1. Aguardar 5s para tela de MFA carregar após o submit do login
    console.log('Aguardando 5s pela tela de MFA...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 2. Abrir página de email
    const emailTab = await createTab(emailUrl);
    await waitForTabLoad(emailTab.id);

    // 3. Extrair código
    let code = null;
    // Tentar várias vezes
    for (let i = 0; i < 5; i++) {
        console.log(`Tentativa de extração ${i + 1}...`);

        // Usar executeScript para buscar em TODOS os frames (necessário para emails)
        const results = await chrome.scripting.executeScript({
            target: { tabId: emailTab.id, allFrames: true },
            func: () => {
                const codeRegex = /(?:Code:\s*|Verification Code:\s*)(\d{6})|\b(\d{6})\b/;
                const bodyText = document.body.innerText;
                const match = bodyText.match(codeRegex);
                return match ? (match[1] || match[2]) : null;
            }
        });

        // Verificar se algum frame retornou o código
        const foundFrame = results.find(r => r.result);
        if (foundFrame) {
            code = foundFrame.result;
            break;
        }

        await new Promise(r => setTimeout(r, 2000));
    }

    if (code) {
        console.log('Código encontrado:', code);

        // 4. Fechar aba de email (opcional, mas limpo)
        // await chrome.tabs.remove(emailTab.id); 

        // 5. Voltar para a guia de login e colar
        await chrome.tabs.update(loginTabId, { active: true });

        await sendMessageToTab(loginTabId, {
            action: 'paste_mfa',
            data: { code: code }
        });
    } else {
        console.log('Nenhum código encontrado.');
    }
}


// Auxiliares
function createTab(url) {
    return new Promise(resolve => {
        chrome.tabs.create({ url }, tab => resolve(tab));
    });
}

function waitForTabLoad(tabId) {
    return new Promise(resolve => {
        chrome.tabs.onUpdated.addListener(function listener(tid, changeInfo) {
            if (tid === tabId && changeInfo.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listener);
                resolve();
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
