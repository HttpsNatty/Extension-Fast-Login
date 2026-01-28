chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'start_flow') {
        handleLoginFlow(request.data);
    }
});

async function handleLoginFlow(data) {
    const { loginUrl, emailUrl, login, password, emailIndex } = data;

    try {
        // 1. Abrir página de login
        const loginTab = await createTab(loginUrl);

        // Aguardar carregamento e injecção
        await waitForTabLoad(loginTab.id);
        await chrome.scripting.executeScript({
            target: { tabId: loginTab.id },
            files: ['content.js']
        });

        // Enviar dados de login
        const loginResult = await sendMessageToTab(loginTab.id, {
            action: 'perform_login',
            data: { login, password }
        });

        console.log('Login preenchido:', loginResult);

        // 2. Aguardar 5s para tela de MFA
        console.log('Aguardando 5s pela tela de MFA...');
        await new Promise(resolve => setTimeout(resolve, 5000));

        // 3. Abrir página de email
        const emailTab = await createTab(emailUrl);
        await waitForTabLoad(emailTab.id);

        // Injetar script novamente
        await chrome.scripting.executeScript({
            target: { tabId: emailTab.id },
            files: ['content.js']
        });

        // Extrair código
        let codeResult = null;
        // Tentar várias vezes
        for (let i = 0; i < 5; i++) {
            console.log(`Tentativa de extração ${i + 1}...`);
            codeResult = await sendMessageToTab(emailTab.id, {
                action: 'extract_mfa',
                data: { index: emailIndex }
            });

            if (codeResult && codeResult.code) break;
            await new Promise(r => setTimeout(r, 2000));
        }

        if (codeResult && codeResult.code) {
            console.log('Código encontrado:', codeResult.code);

            // 4. Atualizar para a guia de login
            await chrome.tabs.update(loginTab.id, { active: true });

            // Injetar script novamente
            await chrome.scripting.executeScript({
                target: { tabId: loginTab.id },
                files: ['content.js']
            });

            await sendMessageToTab(loginTab.id, {
                action: 'paste_mfa',
                data: { code: codeResult.code }
            });
        } else {
            console.log('Nenhum código encontrado.');
        }

    } catch (err) {
        console.error('Fluxo falhou:', err);
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
