console.log('Script de Login Automático Ativo');

// Ouvinte
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'check_login_fields') {
        const loginField =
            document.querySelector('.mantine-TextInput-input') ||
            document.querySelector('input[placeholder="Digite aqui"]:not([type="password"])') ||
            document.querySelector('input[type="email"]') ||
            document.querySelector('input[type="text"]:not([type="hidden"])');

        const passwordField =
            document.querySelector('input[type="password"]') ||
            document.querySelector('.mantine-PasswordInput-innerInput');

        const isPresent = !!(loginField && passwordField);
        console.log('Verificação de campos de login:', isPresent);
        sendResponse({ present: isPresent });

    } else if (request.action === 'perform_login') {
        const { login, password, project } = request.data;
        console.log(`Tentando login no projeto ${project || 'desconhecido'}...`);

        function waitForFields(retries = 20, interval = 500) {
            return new Promise((resolve) => {
                const check = () => {
                    console.log('Procurando campos... tentativas restantes:', retries);

                    let loginField =
                        (project === 'fin' && document.querySelector('input[data-path="login"]')) ||
                        document.querySelector('.mantine-TextInput-input') ||
                        document.querySelector('input[placeholder="Digite aqui"]:not([type="password"])') ||
                        document.querySelector('input[type="email"]') ||
                        document.querySelector('input[type="text"]:not([type="hidden"])');

                    let passwordField =
                        document.querySelector('input[data-path="password"]') ||
                        document.querySelector('input[name="password"]') ||
                        document.querySelector('input[autocomplete="current-password"]') ||
                        document.querySelector('input[placeholder="Senha"]') ||
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
                    const prototype = Object.getPrototypeOf(element);
                    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

                    element.focus();
                    if (setter) {
                        setter.call(element, value);
                    } else {
                        element.value = value;
                    }

                    const event = new Event('input', { bubbles: true });
                    event.simulated = true;
                    const tracker = element._valueTracker;
                    if (tracker) {
                        tracker.setValue(lastValue);
                    }
                    element.dispatchEvent(event);
                    element.dispatchEvent(new Event('change', { bubbles: true }));
                };

                setNativeValue(passwordField, password);
                setNativeValue(loginField, login);

                console.log('Credenciais preenchidas:', {
                    login: loginField.value,
                    passwordFilled: Boolean(passwordField.value)
                });

                const submitBtn = Array.from(document.querySelectorAll('button')).find(b => {
                    const text = b.textContent?.trim().toUpperCase();
                    return text && ['ENTRAR', 'LOGIN', 'SIGN IN', 'ACESSAR'].some(label => text.includes(label));
                })
                    || document.querySelector('button[type="submit"]');

                if (submitBtn) {
                    console.log('Clicando em enviar...');
                    setTimeout(() => {
                        if (passwordField.value !== password) {
                            console.warn('Senha foi resetada pelo formulário. Reaplicando antes do login.');
                            setNativeValue(passwordField, password);
                        }
                        submitBtn.click();
                        sendResponse({ status: 'success', message: 'Credentials filled and login clicked' });
                    }, 500);
                    return;
                } else {
                    console.warn('Botão de envio não encontrado automaticamente.');
                    sendResponse({ status: 'error', message: 'Login button not found' });
                    return;
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
            if (validateBtn) {
                validateBtn.click();
                sendResponse({ status: 'success', message: 'MFA filled and submitted' });
            } else {
                sendResponse({ status: 'error', message: 'MFA validation button not found' });
            }
        }, 500);

        return true;
    }
});
