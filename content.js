console.log('Script de Login Automático Ativo');

// Ouvinte
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'check_login_fields') {
        const loginField =
            document.querySelector('.mantine-TextInput-input') ||
            document.querySelector('input[placeholder="Digite aqui"]:not([type="password"])') ||
            document.querySelector('input[type="text"]:not([type="hidden"])');

        const passwordField =
            document.querySelector('input[type="password"]') ||
            document.querySelector('.mantine-PasswordInput-innerInput');

        const isPresent = !!(loginField && passwordField);
        console.log('Verificação de campos de login:', isPresent);
        sendResponse({ present: isPresent });

    } else if (request.action === 'perform_login') {
        const { login, password } = request.data;
        console.log('Tentando login no Visitador...');

        function waitForFields(retries = 20, interval = 500) {
            return new Promise((resolve) => {
                const check = () => {
                    console.log('Procurando campos... tentativas restantes:', retries);

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
                console.log('Campos encontrados via polling:', fields);

                // Auxiliar
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

                setNativeValue(loginField, login);
                setNativeValue(passwordField, password);

                console.log('Credenciais preenchidas.');

                const submitBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.toUpperCase().includes('ENTRAR'))
                    || document.querySelector('button[type="submit"]');

                if (submitBtn) {
                    console.log('Clicando em enviar...');
                    setTimeout(() => submitBtn.click(), 500);
                } else {
                    console.warn('Botão de envio não encontrado automaticamente.');
                }

                sendResponse({ status: 'success', message: 'Credentials filled' });
            } else {
                console.error('Tempo esgotado: Campos de login não encontrados.');
                sendResponse({ status: 'error', message: 'Fields not found after waiting' });
            }
        });

        return true;

    } else if (request.action === 'extract_mfa') {
        console.log('Tentando extrair MFA...');
        const codeRegex = /(?:Code:\s*|Verification Code:\s*)(\d{6})|\b(\d{6})\b/;
        const bodyText = document.body.innerText;
        const match = bodyText.match(codeRegex);
        const code = match ? (match[1] || match[2]) : null;

        if (code) {
            console.log('Código encontrado:', code);
            sendResponse({ status: 'success', code: code });
        } else {
            sendResponse({ status: 'error', message: 'Code not found' });
        }

    } else if (request.action === 'paste_mfa') {
        const { code } = request.data;
        console.log('Colando código MFA:', code);

        // Auxiliar para Pins React
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
