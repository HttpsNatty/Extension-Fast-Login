console.log('Auto Login Content Script Active');

// Listen for messages from background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'perform_login') {
        const { login, password } = request.data;
        console.log('Attempting login on Visitador...');

        // Polling function to wait for elements
        function waitForFields(retries = 20, interval = 500) {
            return new Promise((resolve) => {
                const check = () => {
                    console.log('Searching for fields... attempts left:', retries);

                    let loginField =
                        document.querySelector('.mantine-TextInput-input') ||
                        document.querySelector('input[placeholder="Digite aqui"]:not([type="password"])') ||
                        document.querySelector('input[type="text"]:not([type="hidden"])');

                    let passwordField =
                        document.querySelector('input[type="password"]') ||
                        document.querySelector('.mantine-PasswordInput-innerInput');

                    if (loginField && passwordField) {
                        resolve({ loginField, passwordField });
                    } else if (retries > 0) {
                        retries--;
                        setTimeout(check, interval);
                    } else {
                        resolve(null);
                    }
                };
                check();
            });
        }

        waitForFields().then((fields) => {
            if (fields) {
                const { loginField, passwordField } = fields;
                console.log('Fields found via polling:', fields);

                // Helper to modify React inputs (Robust Version)
                const setNativeValue = (element, value) => {
                    const lastValue = element.value;
                    element.value = value;
                    const event = new Event('input', { bubbles: true });
                    // Hack for React 15/16
                    event.simulated = true;
                    // Hack for React 16+
                    const tracker = element._valueTracker;
                    if (tracker) {
                        tracker.setValue(lastValue);
                    }
                    element.dispatchEvent(event);
                    element.dispatchEvent(new Event('change', { bubbles: true }));
                };

                setNativeValue(loginField, login);
                setNativeValue(passwordField, password);

                console.log('Credentials filled.');

                const submitBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.toUpperCase().includes('ENTRAR'))
                    || document.querySelector('button[type="submit"]');

                if (submitBtn) {
                    console.log('Clicking submit...');
                    setTimeout(() => submitBtn.click(), 500);
                } else {
                    console.warn('Submit button not found automatically.');
                }

                sendResponse({ status: 'success', message: 'Credentials filled' });
            } else {
                console.error('Time out: Login fields not found.');
                sendResponse({ status: 'error', message: 'Fields not found after waiting' });
            }
        });

        return true;

    } else if (request.action === 'extract_mfa') {
        console.log('Attempting to extract MFA...');
        const codeRegex = /(?:Code:\s*|Verification Code:\s*)(\d{6})|\b(\d{6})\b/;
        const bodyText = document.body.innerText;
        const match = bodyText.match(codeRegex);
        const code = match ? (match[1] || match[2]) : null;

        if (code) {
            console.log('Code found:', code);
            sendResponse({ status: 'success', code: code });
        } else {
            sendResponse({ status: 'error', message: 'Code not found' });
        }

    } else if (request.action === 'paste_mfa') {
        const { code } = request.data;
        console.log('Pasting MFA code:', code);

        // Helper for React Pins
        const setNativeValue = (element, value) => {
            const lastValue = element.value;
            element.value = value;
            const event = new Event('input', { bubbles: true });
            event.simulated = true;
            const tracker = element._valueTracker;
            if (tracker) {
                tracker.setValue(lastValue);
            }
            element.dispatchEvent(event);
            element.dispatchEvent(new Event('change', { bubbles: true }));
        };

        const pinInputs = document.querySelectorAll('div[class*="mantine-PinInput"] input, input[class*="mantine-PinInput"]');

        if (pinInputs.length > 0) {
            const chars = code.split('');
            chars.forEach((char, i) => {
                if (pinInputs[i]) {
                    setNativeValue(pinInputs[i], char);
                }
            });
        } else {
            const codeInput = document.querySelector('input[type="tel"], input[inputmode="numeric"], input[name="code"]');
            if (codeInput) {
                setNativeValue(codeInput, code);
            }
        }

        setTimeout(() => {
            const validateBtn = Array.from(document.querySelectorAll('button')).find(b =>
                b.textContent && b.textContent.toUpperCase().includes('VALIDAR')
            );
            if (validateBtn) validateBtn.click();
        }, 500);

        sendResponse({ status: 'success' });
    }
});
