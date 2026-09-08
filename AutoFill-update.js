// ==UserScript==
// @name         AUTOFILL v7.8 #RT
// @namespace    https://tampermonkey.net/
// @version      7.8
// @description  AUTOFILL v7.8 #RT - Post-upgrade success announcement, "Up to date" status, and manual GitHub updater.
// @match        *://*/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @connect      autofill-keys.darort07.workers.dev
// @connect      raw.githubusercontent.com
// @connect      githubusercontent.com
// @connect      *
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/darort/blockname/main/AutoFill-update.js
// @downloadURL  https://raw.githubusercontent.com/darort/blockname/main/AutoFill-update.js
// ==/UserScript==

(function () {
    'use strict';

    // =========================================================================
    // 0. CONFIGURATION & REPOSITORY LINKS
    // =========================================================================
    const CURRENT_VERSION = '7.8';

    // Live Cloudflare Worker
    const RAW_API_URL = 'https://autofill-keys.darort07.workers.dev';
    const LICENSE_API_URL = RAW_API_URL.replace(/\/+$/, '');

    // GitHub Raw Script URL
    const GITHUB_RAW_SCRIPT_URL = 'https://raw.githubusercontent.com/darort/blockname/main/AutoFill-update.js';

    // Storage Keys
    const STORAGE_PROFILES = 'af_profiles_db';
    const STORAGE_DOMAIN_ACTIVE = 'af_domain_active_map';
    const STORAGE_UI_STATE = 'af_ui_state'; // 'expanded' | 'hidden'
    const STORAGE_LICENSE = 'af_license_key';
    const STORAGE_DEVICE_ID = 'af_unique_device_id';
    const STORAGE_INSTALLED_VER = 'af_installed_version_tracker';
    const STORAGE_NOTIFIED_VERSION = 'af_last_notified_update_version';

    let isActivated = false;
    let currentActiveLicense = GM_getValue(STORAGE_LICENSE, '');

    // =========================================================================
    // 1. HARDWARE FINGERPRINT ENGINE
    // =========================================================================
    function getMachineFingerprint() {
        let machineId = GM_getValue(STORAGE_DEVICE_ID, null);
        if (!machineId) {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            ctx.textBaseline = 'top';
            ctx.font = "14px 'Arial'";
            ctx.fillText("RT-AUTOFILL-v77", 2, 2);
            const rawHash = btoa(canvas.toDataURL() + screen.width + 'x' + screen.height + navigator.hardwareConcurrency);
            const cleanHash = rawHash.replace(/[^a-zA-Z0-9]/g, '').slice(-8).toUpperCase();

            machineId = `PC-${cleanHash}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
            GM_setValue(STORAGE_DEVICE_ID, machineId);
        }
        return machineId;
    }

    // =========================================================================
    // 2. CLOUDFLARE LICENSE NETWORK DISPATCHER
    // =========================================================================
    function callLicenseAPI(action, licenseKey, callback) {
        const machineId = getMachineFingerprint();

        GM_xmlhttpRequest({
            method: 'POST',
            url: LICENSE_API_URL,
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            data: JSON.stringify({ action, licenseKey, machineId }),
            timeout: 10000,
            onload: function (response) {
                try {
                    const res = JSON.parse(response.responseText);
                    if (response.status === 200 && (res.status === 'valid' || res.status === 'success')) {
                        callback(true, res.message);
                    } else {
                        callback(false, res.message || `Server error (${response.status})`);
                    }
                } catch {
                    callback(false, 'Invalid response from Cloudflare.');
                }
            },
            onerror: function () {
                callback(false, 'Cannot reach Cloudflare. Check connection.');
            },
            ontimeout: function () {
                callback(false, 'Cloudflare connection timed out.');
            }
        });
    }

    // =========================================================================
    // 3. GITHUB UPDATE CHECKER & VERSION COMPARATOR
    // =========================================================================
    function compareVersions(remote, current) {
        const rParts = remote.split('.').map(Number);
        const cParts = current.split('.').map(Number);
        for (let i = 0; i < Math.max(rParts.length, cParts.length); i++) {
            const r = rParts[i] || 0;
            const c = cParts[i] || 0;
            if (r > c) return true;
            if (r < c) return false;
        }
        return false;
    }

    function checkGitHubForUpdates(onResult) {
        GM_xmlhttpRequest({
            method: 'GET',
            url: `${GITHUB_RAW_SCRIPT_URL}?t=${Date.now()}`,
            timeout: 8000,
            onload: function (response) {
                if (response.status === 200) {
                    const match = response.responseText.match(/@version\s+([0-9.]+)/i);
                    if (match && match[1]) {
                        const remoteVersion = match[1].trim();
                        if (compareVersions(remoteVersion, CURRENT_VERSION)) {
                            onResult(true, remoteVersion);
                            return;
                        }
                    }
                }
                onResult(false, CURRENT_VERSION);
            },
            onerror: function () {
                onResult(false, CURRENT_VERSION);
            }
        });
    }

    // =========================================================================
    // 4. ACTIVATION MODAL
    // =========================================================================
    function openLicenseManagerModal(customNotice = '', isError = false) {
        const existing = document.getElementById('af-activate-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'af-activate-modal';
        Object.assign(modal.style, {
            position: 'fixed',
            inset: '0',
            background: 'rgba(10, 15, 29, 0.82)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: '2147483647',
            fontFamily: 'system-ui, sans-serif'
        });

        const machineId = getMachineFingerprint();
        const storedKey = GM_getValue(STORAGE_LICENSE, '');

        modal.innerHTML = `
            <div style="background:#0f172a; border:1px solid #334155; border-radius:12px; width:450px; padding:24px; box-shadow:0 24px 60px rgba(0,0,0,0.75); color:#f8fafc; position:relative;">
                <button id="af-close-license-modal" style="position:absolute; top:14px; right:14px; background:transparent; border:none; color:#94a3b8; font-size:18px; cursor:pointer; padding:4px;" title="Close">✕</button>
                
                <div style="text-align:center; margin-bottom:14px;">
                    <div style="font-size:26px; margin-bottom:4px;">⚡</div>
                    <h3 style="margin:0; font-size:18px; color:#38bdf8; letter-spacing:0.5px;">AUTOFILL v${CURRENT_VERSION} #RT</h3>
                    <p style="font-size:12px; color:#94a3b8; margin:4px 0 0 0;">Hardware Locked (1 PC) • Cloudflare Protected</p>
                </div>

                <div style="background:#1e293b; padding:10px; border-radius:6px; font-family:monospace; font-size:11px; margin-bottom:14px; border:1px solid #334155;">
                    <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                        <span style="color:#94a3b8;">Device ID:</span>
                        <span style="color:#38bdf8; font-weight:700;">${machineId}</span>
                    </div>
                    <div style="display:flex; justify-content:space-between;">
                        <span style="color:#94a3b8;">License Status:</span>
                        <span style="color:${isActivated ? '#22c55e' : '#ef4444'}; font-weight:700;">${isActivated ? 'ACTIVATED' : 'NOT ACTIVATED'}</span>
                    </div>
                </div>

                <div id="af-modal-msg" style="font-size:12px; margin-bottom:12px; display:${customNotice ? 'block' : 'none'}; background:${isError ? '#ef444415' : '#0284c722'}; color:${isError ? '#ef4444' : '#38bdf8'}; padding:8px; border-radius:4px; border:1px solid ${isError ? '#ef444444' : '#0284c744'};">
                    ${customNotice}
                </div>

                <label style="display:block; font-size:11px; color:#cbd5e1; margin-bottom:6px; font-weight:600;">ENTER LICENSE KEY:</label>
                <input id="af-license-input" placeholder="e.g. VIP-DANETH-001" value="${storedKey}" 
                       style="width:100%; box-sizing:border-box; padding:10px; background:#0b1120; border:1px solid #475569; border-radius:6px; color:#fff; font-family:monospace; font-size:13px; text-align:center; margin-bottom:14px; outline:none;" />

                <div style="display:flex; flex-direction:column; gap:8px;">
                    <button id="af-btn-activate-submit" style="background:#0284c7; color:#fff; border:none; padding:10px; border-radius:6px; font-size:13px; font-weight:700; cursor:pointer;">
                        ${isActivated ? '🔄 Verify / Refresh Key' : '⚡ Activate This PC'}
                    </button>

                    ${isActivated ? `
                        <button id="af-btn-deactivate-submit" style="background:#ef444422; color:#ef4444; border:1px solid #ef444455; padding:8px; border-radius:6px; font-size:12px; font-weight:600; cursor:pointer;">
                            🔓 Deactivate & Release Key
                        </button>
                    ` : ''}
                </div>
            </div>
        `;

        document.documentElement.appendChild(modal);

        const msgBox = modal.querySelector('#af-modal-msg');
        const inputKey = modal.querySelector('#af-license-input');

        modal.querySelector('#af-close-license-modal').onclick = () => modal.remove();

        modal.querySelector('#af-btn-activate-submit').onclick = () => {
            const key = inputKey.value.trim();
            if (!key) {
                msgBox.textContent = 'Please enter a license key.';
                msgBox.style.display = 'block';
                return;
            }

            msgBox.textContent = 'Verifying with Cloudflare...';
            msgBox.style.color = '#38bdf8';
            msgBox.style.background = '#0284c722';
            msgBox.style.border = '1px solid #0284c744';
            msgBox.style.display = 'block';

            callLicenseAPI('activate', key, (ok, msg) => {
                if (ok) {
                    GM_setValue(STORAGE_LICENSE, key);
                    isActivated = true;
                    currentActiveLicense = key;
                    modal.remove();
                    showToast('Activated successfully!');
                    mountApp();
                } else {
                    isActivated = false;
                    msgBox.textContent = `❌ ${msg}`;
                    msgBox.style.color = '#ef4444';
                    msgBox.style.background = '#ef444415';
                    msgBox.style.border = '1px solid #ef444444';
                    msgBox.style.display = 'block';
                }
            });
        };

        const deactBtn = modal.querySelector('#af-btn-deactivate-submit');
        if (deactBtn) {
            deactBtn.onclick = () => {
                if (!confirm('Deactivating will release this key so another PC can use it. Proceed?')) return;

                msgBox.textContent = 'Releasing key in Cloudflare...';
                msgBox.style.display = 'block';

                callLicenseAPI('deactivate', storedKey, (ok, msg) => {
                    if (ok) {
                        GM_setValue(STORAGE_LICENSE, '');
                        isActivated = false;
                        currentActiveLicense = '';
                        modal.remove();
                        unmountApp();
                        showToast('License released.');
                    } else {
                        msgBox.textContent = msg;
                        msgBox.style.display = 'block';
                    }
                });
            };
        }
    }

    // =========================================================================
    // 5. STORAGE ACCESSORS
    // =========================================================================
    function getProfiles() { return GM_getValue(STORAGE_PROFILES, {}); }
    function saveProfiles(data) { GM_setValue(STORAGE_PROFILES, data); }
    function getDomainActiveMap() { return GM_getValue(STORAGE_DOMAIN_ACTIVE, {}); }
    function setDomainActiveProfile(name) {
        const map = getDomainActiveMap();
        map[window.location.hostname] = name;
        GM_setValue(STORAGE_DOMAIN_ACTIVE, map);
    }
    function getActiveProfileName() { return getDomainActiveMap()[window.location.hostname] || ''; }
    function getUIState() { return GM_getValue(STORAGE_UI_STATE, 'expanded'); }
    function setUIState(state) { GM_setValue(STORAGE_UI_STATE, state); }

    // =========================================================================
    // 6. REACT / VUE DOM BYPASS
    // =========================================================================
    function setNativeValue(element, value) {
        if (!element || document.activeElement === element) return;
        const proto = Object.getPrototypeOf(element);
        const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');

        if (descriptor && descriptor.set) {
            descriptor.set.call(element, value);
        } else {
            element.value = value;
        }

        ['input', 'change', 'blur'].forEach(evt => {
            element.dispatchEvent(new Event(evt, { bubbles: true, cancelable: true }));
        });
    }

    function getSelector(el) {
        if (el.id) return `#${CSS.escape(el.id)}`;
        if (el.name) return `${el.tagName.toLowerCase()}[name="${CSS.escape(el.name)}"]`;
        if (el.getAttribute('placeholder')) return `${el.tagName.toLowerCase()}[placeholder="${CSS.escape(el.getAttribute('placeholder'))}"]`;
        if (el.className && typeof el.className === 'string') {
            const first = el.className.trim().split(/\s+/)[0];
            if (first && !first.includes(':')) return `${el.tagName.toLowerCase()}.${CSS.escape(first)}`;
        }
        return el.tagName.toLowerCase();
    }

    // =========================================================================
    // 7. FORM CAPTURE & APPLY
    // =========================================================================
    function captureCurrentForm(targetProfileName) {
        const profiles = getProfiles();
        const existingProfile = profiles[targetProfileName] || { rules: [] };
        const priorSelectors = new Set((existingProfile.rules || []).map(r => r.selector));

        const fields = Array.from(document.querySelectorAll('input, select, textarea'));
        const recordedRules = [];

        fields.forEach(el => {
            if (el.type === 'hidden' || el.type === 'submit' || el.type === 'button') return;
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 && rect.height === 0) return;

            const selector = getSelector(el);
            const tag = el.tagName.toLowerCase();
            const wasInProfile = priorSelectors.has(selector);

            if (tag === 'select') {
                if (el.value !== '' || wasInProfile) recordedRules.push({ type: 'select', selector, value: el.value });
            } else if (el.type === 'checkbox' || el.type === 'radio') {
                if (el.checked || wasInProfile) recordedRules.push({ type: 'check', selector, value: el.checked });
            } else {
                if (el.value.trim() !== '' || wasInProfile) recordedRules.push({ type: 'fill', selector, value: el.value });
            }
        });

        return recordedRules;
    }

    function applyProfileRules(rules) {
        if (!isActivated || !rules || !Array.isArray(rules)) return 0;
        let count = 0;

        rules.forEach(rule => {
            try {
                const elements = Array.from(document.querySelectorAll(rule.selector));
                elements.forEach(el => {
                    const rect = el.getBoundingClientRect();
                    if (rect.width === 0 && rect.height === 0) return;

                    if (rule.type === 'fill') {
                        if (el.value !== rule.value) {
                            setNativeValue(el, rule.value);
                            count++;
                        }
                    } else if (rule.type === 'select') {
                        if (el.value !== rule.value) {
                            el.value = rule.value;
                            el.dispatchEvent(new Event('change', { bubbles: true }));
                            count++;
                        }
                    } else if (rule.type === 'check') {
                        if (el.checked !== Boolean(rule.value)) {
                            el.checked = Boolean(rule.value);
                            el.dispatchEvent(new Event('change', { bubbles: true }));
                            count++;
                        }
                    }
                });
            } catch (err) {
                console.error('[AUTOFILL v7.7 Error]', err);
            }
        });
        return count;
    }

    function triggerAutoFill() {
        if (!isActivated) return 0;
        const activeName = getActiveProfileName();
        if (!activeName) return 0;
        const profile = getProfiles()[activeName];
        if (profile && profile.rules && profile.rules.length > 0) {
            return applyProfileRules(profile.rules);
        }
        return 0;
    }

    // =========================================================================
    // 8. BACKUP, IMPORT & VISUAL PROFILE EDITOR
    // =========================================================================
    function exportProfilesToFile() {
        if (!isActivated) return openLicenseManagerModal('Activate to export profiles.', true);
        const blob = new Blob([JSON.stringify(getProfiles(), null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `autofill_v77_backup_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        showToast('Backup downloaded successfully!');
    }

    function importProfilesFromFile() {
        if (!isActivated) return openLicenseManagerModal('Activate to import profiles.', true);
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.json,application/json';
        fileInput.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const imported = JSON.parse(event.target.result);
                    const merged = { ...getProfiles(), ...imported };
                    saveProfiles(merged);
                    updateUI();
                    showToast(`Imported ${Object.keys(imported).length} profile(s)!`);
                    triggerAutoFill();
                } catch {
                    alert('Invalid JSON file format.');
                }
            };
            reader.readAsText(file);
        };
        fileInput.click();
    }

    function openProfileEditor(profileName) {
        if (!isActivated) return openLicenseManagerModal('Activate to edit profiles.', true);
        const profiles = getProfiles();
        const profile = profiles[profileName];
        if (!profile) return;

        const existingModal = document.getElementById('af-editor-modal');
        if (existingModal) existingModal.remove();

        const modal = document.createElement('div');
        modal.id = 'af-editor-modal';
        Object.assign(modal.style, {
            position: 'fixed',
            inset: '0',
            background: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: '2147483647',
            fontFamily: 'system-ui, sans-serif'
        });

        let localRules = JSON.parse(JSON.stringify(profile.rules || []));

        function render() {
            modal.innerHTML = `
                <div style="background:#0f172a; border:1px solid #334155; border-radius:10px; width:520px; max-width:92vw; max-height:85vh; display:flex; flex-direction:column; box-shadow:0 20px 40px rgba(0,0,0,0.6); color:#f8fafc;">
                    <div style="padding:12px 16px; border-bottom:1px solid #334155; display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-weight:700; font-size:14px; color:#38bdf8;">✏️ Edit: ${profileName}</span>
                        <button id="af-modal-close" style="background:transparent; border:none; color:#94a3b8; font-size:16px; cursor:pointer;">✕</button>
                    </div>
                    <div id="af-modal-list" style="padding:14px 16px; overflow-y:auto; flex:1; display:flex; flex-direction:column; gap:8px;"></div>
                    <div style="padding:12px 16px; border-top:1px solid #334155; display:flex; justify-content:space-between; align-items:center; background:#0b1120;">
                        <button id="af-modal-del-profile" style="background:#ef444422; color:#ef4444; border:1px solid #ef444444; border-radius:4px; padding:6px 10px; font-size:11px; cursor:pointer; font-weight:600;">Delete Profile</button>
                        <div style="display:flex; gap:8px;">
                            <button id="af-modal-cancel" style="background:#334155; color:#cbd5e1; border:none; border-radius:4px; padding:6px 12px; font-size:12px; cursor:pointer;">Cancel</button>
                            <button id="af-modal-save" style="background:#16a34a; color:#fff; border:none; border-radius:4px; padding:6px 14px; font-size:12px; font-weight:600; cursor:pointer;">Save</button>
                        </div>
                    </div>
                </div>
            `;

            const listEl = modal.querySelector('#af-modal-list');
            localRules.forEach((rule, idx) => {
                const row = document.createElement('div');
                Object.assign(row.style, {
                    background: '#1e293b',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid #334155',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                });
                row.innerHTML = `
                    <div style="flex:1; min-width:0;">
                        <div style="font-size:11px; color:#38bdf8; font-family:monospace; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">${rule.selector}</div>
                        <input class="af-rule-val" data-idx="${idx}" type="${rule.type === 'check' ? 'checkbox' : 'text'}" 
                               style="width:100%; box-sizing:border-box; margin-top:4px; background:#0f172a; border:1px solid #475569; color:#fff; padding:4px 6px; border-radius:4px; font-size:12px;" />
                    </div>
                    <button class="af-rule-del" data-idx="${idx}" style="background:#dc262622; color:#f87171; border:1px solid #dc262644; border-radius:4px; padding:4px 8px; cursor:pointer;">✕</button>
                `;
                const valInput = row.querySelector('.af-rule-val');
                if (rule.type === 'check') valInput.checked = Boolean(rule.value);
                else valInput.value = rule.value ?? '';
                listEl.appendChild(row);
            });

            modal.querySelectorAll('.af-rule-val').forEach(input => {
                input.oninput = (e) => {
                    const idx = Number(e.target.dataset.idx);
                    localRules[idx].value = localRules[idx].type === 'check' ? e.target.checked : e.target.value;
                };
            });

            modal.querySelectorAll('.af-rule-del').forEach(btn => {
                btn.onclick = (e) => {
                    localRules.splice(Number(e.target.dataset.idx), 1);
                    render();
                };
            });

            modal.querySelector('#af-modal-close').onclick = () => modal.remove();
            modal.querySelector('#af-modal-cancel').onclick = () => modal.remove();
            modal.querySelector('#af-modal-del-profile').onclick = () => {
                if (confirm(`Delete profile "${profileName}"?`)) {
                    delete profiles[profileName];
                    saveProfiles(profiles);
                    updateUI();
                    modal.remove();
                }
            };
            modal.querySelector('#af-modal-save').onclick = () => {
                profiles[profileName].rules = localRules;
                saveProfiles(profiles);
                modal.remove();
                showToast(`Saved "${profileName}"`);
                triggerAutoFill();
            };
        }

        render();
        document.documentElement.appendChild(modal);
    }

    // =========================================================================
    // 9. TOP TOOLBAR UI
    // =========================================================================
    let topToolbar, selectEl, updateSlotEl, observer;

    function handleSaveCurrent() {
        if (!isActivated) return openLicenseManagerModal('Activate to save forms.', true);
        const current = getActiveProfileName();
        if (!current || current === '__CREATE_NEW__') {
            alert('Select or create a profile first.');
            return;
        }
        const capturedRules = captureCurrentForm(current);
        const profiles = getProfiles();
        profiles[current] = { domain: window.location.hostname, rules: capturedRules };
        saveProfiles(profiles);
        setDomainActiveProfile(current);
        showToast(`Saved to "${current}" (${capturedRules.length} fields)`);
        updateUI();
    }

    function handleCreateNewProfile() {
        if (!isActivated) return openLicenseManagerModal('Activate to create profiles.', true);
        const newName = prompt('Enter new profile name (e.g. A, B, Work Permit):');
        if (newName && newName.trim()) {
            const clean = newName.trim();
            const profiles = getProfiles();
            if (!profiles[clean]) {
                profiles[clean] = { domain: window.location.hostname, rules: captureCurrentForm(clean) };
                saveProfiles(profiles);
            }
            setDomainActiveProfile(clean);
            updateUI();
            showToast(`Profile "${clean}" ready!`);
        }
    }

    function createTopToolbarUI() {
        if (topToolbar) topToolbar.remove();

        topToolbar = document.createElement('div');
        topToolbar.id = 'pro-autofill-topbar';
        Object.assign(topToolbar.style, {
            position: 'fixed',
            top: '0px',
            left: '0px',
            width: '100%',
            height: '38px',
            background: '#090d16',
            color: '#f8fafc',
            borderBottom: '1px solid #1e293b',
            display: 'none',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 16px',
            boxSizing: 'border-box',
            zIndex: '2147483647',
            fontFamily: 'system-ui, sans-serif',
            fontSize: '12px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.45)',
            userSelect: 'none'
        });

        topToolbar.innerHTML = `
            <div style="display:flex; align-items:center; gap:8px;">
                <span style="font-weight:800; color:#38bdf8; font-size:12px; display:flex; align-items:center; gap:4px; margin-right:4px;">
                    ⚡ <span>AUTOFILL v${CURRENT_VERSION}</span>
                </span>

                <select id="af-select" style="background:#1e293b; color:#fff; border:1px solid #475569; border-radius:4px; padding:3px 8px; font-size:11px; outline:none; max-width:130px;"></select>
                <button id="af-btn-new" style="background:#334155; color:#38bdf8; border:1px solid #475569; border-radius:4px; padding:3px 8px; cursor:pointer; font-weight:600;" title="Create New Profile">➕ New</button>
                <button id="af-btn-save" style="background:#16a34a; color:#fff; border:none; border-radius:4px; padding:3px 10px; cursor:pointer; font-weight:600;" title="Save/Sync Current Form">💾 Save</button>
                <button id="af-btn-fill" style="background:#0284c7; color:#fff; border:none; border-radius:4px; padding:3px 10px; cursor:pointer; font-weight:600;" title="Fill Target Form">⚡ Fill</button>
                <button id="af-btn-edit" style="background:#1e293b; color:#94a3b8; border:1px solid #334155; border-radius:4px; padding:3px 6px; cursor:pointer;" title="Edit Profile Rules">✏️ Edit</button>

                <div style="width:1px; height:18px; background:#334155; margin:0 4px;"></div>

                <button id="af-btn-backup" style="background:#1e293b; color:#cbd5e1; border:1px solid #334155; border-radius:4px; padding:3px 8px; cursor:pointer; font-size:11px;" title="Export JSON backup">📦 Backup</button>
                <button id="af-btn-import" style="background:#1e293b; color:#cbd5e1; border:1px solid #334155; border-radius:4px; padding:3px 8px; cursor:pointer; font-size:11px;" title="Import JSON profiles">📥 Import</button>
            </div>

            <div style="display:flex; align-items:center; gap:8px;">
                <!-- Update / Up-to-Date Slot -->
                <div id="af-update-slot" style="display:flex; align-items:center;">
                    <span style="font-size:10px; color:#10b981; font-family:monospace; background:#10b98115; border:1px solid #10b98144; padding:2px 8px; border-radius:4px;" title="Running latest release">✓ UP TO DATE</span>
                </div>

                <span id="af-license-badge" style="font-size:11px; color:#22c55e; cursor:pointer; font-family:monospace; background:#22c55e15; border:1px solid #22c55e44; padding:2px 8px; border-radius:4px;" title="Manage License Key">🔒 ACTIVE</span>
                <button id="af-btn-hide" style="background:transparent; color:#94a3b8; border:none; cursor:pointer; font-size:15px; padding:2px 8px;" title="Hide bar completely (Press Alt+H to reopen)">✕</button>
            </div>
        `;

        // Pulse animation for upgrade button
        const styleSheet = document.createElement('style');
        styleSheet.textContent = `
            @keyframes afPulse {
                0% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.8); }
                70% { box-shadow: 0 0 0 7px rgba(34, 197, 94, 0); }
                100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
            }
        `;
        document.head.appendChild(styleSheet);

        document.documentElement.appendChild(topToolbar);

        selectEl = topToolbar.querySelector('#af-select');
        updateSlotEl = topToolbar.querySelector('#af-update-slot');

        topToolbar.querySelector('#af-btn-new').onclick = handleCreateNewProfile;
        topToolbar.querySelector('#af-btn-save').onclick = handleSaveCurrent;
        topToolbar.querySelector('#af-btn-fill').onclick = () => {
            const c = triggerAutoFill();
            showToast(`Filled ${c} field(s)`);
        };
        topToolbar.querySelector('#af-btn-edit').onclick = () => {
            const act = getActiveProfileName();
            if (act) openProfileEditor(act);
            else alert('Select a profile first.');
        };
        topToolbar.querySelector('#af-btn-backup').onclick = exportProfilesToFile;
        topToolbar.querySelector('#af-btn-import').onclick = importProfilesFromFile;
        topToolbar.querySelector('#af-license-badge').onclick = () => openLicenseManagerModal();
        
        topToolbar.querySelector('#af-btn-hide').onclick = () => {
            setViewMode('hidden');
            showToast('Bar hidden. Press Alt+H to show.');
        };

        selectEl.onchange = () => {
            if (selectEl.value === '__CREATE_NEW__') handleCreateNewProfile();
            else {
                setDomainActiveProfile(selectEl.value);
                triggerAutoFill();
            }
        };

        applySavedUIMode();
        updateUI();

        // Check for updates & render either "Update to vX.X" or "✓ UP TO DATE"
        checkGitHubForUpdates((hasUpdate, remoteVer) => {
            if (!updateSlotEl) return;
            if (hasUpdate) {
                updateSlotEl.innerHTML = `
                    <button id="af-btn-upgrade-action" style="background:#22c55e; color:#0f172a; border:none; border-radius:4px; padding:4px 12px; cursor:pointer; font-weight:800; font-size:11px; animation: afPulse 1.4s infinite;" title="Click to open Tampermonkey installer">
                        🚀 Upgrade to v${remoteVer}!
                    </button>
                `;
                const btn = updateSlotEl.querySelector('#af-btn-upgrade-action');
                if (btn) {
                    btn.onclick = () => {
                        window.open(GITHUB_RAW_SCRIPT_URL, '_blank');
                    };
                }

                // Unhide the bar once to notify user of new release
                const lastNotified = GM_getValue(STORAGE_NOTIFIED_VERSION, '');
                if (lastNotified !== remoteVer) {
                    setViewMode('expanded');
                    GM_setValue(STORAGE_NOTIFIED_VERSION, remoteVer);
                    showToast(`🚀 New Version: AUTOFILL v${remoteVer} is available! Click 'Upgrade' to install.`, 4500);
                }
            } else {
                updateSlotEl.innerHTML = `
                    <span style="font-size:10px; color:#10b981; font-family:monospace; background:#10b98115; border:1px solid #10b98144; padding:2px 8px; border-radius:4px;" title="You are on the latest version">✓ UP TO DATE</span>
                `;
            }
        });
    }

    function setViewMode(mode) {
        setUIState(mode);
        applySavedUIMode();
    }

    function applySavedUIMode() {
        if (!topToolbar) return;
        const mode = getUIState();
        if (mode === 'expanded') {
            topToolbar.style.display = 'flex';
        } else {
            topToolbar.style.display = 'none';
        }
    }

    function updateUI() {
        if (!selectEl) return;
        const profiles = getProfiles();
        const names = Object.keys(profiles);
        const active = getActiveProfileName();

        selectEl.innerHTML = '';
        if (names.length === 0) {
            const emptyOpt = document.createElement('option');
            emptyOpt.value = '';
            emptyOpt.textContent = '(No Profiles)';
            selectEl.appendChild(emptyOpt);
        } else {
            names.forEach(name => {
                const opt = document.createElement('option');
                opt.value = name;
                opt.textContent = name;
                if (name === active) opt.selected = true;
                selectEl.appendChild(opt);
            });
        }

        const newOpt = document.createElement('option');
        newOpt.value = '__CREATE_NEW__';
        newOpt.textContent = '+ Create New...';
        newOpt.style.fontWeight = 'bold';
        newOpt.style.color = '#38bdf8';
        selectEl.appendChild(newOpt);
    }

    function showToast(msg, duration = 2500) {
        const toast = document.createElement('div');
        toast.textContent = msg;
        Object.assign(toast.style, {
            position: 'fixed',
            top: '46px',
            right: '16px',
            background: '#0f172a',
            color: '#38bdf8',
            border: '1px solid #0284c7',
            padding: '7px 14px',
            borderRadius: '6px',
            fontSize: '11px',
            fontWeight: '600',
            fontFamily: 'system-ui, sans-serif',
            zIndex: '2147483647',
            boxShadow: '0 6px 16px rgba(0,0,0,0.5)',
            pointerEvents: 'none'
        });
        document.documentElement.appendChild(toast);
        setTimeout(() => toast.remove(), duration);
    }

    // =========================================================================
    // 10. CONTEXT MENU & SHORTCUTS
    // =========================================================================
    let contextMenu = null;
    function removeContextMenu() { if (contextMenu) { contextMenu.remove(); contextMenu = null; } }

    function showContextMenu(x, y) {
        removeContextMenu();
        const profiles = getProfiles();
        const names = Object.keys(profiles);
        const active = getActiveProfileName();

        contextMenu = document.createElement('div');
        Object.assign(contextMenu.style, {
            position: 'fixed',
            left: `${Math.min(x, window.innerWidth - 220)}px`,
            top: `${Math.min(y, window.innerHeight - 380)}px`,
            background: '#0f172a',
            color: '#f8fafc',
            border: '1px solid #334155',
            borderRadius: '6px',
            padding: '4px',
            fontFamily: 'system-ui, sans-serif',
            fontSize: '12px',
            zIndex: '2147483647',
            boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
            minWidth: '200px'
        });

        const makeItem = (label, onClick, isAccent = false) => {
            const item = document.createElement('div');
            item.textContent = label;
            Object.assign(item.style, {
                padding: '6px 10px',
                cursor: 'pointer',
                borderRadius: '4px',
                color: isAccent ? '#38bdf8' : '#f8fafc',
                fontWeight: isAccent ? '600' : 'normal'
            });
            item.onmouseenter = () => item.style.background = '#1e293b';
            item.onmouseleave = () => item.style.background = 'transparent';
            item.onclick = (e) => { e.stopPropagation(); removeContextMenu(); onClick(); };
            return item;
        };

        const makeDivider = () => {
            const div = document.createElement('div');
            div.style.borderTop = '1px solid #334155';
            div.style.margin = '4px 0';
            return div;
        };

        contextMenu.appendChild(makeItem(`⚡ AUTOFILL v${CURRENT_VERSION} #RT`, () => {}, true));
        contextMenu.appendChild(makeDivider());

        if (isActivated) {
            contextMenu.appendChild(makeItem(`⚡ Fill: ${active || '(None)'}`, () => triggerAutoFill()));
            contextMenu.appendChild(makeItem(`💾 Save/Sync: ${active || '(None)'}`, handleSaveCurrent));
            if (active) contextMenu.appendChild(makeItem(`✏️ Edit "${active}"`, () => openProfileEditor(active)));
            contextMenu.appendChild(makeDivider());

            names.forEach(name => {
                contextMenu.appendChild(makeItem(`${name === active ? '✓ ' : '   '}${name}`, () => {
                    setDomainActiveProfile(name);
                    updateUI();
                    triggerAutoFill();
                }));
            });

            contextMenu.appendChild(makeItem('➕ Create New Profile...', handleCreateNewProfile));
            contextMenu.appendChild(makeDivider());
            contextMenu.appendChild(makeItem('📦 Export Backup (JSON)', exportProfilesToFile));
            contextMenu.appendChild(makeItem('📥 Import Backup (JSON)', importProfilesFromFile));
            contextMenu.appendChild(makeDivider());
            
            const cur = getUIState();
            contextMenu.appendChild(makeItem(cur === 'expanded' ? '✕ Hide Top Bar' : '👁️ Show Top Bar', () => {
                setViewMode(cur === 'expanded' ? 'hidden' : 'expanded');
            }));
        }

        contextMenu.appendChild(makeItem('🔑 License / Activation Manager', () => openLicenseManagerModal()));
        document.documentElement.appendChild(contextMenu);
    }

    window.addEventListener('contextmenu', (e) => {
        if (e.shiftKey) return;
        if (e.target.matches('input, select, textarea, #pro-autofill-topbar, #pro-autofill-topbar *')) {
            e.preventDefault();
            showContextMenu(e.clientX, e.clientY);
        } else {
            removeContextMenu();
        }
    }, true);

    window.addEventListener('click', removeContextMenu);
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') removeContextMenu();
        
        if (e.altKey && e.key.toLowerCase() === 'h') {
            if (!isActivated) {
                openLicenseManagerModal(`Activate this device to use AUTOFILL v${CURRENT_VERSION} #RT.`, true);
            } else {
                const mode = getUIState();
                setViewMode(mode === 'expanded' ? 'hidden' : 'expanded');
            }
        }
    });

    // =========================================================================
    // 11. LIFECYCLE INITIALIZATION & POST-UPGRADE CELEBRATION
    // =========================================================================
    function mountApp() {
        createTopToolbarUI();
        setTimeout(triggerAutoFill, 400);

        // POST-UPGRADE DETECTION: Checks if the user just updated the script
        const previousRecordedVersion = GM_getValue(STORAGE_INSTALLED_VER, null);
        if (previousRecordedVersion && compareVersions(CURRENT_VERSION, previousRecordedVersion)) {
            // New version installed: automatically unhide the bar and alert user
            setViewMode('expanded');
            setTimeout(() => {
                showToast(`🎉 Upgraded successfully to AUTOFILL v${CURRENT_VERSION} #RT!`, 5000);
            }, 600);
            GM_setValue(STORAGE_INSTALLED_VER, CURRENT_VERSION);
        } else if (!previousRecordedVersion) {
            GM_setValue(STORAGE_INSTALLED_VER, CURRENT_VERSION);
        }

        if (!observer && document.body) {
            let debounceTimer;
            observer = new MutationObserver(() => {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(triggerAutoFill, 350);
            });
            observer.observe(document.body, { childList: true, subtree: true });
        }
    }

    function unmountApp() {
        if (topToolbar) topToolbar.remove();
        if (observer) {
            observer.disconnect();
            observer = null;
        }
    }

    GM_registerMenuCommand('🔑 License Manager', () => openLicenseManagerModal());
    GM_registerMenuCommand('⚡ Autofill Form', () => triggerAutoFill());
    GM_registerMenuCommand('💾 Save Profile', handleSaveCurrent);

    function init() {
        if (!currentActiveLicense) {
            openLicenseManagerModal();
            return;
        }

        callLicenseAPI('verify', currentActiveLicense, (isValid, msg) => {
            if (isValid) {
                isActivated = true;
                mountApp();
            } else {
                isActivated = false;
                openLicenseManagerModal(msg || 'Key not found in Cloudflare list.', true);
            }
        });
    }

    init();
})();
