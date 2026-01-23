document.addEventListener('DOMContentLoaded', () => {
    // 1. Password Logic (calculated)
    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const year = today.getFullYear();
    const password = `${year}${month}${day}-${day}`;

    const pwDisplay = document.getElementById('passwordDisplay');
    if (pwDisplay) pwDisplay.textContent = password;

    // 2. Initialize State
    loadProfiles();
    loadTheme();

    // 3. Event Listeners
    document.getElementById('themeToggle').addEventListener('click', toggleTheme);
    document.getElementById('addProfileBtn').addEventListener('click', () => openEditor());
    document.getElementById('cancelBtn').addEventListener('click', closeEditor);
    document.getElementById('saveBtn').addEventListener('click', saveProfile);
});

// --- LIST & UI FUNCTIONS ---

async function loadProfiles() {
    const data = await chrome.storage.local.get('profiles');
    const profiles = data.profiles || [];
    renderList(profiles);
}

function renderList(profiles) {
    const listEl = document.getElementById('profileList');
    listEl.innerHTML = '';

    if (profiles.length === 0) {
        listEl.innerHTML = '<div class="empty-state" style="text-align:center; padding: 20px; opacity: 0.6;">No profiles yet.</div>';
        return;
    }

    profiles.forEach((p, index) => {
        const card = document.createElement('div');
        card.className = 'profile-card';

        const info = document.createElement('div');
        info.className = 'profile-info';
        info.innerHTML = `
            <span class="profile-name">${p.name}</span>
            <span class="profile-email">${p.login || 'No email'}</span>
        `;

        const actions = document.createElement('div');
        actions.className = 'profile-actions';

        // 1. Rocket (Launch)
        const btnLaunch = createIconBtn('launch', '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M2.925 5.567l14.78 14.78c.366.366.864.535 1.344.475a1.884 1.884 0 0 0 1.637-1.636c.06-.48. -109-978-4.75-14.78a2.535 2.535 0 0 0-3.586-3.586L2.45 15.651c-.366.366-.535.864-.475 1.344.155.908.97 1.572 1.888 1.637.48.06.978-.109 1.344-.475l-.946-.947L17.06 4.619l1.696 1.697L6.164 18.91l-.947-.946A2.533 2.533 0 0 0 2.925 5.567zm16.54 11.89-1.95-1.95 2.56-2.56a.75.75 0 0 1 1.06 1.06l-2.56 2.56 1.95 1.95a.75.75 0 0 1-1.06 1.06zm-6.07-5.01 1.06-1.06 2.89 2.89-1.06 1.06-2.89-2.89z"></path></svg>');
        btnLaunch.innerHTML = '🚀'; // Icon SVG above is weird, using emoji or simplified SVG is safer for now.
        // Let's use simple SVGs for reliability in this string builder
        btnLaunch.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.1 2.1 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 5.42-2.25 7.39a9.7 9.7 0 0 1-3.95 2z"/><path d="M5 20h4v4"/></svg>';
        btnLaunch.onclick = () => runProfile(p);

        // 2. Edit
        const btnEdit = createIconBtn('edit', '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>');
        btnEdit.onclick = () => openEditor(p, index);

        // 3. Copy (Placeholder)
        const btnCopy = createIconBtn('copy', '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>');
        btnCopy.onclick = () => {
            navigator.clipboard.writeText(`${p.login}`);
            updateStatus('Copied to clipboard!', 'green');
        };

        // 4. Delete
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

// --- LOGIC FUNCTIONS ---

function runProfile(profile) {
    updateStatus(`Launching ${profile.name}...`, 'blue');

    // Recalculate password just in case date changed (edge case)
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
            emailIndex: profile.emailIndex || 1
        }
    });
}

function openEditor(profile = null, index = -1) {
    const editor = document.getElementById('editorSection');
    const btn = document.getElementById('addProfileBtn');

    // Hide Add button, show editor
    btn.style.display = 'none';
    editor.classList.remove('hidden');

    // Populate or Clear
    if (profile) {
        document.getElementById('editIndex').value = index;
        document.getElementById('profileName').value = profile.name;
        document.getElementById('projectSelect').value = profile.project || 'visitador';
        document.getElementById('loginUrl').value = profile.loginUrl || 'http://localhost:3000';
        document.getElementById('emailUrl').value = profile.emailUrl || 'https://mail.google.com';
        document.getElementById('loginInput').value = profile.login || '';
        document.getElementById('emailIndex').value = profile.emailIndex || 1;
    } else {
        document.getElementById('editIndex').value = -1;
        document.getElementById('profileName').value = '';
        document.getElementById('loginInput').value = '';
        // Keep URLs as defaults
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
        updateStatus('Name is required', 'red');
        return;
    }

    const profileData = {
        name,
        project: document.getElementById('projectSelect').value,
        loginUrl: document.getElementById('loginUrl').value,
        emailUrl: document.getElementById('emailUrl').value,
        login: document.getElementById('loginInput').value,
        emailIndex: document.getElementById('emailIndex').value
    };

    const data = await chrome.storage.local.get('profiles');
    let profiles = data.profiles || [];

    if (index >= 0) {
        profiles[index] = profileData; // Update
    } else {
        profiles.push(profileData); // Create
    }

    await chrome.storage.local.set({ profiles });
    loadProfiles();
    closeEditor();
    updateStatus('Profile saved!', 'green');
}

async function deleteProfile(index) {
    if (confirm('Delete this profile?')) {
        const data = await chrome.storage.local.get('profiles');
        let profiles = data.profiles || [];
        profiles.splice(index, 1);
        await chrome.storage.local.set({ profiles });
        loadProfiles();
    }
}

// --- THEME FUNCTIONS ---

function loadTheme() {
    const theme = localStorage.getItem('theme') || 'theme-pink';
    document.body.className = theme;
}

function toggleTheme() {
    const current = document.body.className;
    const newTheme = current === 'theme-pink' ? 'theme-dark' : 'theme-pink';
    document.body.className = newTheme;
    localStorage.setItem('theme', newTheme);
}

function updateStatus(msg, color) {
    const statusEl = document.getElementById('status');
    statusEl.textContent = msg;
    statusEl.style.color = color || 'black';
}
