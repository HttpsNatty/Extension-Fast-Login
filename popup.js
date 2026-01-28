
const translations = {
    en: {
        appTitle: "Fast Login",
        noProfiles: "No profiles yet. Add a profile below!",
        addProfile: "Add a profile",
        manageProfile: "Manage Profile",
        profileName: "Profile Name",
        project: "Project",
        loginUrl: "Login URL",
        emailUrl: "Email URL",
        loginEmail: "Login (Email)",
        password: "Password:",
        save: "Save",
        cancel: "Cancel",
        deleteConfirm: "Delete this profile?",
        nameRequired: "Name is required",
        profileSaved: "Profile saved!",
        copied: "Copied to clipboard!",
        launching: "Launching",
        emailIndex: "Email Index"
    },
    pt: {
        appTitle: "Login Rápido",
        noProfiles: "Nenhum perfil encontrado. Adicione um abaixo!",
        addProfile: "Adicionar perfil",
        manageProfile: "Gerenciar Perfil",
        profileName: "Nome do Perfil",
        project: "Projeto",
        loginUrl: "URL de Login",
        emailUrl: "URL do Email",
        loginEmail: "Login (Email)",
        password: "Senha:",
        save: "Salvar",
        cancel: "Cancelar",
        deleteConfirm: "Excluir este perfil?",
        nameRequired: "Nome é obrigatório",
        profileSaved: "Perfil salvo!",
        copied: "Copiado para a área de transferência!",
        launching: "Iniciando",
        emailIndex: "Índice do Email"
    }
};

let currentLang = 'pt';
let currentAccent = 'pink';
let currentMode = 'light';

document.addEventListener('DOMContentLoaded', () => {

    // 1. Lógica de Senha (calculada)
    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const year = today.getFullYear();
    const password = `${year}${month}${day}-${day}`;

    const pwDisplay = document.getElementById('passwordDisplay');
    if (pwDisplay) pwDisplay.textContent = password;

    // 2. Estado Inicial
    loadProfiles();

    // 3. Ouvintes de Eventos
    document.getElementById('langToggle').addEventListener('click', toggleLanguage);
    document.getElementById('colorToggle').addEventListener('click', cycleColorTheme);
    document.getElementById('themeToggle').addEventListener('click', toggleDarkMode);

    document.getElementById('addProfileBtn').addEventListener('click', () => openEditor());
    document.getElementById('cancelBtn').addEventListener('click', closeEditor);
    document.getElementById('saveBtn').addEventListener('click', saveProfile);
});

// --- FUNÇÕES DE LISTA E UI ---

async function loadProfiles() {
    const data = await chrome.storage.local.get('profiles');
    const profiles = data.profiles || [];
    renderList(profiles);
}

function renderList(profiles) {
    const listEl = document.getElementById('profileList');
    listEl.innerHTML = '';

    if (profiles.length === 0) {
        listEl.innerHTML = '<div class="empty-state" style="text-align:center; padding: 20px; opacity: 0.6;">Ainda sem perfis.</div>';
        return;
    }

    profiles.forEach((p, index) => {
        const card = document.createElement('div');
        card.className = 'profile-card';

        const info = document.createElement('div');
        info.className = 'profile-info';
        info.innerHTML = `
            <span class="profile-name">${p.name}</span>
            <span class="profile-email">${p.login || 'Sem email'}</span>
        `;

        const actions = document.createElement('div');
        actions.className = 'profile-actions';

        // 1. Foguete (Lançar)
        const btnLaunch = createIconBtn('launch', '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.1 2.1 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 5.42-2.25 7.39a9.7 9.7 0 0 1-3.95 2z"/><path d="M5 20h4v4"/></svg>');
        btnLaunch.onclick = () => runProfile(p);

        // 2. Editar
        const btnEdit = createIconBtn('edit', '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>');
        btnEdit.onclick = () => openEditor(p, index);

        // 3. Copiar
        const btnCopy = createIconBtn('copy', '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>');
        btnCopy.onclick = () => {
            navigator.clipboard.writeText(`${p.login}`);
            updateStatus(translations[currentLang].copied, 'green');
        };

        // 4. Excluir
        const btnDelete = createIconBtn('delete', '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>');
        btnDelete.onclick = () => deleteProfile(index);

        actions.appendChild(btnLaunch);
        actions.appendChild(btnEdit);
        actions.appendChild(btnCopy);
        actions.appendChild(btnDelete);

        card.appendChild(info);
        card.appendChild(actions);
        listEl.appendChild(card);
    });
}

function createIconBtn(className, innerHTML) {
    const btn = document.createElement('button');
    btn.className = `icon-btn ${className}`;
    btn.innerHTML = innerHTML;
    return btn;
}

// --- FUNÇÕES LÓGICAS ---

function runProfile(profile) {
    updateStatus(`${translations[currentLang].launching} ${profile.name}...`, 'blue');

    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const year = today.getFullYear();
    const password = `${year}${month}${day}-${day}`;

    chrome.runtime.sendMessage({
        action: 'start_flow',
        data: {
            project: profile.project || 'visitador',
            loginUrl: profile.loginUrl || 'http://localhost:3000',
            emailUrl: profile.emailUrl || 'https://mail.google.com',
            login: profile.login,
            password: password,
            emailIndex: 1
        }
    });
}

function openEditor(profile = null, index = -1) {
    const editor = document.getElementById('editorSection');
    const btn = document.getElementById('addProfileBtn');

    // Esconder botão Adicionar, mostrar editor
    btn.style.display = 'none';
    editor.classList.remove('hidden');

    // Preencher ou Limpar
    if (profile) {
        document.getElementById('editIndex').value = index;
        document.getElementById('profileName').value = profile.name;
        document.getElementById('projectSelect').value = profile.project || 'visitador';
        document.getElementById('loginUrl').value = profile.loginUrl || 'http://localhost:3000';
        document.getElementById('emailUrl').value = profile.emailUrl || 'https://mail.google.com';
        document.getElementById('loginInput').value = profile.login || '';
    } else {
        document.getElementById('editIndex').value = -1;
        document.getElementById('profileName').value = '';
        document.getElementById('loginInput').value = '';
    }
}

function closeEditor() {
    document.getElementById('editorSection').classList.add('hidden');
    document.getElementById('addProfileBtn').style.display = 'block';
    updateStatus('', 'black');
}

async function saveProfile() {
    const index = parseInt(document.getElementById('editIndex').value);
    const name = document.getElementById('profileName').value;

    if (!name) {
        updateStatus(translations[currentLang].nameRequired, 'red');
        return;
    }

    const profileData = {
        name,
        project: document.getElementById('projectSelect').value,
        loginUrl: document.getElementById('loginUrl').value,
        emailUrl: document.getElementById('emailUrl').value,
        login: document.getElementById('loginInput').value,
    };

    const data = await chrome.storage.local.get('profiles');
    let profiles = data.profiles || [];

    if (index >= 0) {
        profiles[index] = profileData;
    } else {
        profiles.push(profileData);
    }

    await chrome.storage.local.set({ profiles });
    // Re-renderizar lista para garantir que o texto traduzido seja aplicado se o idioma mudou
    await loadProfiles();
    closeEditor();
    updateStatus(translations[currentLang].profileSaved, 'green');
}

async function deleteProfile(index) {
    if (confirm(translations[currentLang].deleteConfirm)) {
        const data = await chrome.storage.local.get('profiles');
        let profiles = data.profiles || [];
        profiles.splice(index, 1);
        await chrome.storage.local.set({ profiles });
        loadProfiles();
    }
}

// --- FUNÇÕES DE TEMA ---

function loadSettings() {
    // 1. Language
    currentLang = localStorage.getItem('language') || 'pt';
    applyLanguage(currentLang);

    // 2. Tema (Modo + Destaque)
    currentMode = localStorage.getItem('themeMode') || 'light';
    currentAccent = localStorage.getItem('themeAccent') || 'pink';
    applyTheme();
}

function toggleLanguage() {
    currentLang = currentLang === 'en' ? 'pt' : 'en';
    localStorage.setItem('language', currentLang);
    applyLanguage(currentLang);
    loadProfiles(); // Atualizar lista para atualizar texto de estado vazio
}

function applyLanguage(lang) {
    const t = translations[lang];
    document.getElementById('appTitle').textContent = t.appTitle;
    document.getElementById('addProfileBtn').textContent = t.addProfile;
    document.querySelector('#editorSection h3').textContent = t.manageProfile;

    // Labels
    updateLabel('profileName', t.profileName);
    updateLabel('projectSelect', t.project);
    updateLabel('loginUrl', t.loginUrl);
    updateLabel('emailUrl', t.emailUrl);
    updateLabel('loginInput', t.loginEmail);
    // updateLabel('emailIndex', t.emailIndex); // Campo removido

    document.getElementById('saveBtn').textContent = t.save;
    document.getElementById('cancelBtn').textContent = t.cancel;

    const pwContainer = document.querySelector('.info-group');
    if (pwContainer && pwContainer.firstChild) {
        pwContainer.firstChild.textContent = t.password + ' ';
    }
}

function updateLabel(inputId, text) {
    const input = document.getElementById(inputId);
    if (input && input.parentElement) {
        const label = input.parentElement.querySelector('label');
        if (label) label.textContent = text;
    }
}

function cycleColorTheme() {
    const accents = ['pink', 'blue', 'green'];
    const currentIdx = accents.indexOf(currentAccent);
    const nextIdx = (currentIdx + 1) % accents.length;
    currentAccent = accents[nextIdx];

    localStorage.setItem('themeAccent', currentAccent);
    applyTheme();
}

function toggleDarkMode() {
    currentMode = currentMode === 'light' ? 'dark' : 'light';
    localStorage.setItem('themeMode', currentMode);
    applyTheme();
}

function applyTheme() {
    // Redefinir classes
    document.body.className = '';

    // Adicionar Modo
    if (currentMode === 'dark') {
        document.body.classList.add('theme-dark');
    }

    // Adicionar Destaque
    // Apenas adicionar classe se NÃO for rosa (já que rosa é padrão nas variáveis CSS)
    document.body.classList.add(`accent-${currentAccent}`);

    // Atualizar Ícone do Modo Escuro (Lua vs Sol)
    const themeBtn = document.getElementById('themeToggle');
    if (themeBtn) {
        if (currentMode === 'dark') {
            // Ícone do Sol
            themeBtn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>';
        } else {
            // Ícone da Lua
            themeBtn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>';
        }
    }
}

function updateStatus(msg, color) {
    const statusEl = document.getElementById('status');
    if (statusEl) {
        statusEl.textContent = msg;
        statusEl.style.color = color || 'black';
        // Forçar visibilidade no modo escuro se necessário, mas o estilo lida com a cor
        if (currentMode === 'dark' && (!color || color === 'black')) {
            statusEl.style.color = '#ccc';
        }
    }
}
