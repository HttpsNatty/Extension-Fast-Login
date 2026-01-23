chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'start_flow') {
        handleLoginFlow(request.data);
    }
});

async function handleLoginFlow(data) {
    const { loginUrl, emailUrl, login, password, emailIndex } = data;

    try {
        // 1. Open Login Page
        const loginTab = await createTab(loginUrl);

        // Wait for load and inject
        await waitForTabLoad(loginTab.id);
        await chrome.scripting.executeScript({
            target: { tabId: loginTab.id },
            files: ['content.js']
        });

        // Send Login Data
        const loginResult = await sendMessageToTab(loginTab.id, {
            action: 'perform_login',
            data: { login, password }
        });

        console.log('Login filled:', loginResult);

        // 2. Wait 15s for MFA (as requested)
        console.log('Waiting 5s for MFA screen...');
        await new Promise(resolve => setTimeout(resolve, 5000));

        // 3. Open Email Page
        const emailTab = await createTab(emailUrl);
        await waitForTabLoad(emailTab.id);

        // Inject script again
        await chrome.scripting.executeScript({
            target: { tabId: emailTab.id },
            files: ['content.js']
        });

        // Extract Code
        let codeResult = null;
        // Retry a few times
        for (let i = 0; i < 5; i++) {
            console.log(`Extraction attempt ${i + 1}...`);
            codeResult = await sendMessageToTab(emailTab.id, {
                action: 'extract_mfa',
                data: { index: emailIndex }
            });

            if (codeResult && codeResult.code) break;
            await new Promise(r => setTimeout(r, 2000));
        }

        if (codeResult && codeResult.code) {
            console.log('Code found:', codeResult.code);

            // 4. Switch back and paste
            await chrome.tabs.update(loginTab.id, { active: true });

            // Re-inject simply to ensure context is alive
            await chrome.scripting.executeScript({
                target: { tabId: loginTab.id },
                files: ['content.js']
            });

            await sendMessageToTab(loginTab.id, {
                action: 'paste_mfa',
                data: { code: codeResult.code }
            });
        } else {
            console.log('No code found.');
        }

    } catch (err) {
        console.error('Flow failed:', err);
    }
}

// Helpers
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
                resolve(null); // Handle dropped connection
            } else {
                resolve(response);
            }
        });
    });
}
