// ==UserScript==
// @name         Pro Autofill - Top Toolbar & Device Lock Engine
// @namespace    https://tampermonkey.net/
// @version      6.0
// @description  Top-docked toolbar, profile sync, visual editor, JSON backup, and 1-PC device-locked activation.
// @match        *://*/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @connect      *
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // =========================================================================
    // 0. CONFIGURATION & ACTIVATION SERVER
    // Replace with your Cloudflare Worker URL or backend API endpoint (Step 2)
    // =========================================================================
    const LICENSE_API_URL = 'https://YOUR_WORKER_SUBDOMAIN.workers.dev/verify'; // Set to '' for offline demo mode

    // Storage Keys
    const STORAGE_PROFILES = 'af_profiles_db';
    const STORAGE_DOMAIN_ACTIVE = 'af_domain_active_map';
    const STORAGE_UI_STATE = 'af_ui_state'; // 'expanded' | 'minimized' | 'hidden'
    const STORAGE_LICENSE = 'af_license_key';
    const STORAGE_DEVICE_ID = 'af_unique_device_id';

    // =========================================================================
    // 1. DEVICE FINGERPRINTING & HARDWARE BINDING
    // =========================================================================
    function getMachineFingerprint() {
        let machineId = GM_getValue(STORAGE_DEVICE_ID, null);
        if (!machineId) {
            // Generate hardware fingerprint using canvas rendering, screen specs, and platform
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            ctx.textBaseline = 'top';
            ctx.font = "14px 'Arial'";
            ctx.fillText("AF-SECURE-KEY", 2, 2);
            const rawHash = btoa(canvas.toDataURL() + screen.width + 'x' + screen.height + navigator.hardwareConcurrency);
            const cleanHash = rawHash.replace(/[^a-zA-Z0-9]/g, '').slice(-10).toUpperCase();
            
            machineId = `PC-${cleanHash}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
            GM_setValue(STORAGE_DEVICE_ID, machineId);
        }
        return machineId;
    }

    function checkActivationStatus(callback) {
        const storedKey = GM_getValue(STORAGE_LICENSE, null);
        const machineId = getMachineFingerprint();

        if (!storedKey) {
            callback(false, 'No license registered on this machine.');
            return;
        }

        // Offline / Demo fallback if no API server is provided yet
        if (!LICENSE_API_URL || LICENSE_API_URL.includes('YOUR_WORKER')) {
            callback(true, 'Local Demo Mode Active');
            return;
        }

        GM_xmlhttpRequest({
            method: 'POST',
            url: LICENSE_API_URL,
            headers: { 'Content-Type': 'application/json' },
            data: JSON.stringify({ licenseKey: storedKey, machineId: machineId }),
            timeout: 7000,
            onload: function (response) {
                try {
                    const res = JSON.parse(response.responseText);
                    if (res.status === 'valid') {
                        callback(true, res.message);
                    } else {
                        callback(false, res.message || 'Key already in use on another PC.');
                    }
                } catch (e) {
                    callback(false, 'Failed to verify license with server.');
                }
            },
            onerror: function () {
                callback(false, 'License server unreachable.');
            }
        });
    }

    function promptActivationModal(errorMsg = '') {
        const existing = document.getElementById('af-activate-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'af-activate-modal';
        Object.assign(modal.style, {
            position: 'fixed',
            inset: '0',
            background: 'rgba(10, 15, 29, 0.85)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: '2147483647',
            fontFamily: 'system-ui, sans-serif'
        });

        const machineId = getMachineFingerprint();

        modal.innerHTML = `
            <div style="background:#0f172a; border:1px solid #334155; border-radius:10px; width:440px; padding:24px; box-shadow:0 20px 50px rgba(0,0,0,0.7); color:#f8fafc; text-align:center;">
                <div style="font-size:28px; margin-bottom:8px;">🔒</div>
                <h3 style="margin:0 0 6px 0; font-size:18px; color:#38bdf8;">Activate Autofill Pro</h3>
                <p style="font-size:12px; color:#94a3b8; margin:0 0 16px 0;">This license is locked to <b>1 PC</b>. Copying this key to another computer will be rejected.</p>
                
                <div style="background:#1e293b; padding:8px; border-radius:6px; font-family:monospace; font-size:11px; color:#cbd5e1; margin-bottom:14px; border:1px solid #334155;">
                    Device ID: <span style="color:#38bdf8;">${machineId}</span>
                </div>

                ${errorMsg ? `<div style="color:#ef4444; font-size:12px; margin-bottom:12px; background:#ef444415; padding:6px; border-radius:4px;">${errorMsg}</div>` : ''}

                <input id="af-key-input" placeholder="Enter License Key (e.g. VIP-XXXX-XXXX)" 
                       style="width:100%; box-sizing:border-box; padding:10px; background:#0b1120; border:1px solid #475569; border-radius:6px; color:#fff; font-family:monospace; font-size:13px; text-align:center; margin-bottom:16px; outline:none;" />

                <button id="af-btn-activate" style="width:100%; background:#0284c7; color:#fff; border:none; padding:10px; border-radius:6px; font-size:13px; font-weight:700; cursor:pointer;">
                    Activate This PC
                </button>
            </div>
        `;

        document.documentElement.appendChild(modal);

        modal.querySelector('#af-btn-activate').onclick = () => {
            const val = modal.querySelector('#af-key-input').value.trim();
            if (!val) return;
            GM_setValue(STORAGE_LICENSE, val);
            modal.remove();
            initApp();
        };
    }

    // =========================================================================
    // 2. STORAGE ACCESSORS
    // =========================================================================
    function getProfiles() { return GM_getValue(STORAGE_PROFILES, {}); }
    function saveProfiles(data) { GM_setValue(STORAGE_PROFILES, data); }
    function getDomainActiveMap() { return GM_getValue(STORAGE_DOMAIN_ACTIVE, {}); }
    function setDomainActiveProfile(name) {
        const map = getDomainActiveMap();
        map[window.location.hostname] = name;
        GM_setValue(STORAGE_DOMAIN_ACTIVE, map);
    }
    function getActiveProfileName() {
        return getDomainActiveMap()[window.location.hostname] || '';
    }
    function getUIState() { return GM_getValue(STORAGE_UI_STATE, 'expanded'); }
    function setUIState(state) { GM_setValue(STORAGE_UI_STATE, state); }

    // =========================================================================
    // 3. REACT / VUE / DOM BYPASS ENGINE
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

        ['input', 'change', 'blur'].forEach(eventType => {
            element.dispatchEvent(new Event(eventType, { bubbles: true, cancelable: true }));
        });
    }

    function getSelector(el) {
        if (el.id) return `#${CSS.escape(el.id)}`;
        if (el.name) return `${el.tagName.toLowerCase()}[name="${CSS.escape(el.name)}"]`;
        if (el.getAttribute('placeholder')) return `${el.tagName.toLowerCase()}[placeholder="${CSS.escape(el.getAttribute('placeholder'))}"]`;
        if (el.className && typeof el.className === 'string') {
            const firstClass = el.className.trim().split(/\s+/)[0];
            if (firstClass && !firstClass.includes(':')) return `${el.tagName.toLowerCase()}.${CSS.escape(firstClass)}`;
        }
        return el.tagName.toLowerCase();
    }

    // =========================================================================
    // 4. FULL STATE CAPTURE & APPLY
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
        if (!rules || !Array.isArray(rules)) return 0;
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
                console.error('[Autofill Error]', rule.selector, err);
            }
        });
        return count;
    }

    function triggerAutoFill() {
        const activeName = getActiveProfileName();
        if (!activeName) return 0;
        const profile = getProfiles()[activeName];
        if (profile && profile.rules && profile.rules.length > 0) {
            return applyProfileRules(profile.rules);
        }
        return 0;
    }

    // =========================================================================
    // 5. BACKUP & EXPORT/IMPORT
    // =========================================================================
    function exportProfilesToFile() {
        const profiles = getProfiles();
        const blob = new Blob([JSON.stringify(profiles, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `autofill_backup_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        showToast('Backup downloaded!');
    }

    function importProfilesFromFile() {
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
                    alert('Invalid JSON file.');
                }
            };
            reader.readAsText(file);
        };
        fileInput.click();
    }

    // =========================================================================
    // 6. VISUAL PROFILE EDITOR MODAL
    // =========================================================================
    function openProfileEditor(profileName) {
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
                        <span style="font-weight:700; font-size:14px; color:#38bdf8;">✏️ Edit Profile: ${profileName}</span>
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
    // 7. TOP TOOLBAR UI (Positioned below Bookmark Bar)
    // =========================================================================
    let topToolbar, miniTab, selectEl;

    function handleSaveCurrent() {
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
        const newName = prompt('Enter new profile name:');
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
        // 1. Sleek Dropdown Tab when Minimized
        miniTab = document.createElement('div');
        miniTab.id = 'af-mini-tab';
        miniTab.textContent = '⚡ Autofill';
        miniTab.title = 'Click to expand (Alt+H)';
        Object.assign(miniTab.style, {
            position: 'fixed',
            top: '0px',
            right: '24px',
            background: '#090d16',
            color: '#38bdf8',
            padding: '3px 12px',
            borderBottomLeftRadius: '6px',
            borderBottomRightRadius: '6px',
            border: '1px solid #1e293b',
            borderTop: 'none',
            fontSize: '11px',
            fontFamily: 'system-ui, sans-serif',
            cursor: 'pointer',
            zIndex: '2147483647',
            display: 'none',
            boxShadow: '0 2px 8px rgba(0,0,0,0.5)'
        });
        miniTab.onclick = () => setViewMode('expanded');

        // 2. Full-Width Top Docked Bar (Below Bookmarks)
        topToolbar = document.createElement('div');
        topToolbar.id = 'pro-autofill-topbar';
        Object.assign(topToolbar.style, {
            position: 'fixed',
            top: '0px',
            left: '0px',
            width: '100%',
            height: '36px',
            background: '#090d16',
            color: '#f8fafc',
            borderBottom: '1px solid #1e293b',
            display: 'flex',
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
            <div style="display:flex; align-items:center; gap:12px;">
                <span style="font-weight:800; color:#38bdf8; font-size:13px; display:flex; align-items:center; gap:4px;">
                    ⚡ <span style="letter-spacing:0.5px;">LIGHTNING AUTOFILL</span>
                </span>
                <div style="display:flex; align-items:center; gap:6px;">
                    <select id="af-select" style="background:#1e293b; color:#fff; border:1px solid #475569; border-radius:4px; padding:3px 8px; font-size:11px; outline:none; max-width:140px;"></select>
                    <button id="af-btn-edit" style="background:#1e293b; color:#38bdf8; border:1px solid #334155; border-radius:4px; padding:3px 6px; cursor:pointer;" title="Edit Profile Fields">✏️ Edit</button>
                    <button id="af-btn-save" style="background:#16a34a; color:#fff; border:none; border-radius:4px; padding:3px 10px; cursor:pointer; font-weight:600;" title="Save / Overwrite Current Form">Save</button>
                    <button id="af-btn-fill" style="background:#0284c7; color:#fff; border:none; border-radius:4px; padding:3px 10px; cursor:pointer; font-weight:600;" title="Re-Fill Inputs">Fill</button>
                </div>
            </div>

            <div style="display:flex; align-items:center; gap:10px;">
                <span id="af-device-indicator" style="font-size:10px; color:#64748b; font-family:monospace;" title="Device Lock Active">🔒 1-PC LOCKED</span>
                <button id="af-btn-min" style="background:transparent; color:#94a3b8; border:none; cursor:pointer; font-size:14px; padding:2px 6px;" title="Minimize to top tab">—</button>
                <button id="af-btn-hide" style="background:transparent; color:#94a3b8; border:none; cursor:pointer; font-size:13px; padding:2px 6px;" title="Hide bar (Alt+H to restore)">✕</button>
            </div>
        `;

        document.documentElement.appendChild(miniTab);
        document.documentElement.appendChild(topToolbar);

        selectEl = topToolbar.querySelector('#af-select');
        const editBtn = topToolbar.querySelector('#af-btn-edit');
        const saveBtn = topToolbar.querySelector('#af-btn-save');
        const fillBtn = topToolbar.querySelector('#af-btn-fill');
        const minBtn = topToolbar.querySelector('#af-btn-min');
        const hideBtn = topToolbar.querySelector('#af-btn-hide');

        selectEl.onchange = () => {
            if (selectEl.value === '__CREATE_NEW__') handleCreateNewProfile();
            else {
                setDomainActiveProfile(selectEl.value);
                triggerAutoFill();
            }
        };

        editBtn.onclick = () => {
            const act = getActiveProfileName();
            if (act) openProfileEditor(act);
            else alert('Select a profile first.');
        };
        saveBtn.onclick = handleSaveCurrent;
        fillBtn.onclick = () => {
            const c = triggerAutoFill();
            showToast(`Filled ${c} field(s)`);
        };
        minBtn.onclick = () => setViewMode('minimized');
        hideBtn.onclick = () => {
            setViewMode('hidden');
            showToast('Top bar hidden. Press Alt+H to show.');
        };

        applySavedUIMode();
        updateUI();
    }

    function setViewMode(mode) {
        setUIState(mode);
        applySavedUIMode();
    }

    function applySavedUIMode() {
        const mode = getUIState();
        if (mode === 'expanded') {
            topToolbar.style.display = 'flex';
            miniTab.style.display = 'none';
        } else if (mode === 'minimized') {
            topToolbar.style.display = 'none';
            miniTab.style.display = 'block';
        } else {
            topToolbar.style.display = 'none';
            miniTab.style.display = 'none';
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

    function showToast(msg) {
        const toast = document.createElement('div');
        toast.textContent = msg;
        Object.assign(toast.style, {
            position: 'fixed',
            top: '44px',
            right: '16px',
            background: '#1e293b',
            color: '#38bdf8',
            border: '1px solid #0284c7',
            padding: '5px 12px',
            borderRadius: '6px',
            fontSize: '11px',
            fontFamily: 'system-ui, sans-serif',
            zIndex: '2147483647',
            boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
            pointerEvents: 'none'
        });
        document.documentElement.appendChild(toast);
        setTimeout(() => toast.remove(), 2000);
    }

    // =========================================================================
    // 8. RIGHT CLICK CONTEXT MENU & HOTKEYS
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
            left: `${Math.min(x, window.innerWidth - 210)}px`,
            top: `${Math.min(y, window.innerHeight - 340)}px`,
            background: '#0f172a',
            color: '#f8fafc',
            border: '1px solid #334155',
            borderRadius: '6px',
            padding: '4px',
            fontFamily: 'system-ui, sans-serif',
            fontSize: '12px',
            zIndex: '2147483647',
            boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
            minWidth: '190px'
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

        contextMenu.appendChild(makeItem(`⚡ Fill: ${active || '(None)'}`, () => triggerAutoFill(), true));
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

        const currentMode = getUIState();
        contextMenu.appendChild(makeItem(currentMode === 'expanded' ? '👁️ Minimize Top Bar' : '👁️ Expand Top Bar', () => {
            setViewMode(currentMode === 'expanded' ? 'minimized' : 'expanded');
        }));

        document.documentElement.appendChild(contextMenu);
    }

    window.addEventListener('contextmenu', (e) => {
        if (e.shiftKey) return;
        if (e.target.matches('input, select, textarea, #pro-autofill-topbar, #pro-autofill-topbar *, #af-mini-tab')) {
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
            const mode = getUIState();
            if (mode === 'expanded') setViewMode('minimized');
            else if (mode === 'minimized') setViewMode('hidden');
            else setViewMode('expanded');
        }
    });

    // =========================================================================
    // 9. INITIALIZATION & OBSERVER
    // =========================================================================
    function initApp() {
        checkActivationStatus((isValid, msg) => {
            if (!isValid) {
                promptActivationModal(msg);
                return;
            }

            createTopToolbarUI();
            setTimeout(triggerAutoFill, 400);

            let debounceTimer;
            const observer = new MutationObserver(() => {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(triggerAutoFill, 350);
            });
            if (document.body) {
                observer.observe(document.body, { childList: true, subtree: true });
            }
        });
    }

    initApp();
})();
