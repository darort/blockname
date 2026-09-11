// ==UserScript==
// @name         EXTENSION SUB-SYSTEM #RT
// @namespace    https://github.com/darort/blockname
// @version      2.0
// @description  Perf pass: scoped @match, persistent TTL cache for remote JSON fetches, parallel module execution, indexed+debounced Block Name matching, one shared observer, idle-scheduled execution. Added Gender Switcher v7.0.
// @match        *://kingwinagency.net/*
// @match        *://*.kingwinagency.net/*
// @grant        none
// @run-at       document-end
// @updateURL    https://raw.githubusercontent.com/darort/blockname/main/EXTENSION%20SUB-SYSTEM-update.user.js
// @downloadURL  https://raw.githubusercontent.com/darort/blockname/main/EXTENSION%20SUB-SYSTEM-update.user.js
// ==/UserScript==

(function() {
    'use strict';

    // =========================================================================
    // 0. STORAGE UTILITY POLYFILL
    // =========================================================================
    if (typeof window.chrome === 'undefined' || !window.chrome.storage || !window.chrome.storage.local) {
        window.chrome = window.chrome || {};
        window.chrome.storage = {
            local: {
                get: async (keys) => {
                    const res = {};
                    const kArr = Array.isArray(keys) ? keys : [keys];
                    kArr.forEach(k => {
                        const val = localStorage.getItem('chromestorage_' + k);
                        if (val !== null) {
                            try { res[k] = JSON.parse(val); } catch(e) { res[k] = val; }
                        }
                    });
                    return res;
                },
                set: async (items) => {
                    for (const [k, v] of Object.entries(items)) {
                        localStorage.setItem('chromestorage_' + k, JSON.stringify(v));
                    }
                }
            }
        };
    }

    // =========================================================================
    // DYNAMIC REGISTRY PUBLISHER
    // =========================================================================
    const EXT_REGISTRY = [
        { id: 'blockname', name: 'Block Name', version: 'v9.0', key: 'rt_mod_blockname' },
        { id: 'visapenal', name: 'Last Visa & Penal', version: 'v9.2', key: 'rt_mod_visapenal' },
        { id: 'nationality', name: 'Nationality Checker', version: 'v7.0', key: 'rt_mod_nationality' },
        { id: 'cardreceived', name: 'Card Received Check', version: 'v6.0', key: 'rt_mod_cardreceived' },
        { id: 'passport', name: 'Passport Number Check', version: 'v6.0', key: 'rt_mod_passport' },
        { id: 'paymentcheck', name: 'Payment Check', version: 'v6.0', key: 'rt_mod_paymentcheck' },
        { id: 'savepdf', name: 'Save PDF', version: 'v8.0', key: 'rt_mod_savepdf' },
        { id: 'datecount', name: 'Date Count', version: 'v5.0', key: 'rt_mod_datecount' },
        { id: 'linkclick', name: 'Link Click', version: 'v2.2', key: 'rt_mod_linkclick' },
        { id: 'check24', name: '2024 Check', version: 'v2.1', key: 'rt_mod_24check' },
        { id: 'genderswitcher', name: 'Gender Switcher', version: 'v7.0', key: 'rt_mod_genderswitcher' }
    ];

    localStorage.setItem('rt_extension_registry', JSON.stringify(EXT_REGISTRY));
    localStorage.setItem('rt_extension_registry', JSON.stringify(EXT_REGISTRY));
    localStorage.setItem('rt_subsystem_version', '2.0'); // <--- ADD THIS LINE

    let activeModulesCache = {};
    function refreshActiveModulesCache() {
        EXT_REGISTRY.forEach(ext => {
            const val = localStorage.getItem(ext.key);
            activeModulesCache[ext.key] = val !== null ? val === 'true' : true;
        });
    }
    refreshActiveModulesCache();

    function isModuleActive(key) {
        return activeModulesCache[key] !== false;
    }

    // =========================================================================
    // SHARED: PERSISTENT TTL CACHE FOR REMOTE JSON
    // =========================================================================
    const RT_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
    async function rtCachedFetch(url, cacheKey, ttlMs = RT_CACHE_TTL_MS) {
        try {
            const raw = localStorage.getItem(cacheKey);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed.t === 'number' && (Date.now() - parsed.t) < ttlMs) {
                    return parsed.d;
                }
            }
        } catch (_) {}

        const response = await fetch(url, { cache: 'default' });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const data = await response.json();

        try {
            localStorage.setItem(cacheKey, JSON.stringify({ t: Date.now(), d: data }));
        } catch (_) {}

        return data;
    }

    // =========================================================================
    // MODULE 1: BLOCK NAME (v9.0 logic, v9.1 perf)
    // =========================================================================
    const bn9_blockedNamesUrl = "https://raw.githubusercontent.com/darort/blockname/main/blocked_names6.json";

    function bn9_calculateSimilarity(str1, str2) {
        const len1 = str1.length;
        const len2 = str2.length;
        if (len1 === 0) return len2 === 0 ? 1 : 0;
        if (len2 === 0) return 0;

        let shortStr = str1, longStr = str2;
        if (len1 > len2) { shortStr = str2; longStr = str1; }
        const sLen = shortStr.length, lLen = longStr.length;

        let prevRow = new Array(sLen + 1);
        let curRow = new Array(sLen + 1);
        for (let j = 0; j <= sLen; j++) prevRow[j] = j;

        for (let i = 1; i <= lLen; i++) {
            curRow[0] = i;
            const lc = longStr[i - 1];
            for (let j = 1; j <= sLen; j++) {
                const cost = lc === shortStr[j - 1] ? 0 : 1;
                curRow[j] = Math.min(prevRow[j] + 1, curRow[j - 1] + 1, prevRow[j - 1] + cost);
            }
            const tmp = prevRow; prevRow = curRow; curRow = tmp;
        }

        return 1 - prevRow[sLen] / Math.max(len1, len2);
    }

    function bn9_normalizeText(str) {
        return (str || "").toLowerCase()
            .replace(/\s+/g, "")
            .replace(/0/g, "o").replace(/1/g, "i").replace(/3/g, "e")
            .replace(/4/g, "a").replace(/5/g, "s").replace(/7/g, "t")
            .replace(/8/g, "b").replace(/@/g, "a");
    }

    let bn9_cache = null;
    async function bn9_fetchBlockedNames() {
        if (bn9_cache) return bn9_cache;
        try {
            bn9_cache = await rtCachedFetch(bn9_blockedNamesUrl, 'rt_cache_blockednames');
            return bn9_cache;
        } catch (error) { return null; }
    }

    let bn9_indexCache = null;
    let bn9_indexSourceData = null;
    async function bn9_buildBlockedIndex() {
        const data = await bn9_fetchBlockedNames();
        if (!data) return null;
        if (bn9_indexCache && bn9_indexSourceData === data) return bn9_indexCache;

        const indexed = data.blockedNames.map(b => ({
            name: b.name,
            note: b.note || "",
            norm: bn9_normalizeText(b.name)
        }));
        bn9_indexCache = { indexed, exactSet: new Set(indexed.map(x => x.norm)) };
        bn9_indexSourceData = data;
        return bn9_indexCache;
    }

    function bn9_bestSimilarityMatch(textNorm, index, minThreshold = 0) {
        if (index.exactSet.has(textNorm)) {
            const hit = index.indexed.find(x => x.norm === textNorm);
            return { score: 1, name: hit.name, note: hit.note };
        }
        const pruneCutoff = 1 - minThreshold;
        let best = { score: 0, name: null, note: "" };
        for (const item of index.indexed) {
            const lenMax = Math.max(textNorm.length, item.norm.length);
            if (lenMax === 0) continue;
            const lenDiff = Math.abs(textNorm.length - item.norm.length) / lenMax;
            if (lenDiff > pruneCutoff) continue;
            const s = bn9_calculateSimilarity(textNorm, item.norm);
            if (s > best.score) best = { score: s, name: item.name, note: item.note };
            if (best.score === 1) break;
        }
        return best;
    }

    const bn9_inputDebounceTimers = new WeakMap();
    function bn9_debounce(el, fn, delay) {
        clearTimeout(bn9_inputDebounceTimers.get(el));
        bn9_inputDebounceTimers.set(el, setTimeout(fn, delay));
    }

    let bn9_select2Observer = null;
    const bn9_select2Handlers = new WeakMap();
    function bn9_findOwningSpan(node) {
        if (!node) return null;
        const el = node.nodeType === 1 ? node : node.parentElement;
        return el ? el.closest('.select2-selection__rendered') : null;
    }

    function bn9_getSelect2Observer() {
        if (bn9_select2Observer) return bn9_select2Observer;
        bn9_select2Observer = new MutationObserver(mutations => {
            const toUpdate = new Set();
            mutations.forEach(m => {
                const span = bn9_findOwningSpan(m.target);
                if (span && bn9_select2Handlers.has(span)) toUpdate.add(span);
            });
            toUpdate.forEach(span => bn9_select2Handlers.get(span)());
        });
        return bn9_select2Observer;
    }

    async function bn9_checkInputFields() {
        if (!isModuleActive('rt_mod_blockname')) return;
        const data = await bn9_fetchBlockedNames();
        if (!data) return;
        const index = await bn9_buildBlockedIndex();
        if (!index) return;

        const { greenWords, blockedDates } = data;

        document.querySelectorAll("input:not([data-bn9-setup]), textarea:not([data-bn9-setup])").forEach(input => {
            input.dataset.bn9Setup = "true";

            let warningMessage = document.createElement("div");
            warningMessage.classList.add("warning-message");
            warningMessage.style.fontSize = "12px";
            warningMessage.style.marginTop = "4px";
            warningMessage.style.display = "none";
            input.parentNode.insertBefore(warningMessage, input.nextSibling);

            input.addEventListener("input", () => {
                if (!isModuleActive('rt_mod_blockname')) {
                    warningMessage.style.display = "none";
                    input.style.backgroundColor = "white";
                    input.style.color = "black";
                    return;
                }
                bn9_debounce(input, () => {
                    const inputValue = bn9_normalizeText(input.value);
                    const { score: highestSimilarity, name: matchedBlockedName, note } = bn9_bestSimilarityMatch(inputValue, index, 0.5);

                    input.style.backgroundColor = "white";
                    input.style.color = "black";
                    warningMessage.style.display = "none";

                    const isGreenWord = greenWords.some(word => inputValue.includes(bn9_normalizeText(word)));

                    if (isGreenWord) {
                        input.style.backgroundColor = "white";
                        input.style.color = "black";
                        warningMessage.textContent = "✅";
                        warningMessage.style.color = "black";
                        warningMessage.style.display = "block";
                    } else if (highestSimilarity >= 0.7) {
                        input.style.backgroundColor = "red";
                        input.style.color = "white";
                        warningMessage.textContent = `❌ Warning: "${matchedBlockedName}" ${note ? `>> ${note}` : ''}`;
                        warningMessage.style.color = "red";
                        warningMessage.style.display = "block";
                    } else if (highestSimilarity >= 0.5) {
                        input.style.backgroundColor = "yellow";
                        input.style.color = "red";
                        warningMessage.textContent = `⚠️ Caution: ("${matchedBlockedName}") ${note ? `>> ${note}` : ''}`;
                        warningMessage.style.color = "red";
                        warningMessage.style.display = "block";
                    }

                    blockedDates.forEach(date => {
                        if (inputValue.includes(bn9_normalizeText(date))) {
                            input.style.backgroundColor = "red";
                            input.style.color = "white";
                            warningMessage.textContent = `❌ Warning: "${date}" is a blocked date.`;
                            warningMessage.style.color = "red";
                            warningMessage.style.display = "block";
                        }
                    });
                }, 150);
            });
        });

        document.querySelectorAll(".select2-selection__rendered:not([data-bn9-setup])").forEach(span => {
            span.dataset.bn9Setup = "true";

            let warningMessage = document.createElement("div");
            warningMessage.classList.add("warning-message");
            warningMessage.style.fontSize = "12px";
            warningMessage.style.marginTop = "4px";
            warningMessage.style.display = "none";
            span.parentNode.appendChild(warningMessage);

            bn9_select2Handlers.set(span, () => {
                if (!isModuleActive('rt_mod_blockname')) {
                    warningMessage.style.display = "none";
                    span.style.backgroundColor = "white";
                    span.style.color = "black";
                    return;
                }
                const inputValue = bn9_normalizeText(span.textContent || "");
                const { score: highestSimilarity, name: matchedBlockedName, note } = bn9_bestSimilarityMatch(inputValue, index, 0.88);

                span.style.backgroundColor = "white";
                span.style.color = "black";
                warningMessage.style.display = "none";

                const isGreenWord = greenWords.some(word => inputValue.includes(bn9_normalizeText(word)));

                if (isGreenWord) {
                    span.style.backgroundColor = "white";
                    span.style.color = "black";
                    warningMessage.textContent = "✅";
                    warningMessage.style.color = "black";
                    warningMessage.style.display = "block";
                } else if (highestSimilarity >= 0.9) {
                    span.style.backgroundColor = "red";
                    span.style.color = "white";
                    warningMessage.textContent = `❌ Warning: "${matchedBlockedName}" ${note ? `>> ${note}` : ''}`;
                    warningMessage.style.color = "red";
                    warningMessage.style.display = "block";
                } else if (highestSimilarity >= 0.88) {
                    span.style.backgroundColor = "yellow";
                    span.style.color = "red";
                    warningMessage.textContent = `⚠️ Caution: ("${matchedBlockedName}") ${note ? `>> ${note}` : ''}`;
                    warningMessage.style.color = "red";
                    warningMessage.style.display = "block";
                }

                blockedDates.forEach(date => {
                    if (inputValue.includes(bn9_normalizeText(date))) {
                        span.style.backgroundColor = "red";
                        span.style.color = "white";
                        warningMessage.textContent = `❌ Warning: "${date}" is a blocked date.`;
                        warningMessage.style.color = "red";
                        warningMessage.style.display = "block";
                    }
                });
            });

            bn9_getSelect2Observer().observe(span, { childList: true, characterData: true, subtree: true });
        });

        bn9_checkStaticText(index, greenWords, blockedDates);
    }

    function bn9_checkStaticText(index, greenWords, blockedDates) {
        if (!isModuleActive('rt_mod_blockname')) return;
        document.querySelectorAll(".static_text:not([data-bn9-static-setup])").forEach(div => {
            div.dataset.bn9StaticSetup = "true";

            let warningDiv = document.createElement("div");
            warningDiv.className = "warning-message";
            warningDiv.style.fontSize = "12px";
            warningDiv.style.marginTop = "4px";
            warningDiv.style.display = "none";
            div.insertAdjacentElement("afterend", warningDiv);

            function updateWarning() {
                if (!isModuleActive('rt_mod_blockname')) {
                    warningDiv.style.display = "none";
                    return;
                }
                const inputValue = bn9_normalizeText(div.textContent || "");
                const { score: highestSimilarity, name: matchedBlockedName, note } = bn9_bestSimilarityMatch(inputValue, index, 0.7);

                warningDiv.style.display = "none";
                warningDiv.style.backgroundColor = "transparent";
                warningDiv.style.color = "black";

                const isGreenWord = greenWords.some(word => inputValue.includes(bn9_normalizeText(word)));

                if (isGreenWord) {
                    warningDiv.style.display = "block";
                    warningDiv.style.backgroundColor = "white";
                    warningDiv.style.color = "black";
                    warningDiv.textContent = "✅";
                } else if (highestSimilarity >= 0.9) {
                    warningDiv.style.display = "block";
                    warningDiv.style.backgroundColor = "red";
                    warningDiv.style.color = "white";
                    warningDiv.textContent = `❌ Warning: "${matchedBlockedName}" ${note ? `>> ${note}` : ''}`;
                } else if (highestSimilarity >= 0.7) {
                    warningDiv.style.display = "block";
                    warningDiv.style.backgroundColor = "yellow";
                    warningDiv.style.color = "red";
                    warningDiv.textContent = `⚠️ Caution: ("${matchedBlockedName}") ${note ? `>> ${note}` : ''}`;
                }

                blockedDates.forEach(date => {
                    if (inputValue.includes(bn9_normalizeText(date))) {
                        warningDiv.style.display = "block";
                        warningDiv.style.backgroundColor = "red";
                        warningDiv.style.color = "white";
                        warningDiv.textContent = `❌ Warning: "${date}" is a blocked date.`;
                    }
                });
            }

            updateWarning();
        });
    }

    function bn9_evaluateElement(el, index) {
        if (!isModuleActive('rt_mod_blockname')) return;
        if (!el || el.classList.contains("warning-message") || el.dataset.bnDone) return;
        const raw = (el.textContent || "").trim();
        el.dataset.bnDone = "true";
        if (!raw) return;

        const textNorm = bn9_normalizeText(raw);
        const { score, name, note } = bn9_bestSimilarityMatch(textNorm, index, 0.9);

        if (!el.dataset.origColor) {
            el.dataset.origColor = el.style.color || "";
            el.dataset.origWeight = el.style.fontWeight || "";
            el.dataset.origTitle = el.title || "";
        }

        if (score >= 0.9) {
            el.style.color = "red";
            el.style.fontWeight = "bold";
            el.title = `❌ Blocked: ${name}${note ? ` >> ${note}` : ""}`;
            el.dataset.flagged = "true";
        }
    }

    async function bn9_startHighlighter() {
        if (!isModuleActive('rt_mod_blockname')) return;
        const index = await bn9_buildBlockedIndex();
        if (!index) return;
        document.querySelectorAll("td:not([data-bn-done])").forEach(el => bn9_evaluateElement(el, index));
    }

    // =========================================================================
    // MODULE 2: LAST VISA & PENAL (v9.2 logic, v9.3 perf)
    // =========================================================================
    let vp_cache = null;
    async function vp_fetchBlockList() {
        if (vp_cache) return vp_cache;
        try {
            vp_cache = await rtCachedFetch("https://raw.githubusercontent.com/darort/blockname/main/lastvisapenal6.json", 'rt_cache_visapenal');
            return { settings: vp_cache.settings || {}, dateNotes: vp_cache.dateNotes || [], otherNotes: vp_cache.otherNotes || [] };
        } catch (error) {
            return { settings: {}, dateNotes: [], otherNotes: [] };
        }
    }

    function vp_normalizeDate(d) {
        if (!(d instanceof Date) || isNaN(d)) return null;
        d.setHours(0, 0, 0, 0);
        return d;
    }

    function vp_parseWebsiteDate(text) {
        if (!text) return null;
        const m = text.trim().match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
        if (!m) return null;
        return vp_normalizeDate(new Date(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10)));
    }

    function vp_parseRuleDate(value) {
        if (!value || typeof value !== "string") return null;
        const v = value.trim();
        const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!m) return null;
        return vp_normalizeDate(new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10)));
    }

    function vp_daysBetween(fromDate, toDate) {
        const start = vp_normalizeDate(new Date(fromDate));
        const end = vp_normalizeDate(new Date(toDate));
        if (!start || !end) return null;
        return Math.floor((end - start) / (1000 * 60 * 60 * 24));
    }

    async function vp_highlightCells() {
        if (!isModuleActive('rt_mod_visapenal')) return;
        const cfg = await vp_fetchBlockList();
        let { settings, dateNotes, otherNotes } = cfg;

        if (settings.enabled === false) return;

        const redMinDays = typeof settings.redMinDays === "number" ? settings.redMinDays : 85;
        const yellowMinDays = typeof settings.yellowMinDays === "number" ? settings.yellowMinDays : null;
        const yellowMaxDays = typeof settings.yellowMaxDays === "number" ? settings.yellowMaxDays : null;

        const greenFutureLimit = settings.greenFutureTo ? vp_parseRuleDate(settings.greenFutureTo) : null;
        const pastDateFrom = settings.pastDateFrom ? vp_parseRuleDate(settings.pastDateFrom) : null;

        const redConfig = dateNotes.find(n => n.type === "red") || { note: "✕" };
        const greenConfig = dateNotes.find(n => n.type === "green") || { note: "✓" };
        const yellowConfig = dateNotes.find(n => n.type === "yellow") || { note: "-" };

        const compiledOtherNotes = otherNotes.map(item => {
            const patStr = String(item.pattern).trim();
            const isNumeric = /^\d+$/.test(patStr);
            let regex = null;
            if (!isNumeric) { try { regex = new RegExp(patStr); } catch (e) { regex = null; } }
            return { note: item.note, isNumeric, num: isNumeric ? parseInt(patStr, 10) : null, regex };
        });

        const today = new Date();
        vp_normalizeDate(today);

        document.querySelectorAll("td:not(.vp-highlighted)").forEach(el => {
            el.classList.add("vp-highlighted");

            const text = el.innerText.trim();
            if (!text) return;

            let matched = false;
            let isDateCell = false;

            if (settings.enableDateRules !== false) {
                const cellDate = vp_parseWebsiteDate(text);
                if (cellDate) {
                    isDateCell = true;

                    if (pastDateFrom && cellDate < pastDateFrom) {
                        // Ignore
                    } else if (cellDate <= today) {
                        const diffDays = vp_daysBetween(cellDate, today);
                        if (diffDays !== null && diffDays >= 0) {
                            let inYellowRange = false;
                            if (yellowMinDays !== null && diffDays >= yellowMinDays) {
                                if (yellowMaxDays === null || diffDays <= yellowMaxDays) inYellowRange = true;
                            }

                            if (inYellowRange) vp_highlightElement(el, yellowConfig.note, "black", "yellow");
                            else if (diffDays >= redMinDays) vp_highlightElement(el, redConfig.note, "white", "red");
                            else vp_highlightElement(el, greenConfig.note, "white", "green");

                            matched = true;
                        }
                    } else {
                        if (!greenFutureLimit || cellDate <= greenFutureLimit) {
                            vp_highlightElement(el, greenConfig.note, "white", "green");
                            matched = true;
                        }
                    }
                }
            }

            if (matched) return;

            if (settings.enableOtherRules !== false && !isDateCell) {
                const trimmed = text.trim();
                const isNumericCell = /^\d+$/.test(trimmed);

                if (isNumericCell) {
                    const num = parseInt(trimmed, 10);
                    for (const item of compiledOtherNotes) {
                        if (item.isNumeric && item.num === num) {
                            vp_highlightElement(el, item.note, "white", "red");
                            break;
                        }
                    }
                } else {
                    for (const item of compiledOtherNotes) {
                        if (item.isNumeric || !item.regex) continue;
                        if (item.regex.test(trimmed)) {
                            vp_highlightElement(el, item.note, "white", "red");
                            break;
                        }
                    }
                }
            }
        });
    }

    function vp_highlightElement(el, note, textColor, backgroundColor) {
        const originalText = el.innerText.trim();
        el.innerHTML = `
            <div style="display: flex; flex-direction: row; align-items: center;">
                <span style="color: black; padding: 2px;">${originalText}</span>
                <span style="background-color: ${backgroundColor}; color: ${textColor}; padding: 2px; margin-left: 5px; font-size: 0.8em;">${note}</span>
            </div>
        `;
    }

    // =========================================================================
    // MODULE 3: NATIONALITY CHECKER (v7.0)
    // =========================================================================
    let nat_greenNotesCache = null;
    async function nat_fetchBlockList() {
        if (nat_greenNotesCache) return nat_greenNotesCache;
        try {
            const data = await rtCachedFetch("https://cdn.jsdelivr.net/gh/darort/blockname@main/nationalitycheck7.json", 'rt_cache_nationality');
            nat_greenNotesCache = data.greenNotes || {};
            return nat_greenNotesCache;
        } catch(error) { return {}; }
    }

    async function nat_highlightCells() {
        if (!isModuleActive('rt_mod_nationality')) return;
        const greenNotes = await nat_fetchBlockList();
        document.querySelectorAll("tr:not([data-nat-done])").forEach(row => {
            row.dataset.natDone = "true";

            const cells = row.querySelectorAll("td");
            let natCell = null, cityCell = null, natText = null, cityText = null;

            cells.forEach(cell => {
                const txt = cell.innerText.trim();
                if (greenNotes.hasOwnProperty(txt)) { natText = txt; natCell = cell; }
                if (Object.values(greenNotes).some(cities => cities.some(c => txt.toLowerCase().includes(c.toLowerCase())))) { cityText = txt; cityCell = cell; }
            });

            if (natCell && cityCell) {
                const lowerNat = natText.toLowerCase();
                const lowerCity = cityText.toLowerCase();
                const isMatch = Object.entries(greenNotes).some(([n, cities]) => n.toLowerCase() === lowerNat && cities.some(c => lowerCity === c.toLowerCase()));
                if (isMatch) {
                    natCell.style.backgroundColor = "green"; natCell.style.color = "white";
                    cityCell.style.backgroundColor = "green"; cityCell.style.color = "white";
                }
            }
        });
    }

    // =========================================================================
    // MODULE 4: CARD RECEIVED CHECK (v6.0)
    // =========================================================================
    let cr_cache = null;
    async function cr_fetchBlockList() {
        if (cr_cache) return cr_cache;
        try {
            cr_cache = await rtCachedFetch("https://raw.githubusercontent.com/darort/blockname/main/cardreceived6.json", 'rt_cache_cardreceived');
            return {
                redNotes: cr_cache.redNotes || [],
                greenNotes: cr_cache.greenNotes || [],
                disableIcons: cr_cache.disableIcons || []
            };
        } catch (error) {
            return { redNotes: [], greenNotes: [], disableIcons: [] };
        }
    }

    async function cr_highlightCells() {
        if (!isModuleActive('rt_mod_cardreceived')) return;
        const { redNotes, greenNotes, disableIcons } = await cr_fetchBlockList();
        const tables = document.querySelectorAll("table");
        if (tables.length === 0) return;

        tables.forEach(table => {
            const headers = Array.from(table.querySelectorAll("th"));
            const cardReceivedIndex = headers.findIndex(th => th.innerText.trim() === "Card Received At");
            const workerNameIndex = headers.findIndex(th => th.innerText.trim() === "Worker Name");

            if (cardReceivedIndex === -1) return;

            const rows = table.querySelectorAll("tr");
            rows.forEach((row, index) => {
                if (index === 0) return;
                const cells = row.querySelectorAll("td");
                if (!cells.length) return;

                const cardReceivedCell = cells[cardReceivedIndex];
                const cardReceivedText = cardReceivedCell ? cardReceivedCell.innerText.trim() : "";

                if (cardReceivedText !== "" && disableIcons && disableIcons.length > 0) {
                    disableIcons.forEach(icon => {
                        if (icon.action === "disable") {
                            let icons = row.querySelectorAll(icon.selector);
                            if (icons.length === 0) {
                                icons = document.querySelectorAll(icon.selector);
                            }

                            icons.forEach(iconElement => {
                                if (iconElement.classList.contains("disabled-icon")) return;

                                iconElement.style.pointerEvents = "none";
                                iconElement.style.opacity = "0.5";
                                iconElement.style.filter = "grayscale(100%)";
                                iconElement.style.cursor = "not-allowed";
                                iconElement.classList.add("disabled-icon");

                                const clone = iconElement.cloneNode(true);
                                iconElement.parentNode.replaceChild(clone, iconElement);

                                clone.addEventListener("click", (e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    e.stopImmediatePropagation();
                                }, true);

                                const parent = clone.parentElement;
                                if (parent && (parent.tagName === "BUTTON" || parent.tagName === "A" || parent.hasAttribute("onclick"))) {
                                    parent.style.pointerEvents = "none";
                                    parent.style.opacity = "0.5";
                                    parent.style.cursor = "not-allowed";
                                    parent.addEventListener("click", (e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        e.stopImmediatePropagation();
                                    }, true);
                                }
                            });
                        }
                    });
                }

                if (workerNameIndex !== -1 && cardReceivedText !== "") {
                    const workerNameCell = cells[workerNameIndex];
                    if (workerNameCell && !workerNameCell.classList.contains("cr-highlighted") && !workerNameCell.classList.contains("highlighted")) {
                        const workerName = workerNameCell.innerText.trim();
                        const specificGreenNote = greenNotes.find(note =>
                            note.note && note.note.includes("good") && note.pattern === workerName
                        );
                        if (specificGreenNote) {
                            cr_highlightElement(workerNameCell, specificGreenNote.note, "white", "green");
                            workerNameCell.classList.add("cr-highlighted", "highlighted");
                        } else {
                            const genericGreenNote = greenNotes.find(note =>
                                note.note && !note.note.includes("good") && note.pattern === ".*"
                            );
                            if (genericGreenNote) {
                                cr_highlightElement(workerNameCell, genericGreenNote.note, "white", "green");
                                workerNameCell.classList.add("cr-highlighted", "highlighted");
                            }
                        }
                    }
                }

                cells.forEach(el => {
                    if (el.classList.contains("cr-highlighted") || el.classList.contains("highlighted")) return;
                    const text = el.innerText.trim();
                    if (!text) return;

                    for (const item of redNotes) {
                        const pattern = item.pattern;
                        const note = item.note || "No note available";
                        if (pattern && (pattern.startsWith(".*") || pattern.includes("\\"))) {
                            try {
                                const regex = new RegExp(pattern);
                                if (regex.test(text)) {
                                    cr_highlightElement(el, note, "white", "red");
                                    el.classList.add("cr-highlighted", "highlighted");
                                    return;
                                }
                            } catch (_) {}
                        } else if (pattern === text) {
                            cr_highlightElement(el, note, "white", "red");
                            el.classList.add("cr-highlighted", "highlighted");
                            return;
                        }
                    }

                    for (const item of greenNotes) {
                        const pattern = item.pattern;
                        const note = item.note || "No note available";
                        if ((note && note.includes("good")) || pattern === ".*") continue;

                        if (pattern && (pattern.startsWith(".*") || pattern.includes("\\"))) {
                            try {
                                const regex = new RegExp(pattern);
                                if (regex.test(text)) {
                                    cr_highlightElement(el, note, "white", "green");
                                    el.classList.add("cr-highlighted", "highlighted");
                                    return;
                                }
                            } catch (_) {}
                        } else if (pattern === text) {
                            cr_highlightElement(el, note, "white", "green");
                            el.classList.add("cr-highlighted", "highlighted");
                            return;
                        }
                    }
                });
            });
        });
    }

    function cr_highlightElement(el, note, textColor, backgroundColor) {
        const originalText = el.innerText.trim();
        const fontSize = backgroundColor === "green" ? "0.8em" : "1em";
        el.innerHTML = `
            <div style="display: flex; flex-direction: row; align-items: center;">
                <span style="background-color: ${backgroundColor}; color: ${textColor}; padding: 2px; margin-right: 5px; font-size: ${fontSize};">${note}</span>
                <span style="color: black; padding: 2px;">${originalText}</span>
            </div>
        `;
    }

    // =========================================================================
    // MODULE 5: PASSPORT NUMBER CHECKER (v6.0)
    // =========================================================================
    let pass_cache = null;
    async function pass_fetchBlockList() {
        if (pass_cache) return pass_cache;
        try {
            let response = await fetch("https://raw.githubusercontent.com/darort/blockname/main/nationalitycheck7.json");
            if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
            pass_cache = await response.json();
            return { greenNotes: pass_cache.greenNotes || {}, passportRules: pass_cache.passportRules || {} };
        } catch (error) { return { greenNotes: {}, passportRules: {} }; }
    }

    async function pass_highlightCells() {
        if (!isModuleActive('rt_mod_passport')) return;
        let { greenNotes, passportRules } = await pass_fetchBlockList();
        let tables = document.querySelectorAll("table");
        if (tables.length === 0) return;

        tables.forEach(table => {
            let headers = Array.from(table.querySelectorAll("th"));
            let nationalityIndex = headers.findIndex(th => th.innerText.trim() === "Nationality");
            let placeOfBirthIndex = headers.findIndex(th => th.innerText.trim() === "Place of Birth");
            let passportIndex = headers.findIndex(th => th.innerText.trim() === "Passport No");

            if (nationalityIndex === -1 || placeOfBirthIndex === -1 || passportIndex === -1) return;

            table.querySelectorAll("tr:not([data-pass-done])").forEach((row, index) => {
                if (index === 0) return;
                let cells = row.querySelectorAll("td");
                if (!cells.length) return;

                let nationalityCell = cells[nationalityIndex];
                let placeOfBirthCell = cells[placeOfBirthIndex];
                let passportCell = cells[passportIndex];

                if (nationalityCell && placeOfBirthCell && passportCell) {
                    let nationality = nationalityCell.innerText.trim().toLowerCase();
                    let placeOfBirth = placeOfBirthCell.innerText.trim().toUpperCase();
                    let passportNo = passportCell.innerText.trim();

                    const normalizedNationality = Object.keys(greenNotes).find(key => key.toLowerCase() === nationality);
                    if (normalizedNationality && !placeOfBirthCell.classList.contains("pass-highlighted")) {
                        if (greenNotes[normalizedNationality] && greenNotes[normalizedNationality].includes(placeOfBirth)) {
                            pass_highlightElement(placeOfBirthCell, "", "white", "green");
                            placeOfBirthCell.classList.add("pass-highlighted");
                        }
                    }

                    if (passportRules[normalizedNationality] && !passportCell.classList.contains("pass-highlighted")) {
                        const rules = passportRules[normalizedNationality];
                        if (passportNo.length !== rules.length) {
                            let note = passportNo.length > rules.length ? rules.tooLongNote : rules.tooShortNote;
                            pass_highlightElement(passportCell, note, "white", "red");
                            passportCell.classList.add("pass-highlighted");
                        } else {
                            pass_highlightElement(passportCell, rules.validNote, "white", "green");
                            passportCell.classList.add("pass-highlighted");
                        }
                    }
                    row.dataset.passDone = "true";
                }
            });
        });
    }

    function pass_highlightElement(el, note, textColor, backgroundColor) {
        const originalText = el.innerText.trim();
        if (note === "") {
            el.innerHTML = `<span style="background-color: ${backgroundColor}; color: ${textColor}; padding: 2px;">${originalText}</span>`;
        } else {
            el.innerHTML = `
                <div style="display: flex; flex-direction: row; align-items: center;">
                    <span style="background-color: ${backgroundColor}; color: ${textColor}; padding: 2px; margin-right: 5px; font-size: 0.8em;">${note}</span>
                    <span style="color: black; padding: 2px;">${originalText}</span>
                </div>
            `;
        }
    }

    // =========================================================================
    // MODULE 6: PAYMENT CHECK (v6.0)
    // =========================================================================
    let pay_blockListCache = null;
    let pay_isHighlighting = false;

    async function pay_fetchBlockList() {
        if (pay_blockListCache) return pay_blockListCache;
        try {
            const response = await fetch("https://cdn.jsdelivr.net/gh/darort/blockname@main/paidcheck6.json", { cache: "default" });
            if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
            pay_blockListCache = await response.json();
            return { redNotes: pay_blockListCache.redNotes || [], greenNotes: pay_blockListCache.greenNotes || [], disabledIcons: pay_blockListCache.disabledIcons || [] };
        } catch (error) { return { redNotes: [], greenNotes: [], disabledIcons: [] }; }
    }

    async function pay_highlightCells() {
        if (!isModuleActive('rt_mod_paymentcheck')) return;
        if (pay_isHighlighting) return;
        pay_isHighlighting = true;

        try {
            const { greenNotes, disabledIcons } = await pay_fetchBlockList();
            const tables = document.querySelectorAll("table");
            if (tables.length === 0) return;

            tables.forEach(table => {
                const headers = Array.from(table.querySelectorAll("th"));
                const idIndex = headers.findIndex(th => th.innerText.trim() === "ID");
                const paymentStatusIndex = headers.findIndex(th => th.innerText.trim() === "Payment Status");

                let checkboxIndex = -1;
                const rows = table.querySelectorAll("tr");
                if (rows.length > 1) {
                    const firstDataRowCells = rows[1].querySelectorAll("td");
                    checkboxIndex = Array.from(firstDataRowCells).findIndex(cell => cell.querySelector('input[type="checkbox"]'));
                }

                if (idIndex === -1 || paymentStatusIndex === -1 || checkboxIndex === -1) return;

                rows.forEach((row, index) => {
                    if (index === 0 || row.dataset.payDone) return;
                    const cells = row.querySelectorAll("td");
                    if (!cells.length) return;

                    const paymentStatusCell = cells[paymentStatusIndex];
                    const checkboxCell = cells[checkboxIndex];
                    const paymentStatusText = paymentStatusCell.innerText.trim();
                    let isMatchedGreen = false;

                    greenNotes.forEach(({ pattern, note }) => {
                        if (paymentStatusText === pattern) {
                            isMatchedGreen = true;
                            if (checkboxCell && !checkboxCell.classList.contains("pay-highlighted")) {
                                pay_highlightElement(checkboxCell, note, "white", "green", true);
                                checkboxCell.classList.add("pay-highlighted");
                            }
                        }
                    });

                    if (isMatchedGreen) {
                        disabledIcons.forEach(icon => {
                            row.querySelectorAll(icon.selector).forEach(el => {
                                el.style.opacity = "0.4";
                                el.style.color = "grey";
                                el.style.cursor = "not-allowed";
                                el.style.pointerEvents = "none";
                            });
                        });
                        row.dataset.payDone = "true";
                    }
                });
            });
        } finally {
            pay_isHighlighting = false;
        }
    }

    function pay_highlightElement(el, note, textColor, backgroundColor, hideCheckbox=false) {
        const checkbox = el.querySelector('input[type="checkbox"]');
        const checkboxHTML = !hideCheckbox && checkbox ? checkbox.outerHTML : '';
        const fontSize = backgroundColor === "green" ? "0.8em" : "1em";
        el.innerHTML = `
            <div style="display:flex; flex-direction:row; align-items:center;">
                <span style="background-color:${backgroundColor}; color:${textColor}; padding:2px; margin-right:5px; font-size:${fontSize};">${note}</span>
                ${checkboxHTML}
            </div>
        `;
    }

    // =========================================================================
    // MODULE 7: SAVE PDF (v8.0)
    // =========================================================================
    function formatDateForURL(date) {
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
    }

    async function runSavePdf() {
        if (!isModuleActive('rt_mod_savepdf')) return;
        if (document.getElementById('pdf-link-container')) return;

        try {
            const pdfResponse = await fetch("https://raw.githubusercontent.com/darort/blockname/main/savepdf5.json");
            const pdfJson = await pdfResponse.json();
            if (!pdfJson.feature_status || pdfJson.feature_status.toLowerCase() !== 'on') return;

            const filterButton = Array.from(document.querySelectorAll('button')).find(el =>
                el.textContent.trim().toLowerCase() === 'filter'
            );

            if (filterButton && !document.getElementById('pdf-link-container')) {
                const pdfContainer = document.createElement('div');
                pdfContainer.id = 'pdf-link-container';
                pdfContainer.style.cssText = 'display:inline-flex; align-items:center; gap:10px; margin:0 10px; font-size:13px;';

                const pdfLabel = document.createElement('span');
                pdfLabel.textContent = 'Save PDF:';
                pdfLabel.style.fontWeight = 'bold';

                const inputBox = document.createElement('input');
                inputBox.type = 'text';
                inputBox.placeholder = pdfJson.placeholder_text;
                inputBox.style.cssText = 'font-size:12px; padding:3px 6px; width:150px; border:1px solid #ccc; border-radius:3px;';

                const generateLink = document.createElement('a');
                generateLink.textContent = pdfJson.link_text;
                generateLink.style.cssText = `color:${pdfJson.link_color}; text-decoration:underline; cursor:pointer; font-size:12px;`;
                generateLink.target = '_blank';

                const today = new Date();
                const formattedToday = formatDateForURL(today);
                const baseURL = `https://kingwinagency.net/reports/reports?token=${pdfJson.token}&from_date=${pdfJson.from_date}&to_date=${formattedToday}&branch=1&reports_type=11&date_type=1&line_code=CBM-100&created_by=&line_id=`;

                generateLink.onclick = (e) => {
                    const lineCode = inputBox.value.trim();
                    if (!lineCode) { e.preventDefault(); alert('Please enter a Line Code.'); return; }
                    generateLink.href = baseURL.replace('line_code=CBM-100', `line_code=${encodeURIComponent(lineCode)}`);
                };

                pdfContainer.appendChild(pdfLabel);
                pdfContainer.appendChild(inputBox);
                pdfContainer.appendChild(generateLink);
                filterButton.parentElement.insertBefore(pdfContainer, filterButton);
            }
        } catch (e) {}
    }

    // =========================================================================
    // MODULE 8: DATE COUNT (v5.0)
    // =========================================================================
    let dc_cachedConfig = null;
    async function dc_getConfig() {
        if (dc_cachedConfig) return dc_cachedConfig;
        try {
            const json = await rtCachedFetch("https://raw.githubusercontent.com/darort/blockname/main/days.json", 'rt_cache_datecount');
            dc_cachedConfig = {
                days: parseInt(json.days, 10) || 90,
                color: json.color || "green",
                note: json.note || "",
                thresholds: json.thresholds || { red: 90, yellow: 85, green: 0 },
                status: json.status || "on"
            };
            return dc_cachedConfig;
        } catch (e) {
            dc_cachedConfig = {
                days: 90,
                color: "green",
                note: "",
                thresholds: { red: 90, yellow: 85, green: 0 },
                status: "on"
            };
            return dc_cachedConfig;
        }
    }

    function dc_formatDate(date) {
        const options = { day: '2-digit', month: 'short', year: 'numeric' };
        return date.toLocaleDateString('en-GB', options).replace(/ /g, ' - ');
    }

    function dc_countDays(start, end) {
        const oneDay = 1000 * 60 * 60 * 24;
        return Math.round((end - start) / oneDay);
    }

    async function runDateCounter() {
        if (!isModuleActive('rt_mod_datecount')) {
            const existing = document.getElementById('custom-date');
            if (existing) existing.remove();
            return;
        }

        if (document.getElementById('custom-date')) return;

        const label = Array.from(document.querySelectorAll('label')).find(el =>
            el.textContent.trim() === 'Active Status'
        );
        if (!label) return;

        const config = await dc_getConfig();
        if (!config || (config.status && config.status.toLowerCase() !== "on")) return;

        if (document.getElementById('custom-date')) return;

        const { days: maxDays, color, note, thresholds } = config;
        const today = new Date();
        const mainDate = new Date(today);
        mainDate.setDate(today.getDate() - maxDays);

        const mainWrapper = document.createElement('div');
        mainWrapper.id = 'custom-date';
        mainWrapper.style.display = 'flex';
        mainWrapper.style.justifyContent = 'flex-start';
        mainWrapper.style.gap = '30px';
        mainWrapper.style.alignItems = 'flex-start';
        mainWrapper.style.marginTop = '6px';
        mainWrapper.style.fontSize = '13px';

        const leftContainer = document.createElement('div');
        leftContainer.style.display = 'flex';
        leftContainer.style.flexDirection = 'column';
        leftContainer.style.alignItems = 'flex-start';

        const dateSpan = document.createElement('span');
        dateSpan.textContent = '↪ ' + dc_formatDate(mainDate);
        dateSpan.style.color = color;
        dateSpan.style.fontWeight = 'bold';

        const noteEl = document.createElement('div');
        noteEl.textContent = note;
        noteEl.style.fontSize = 'smaller';
        noteEl.style.color = color;
        noteEl.style.marginTop = '2px';

        leftContainer.appendChild(dateSpan);
        if (note) leftContainer.appendChild(noteEl);

        const rightContainer = document.createElement('div');
        rightContainer.id = 'range-picker';
        rightContainer.style.display = 'flex';
        rightContainer.style.flexDirection = 'column';
        rightContainer.style.alignItems = 'flex-start';

        const title = document.createElement('strong');
        title.textContent = '📅 Pick Date Range';
        title.style.marginBottom = '4px';
        title.style.fontSize = '13px';

        const inputStart = document.createElement('input');
        inputStart.type = 'date';
        inputStart.style.fontSize = '12px';
        inputStart.style.padding = '3px 6px';

        const inputEnd = document.createElement('input');
        inputEnd.type = 'date';
        inputEnd.style.fontSize = '12px';
        inputEnd.style.padding = '3px 6px';

        const inputRow = document.createElement('div');
        inputRow.style.display = 'flex';
        inputRow.style.gap = '8px';
        inputRow.appendChild(inputStart);
        inputRow.appendChild(inputEnd);

        const result = document.createElement('div');
        result.style.marginTop = '5px';
        result.style.fontWeight = 'bold';
        result.style.fontSize = '13px';
        result.style.display = 'none';

        const getResultColor = (daysBetween) => {
            if (daysBetween > thresholds.red) return 'red';
            if (daysBetween > thresholds.yellow) return 'orange';
            return 'green';
        };

        const showResultIfValid = () => {
            const start = new Date(inputStart.value);
            const end = new Date(inputEnd.value);
            if (!isNaN(start) && !isNaN(end) && end >= start) {
                const daysBetween = dc_countDays(start, end);
                result.textContent = `🗓 From: ${dc_formatDate(start)} to ${dc_formatDate(end)} (${daysBetween} day${daysBetween !== 1 ? 's' : ''})`;
                result.style.color = getResultColor(daysBetween);
                result.style.display = 'block';
            } else {
                result.textContent = '';
                result.style.display = 'none';
            }
        };

        inputStart.addEventListener('change', showResultIfValid);
        inputEnd.addEventListener('change', showResultIfValid);

        rightContainer.appendChild(title);
        rightContainer.appendChild(inputRow);
        rightContainer.appendChild(result);

        mainWrapper.appendChild(leftContainer);
        mainWrapper.appendChild(rightContainer);

        if (label.parentElement) {
            label.parentElement.appendChild(mainWrapper);
        }
    }

    // =========================================================================
    // MODULE 9: LINK CLICK (v2.2)
    // =========================================================================
    const lc_configUrl = "https://cdn.jsdelivr.net/gh/darort/blockname@main/link2.json";
    const LC_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

    const lc_fallbackCfg = {
        enabled: true,
        buttonText: "My Button",
        buttonUrl: "https://example.com",
        buttonStyle: {
            background: "#e0e0e0",
            color: "black",
            border: "1px solid #888",
            padding: "4px 10px",
            borderRadius: "6px",
            fontSize: "12px",
            cursor: "pointer",
            textDecoration: "none",
            verticalAlign: "middle",
            marginRight: "10px"
        },
        label: {
            text: null,
            clickable: false,
            labelLink: "https://github.com/",
            color: null,
            disableTextClick: false
        }
    };

    let lc_cachedConfig = null;

    async function lc_loadConfig() {
        if (lc_cachedConfig) return lc_cachedConfig;
        try {
            const data = await rtCachedFetch(lc_configUrl, 'rt_cache_linkclick', LC_CACHE_TTL_MS);
            lc_cachedConfig = Object.assign({}, lc_fallbackCfg, data || {});
            return lc_cachedConfig;
        } catch (e) {
            lc_cachedConfig = lc_fallbackCfg;
            return lc_cachedConfig;
        }
    }

    function lc_findSearchLabel(root = document) {
        return Array.from(root.querySelectorAll("label")).find(l => l.querySelector('input[type="search"]')) || null;
    }

    function lc_ensureTextNode(label) {
        for (const n of label.childNodes) {
            if (n.nodeType === Node.TEXT_NODE) return n;
        }
        const t = document.createTextNode(" ");
        label.insertBefore(t, label.firstChild || null);
        return t;
    }

    function lc_createButton(cfg) {
        const a = document.createElement("a");
        a.className = "my-custom-btn";
        a.textContent = cfg.buttonText || "My Button";
        a.href = cfg.buttonUrl || "#";
        a.target = "_blank";
        a.rel = "noopener noreferrer";

        if (cfg.buttonStyle) {
            for (const [k, v] of Object.entries(cfg.buttonStyle)) {
                try { a.style[k] = v; } catch (_) {}
            }
        }
        return a;
    }

    function lc_applyLabelControls(label, cfg) {
        if (!cfg.label) return;

        const { text, clickable, labelLink, disableTextClick, color } = cfg.label;

        const oldWrapper = label.querySelector(".my-label-link");
        if (oldWrapper) {
            const txt = document.createTextNode(oldWrapper.textContent);
            label.insertBefore(txt, oldWrapper);
            oldWrapper.remove();
        }

        const textNode = lc_ensureTextNode(label);

        if (text !== null && text !== undefined) {
            textNode.textContent = String(text).trim() + ": ";
        }

        if (clickable) {
            const link = document.createElement("a");
            link.className = "my-label-link";
            link.href = labelLink || "#";
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            link.style.textDecoration = "underline";
            link.style.cursor = "pointer";

            if (color) link.style.color = color;
            if (disableTextClick) link.style.pointerEvents = "none";

            label.insertBefore(link, textNode);
            link.appendChild(textNode);
        } else {
            if (color) {
                textNode.parentElement.style.color = color;
            }
        }
    }

    function lc_insertButton(label, cfg) {
        if (!cfg.enabled) return;
        if (label.querySelector(".my-custom-btn")) return;

        const btn = lc_createButton(cfg);
        label.insertBefore(btn, label.firstChild);
    }

    async function runLinkClick() {
        if (!isModuleActive('rt_mod_linkclick')) {
            const btn = document.querySelector(".my-custom-btn");
            if (btn) btn.remove();
            const oldWrapper = document.querySelector(".my-label-link");
            if (oldWrapper) {
                const txt = document.createTextNode(oldWrapper.textContent);
                oldWrapper.parentElement?.insertBefore(txt, oldWrapper);
                oldWrapper.remove();
            }
            return;
        }

        const label = lc_findSearchLabel();
        if (!label) return;

        const cfg = await lc_loadConfig();
        if (!cfg) return;

        if (!label.querySelector(".my-custom-btn")) {
            lc_applyLabelControls(label, cfg);
            lc_insertButton(label, cfg);
        }
    }
    const runLinkCloud = runLinkClick;

    // Optional stub guard for external or unbundled modules
    function insertCancelTickButton() {}

    // =========================================================================
    // MODULE 11: 2024 CHECK (v2.1)
    // =========================================================================
    let c24_cache = null;
    async function c24_fetchBlockList() {
        if (c24_cache) return c24_cache;
        try {
            const data = await rtCachedFetch("https://raw.githubusercontent.com/darort/blockname/main/24check1.json", 'rt_cache_24check');
            c24_cache = { displayRules: data.displayRules || [], redNotes: data.redNotes || [], greenNotes: data.greenNotes || [], disableIcons: data.disableIcons || [] };
            return c24_cache;
        } catch (error) { return { displayRules: [], redNotes: [], greenNotes: [], disableIcons: [] }; }
    }

    async function c24_highlightCells() {
        if (!isModuleActive('rt_mod_24check')) return;
        const { displayRules } = await c24_fetchBlockList();
        const tables = document.querySelectorAll("table");
        if (tables.length === 0) return;

        tables.forEach(table => {
            const headers = Array.from(table.querySelectorAll("th"));
            const workerNameIndex = headers.findIndex(th => th.innerText.trim() === "Worker Name");
            const workPermitIndex = headers.findIndex(th => th.innerText.trim() === "Work Permit ID");
            const penalPriceIndex = headers.findIndex(th => th.innerText.trim() === "Penal Price");

            if (workerNameIndex === -1 || workPermitIndex === -1 || penalPriceIndex === -1) return;

            table.querySelectorAll("tr:not([data-c24-done])").forEach((row, rowIndex) => {
                if (rowIndex === 0) return;
                const cells = row.querySelectorAll("td");
                if (!cells.length) return;

                const workerNameCell = cells[workerNameIndex];
                const workPermitCell = cells[workPermitIndex];
                const penalPriceCell = cells[penalPriceIndex];

                const hasWorkPermit = workPermitCell && workPermitCell.innerText.trim() !== "";
                const hasPenalPrice = penalPriceCell && penalPriceCell.innerText.trim() !== "";

                let rule = null;
                if (hasWorkPermit && hasPenalPrice) {
                    rule = displayRules.find(r => r.condition === "hasWorkPermitAndPenal");
                } else if (hasWorkPermit && !hasPenalPrice) {
                    rule = displayRules.find(r => r.condition === "hasWorkPermitOnly");
                }

                if (rule && workerNameCell && !workerNameCell.classList.contains("c24-highlighted")) {
                    c24_highlightElement(workerNameCell, rule.sign, "white", rule.color);
                    workerNameCell.classList.add("c24-highlighted");
                }
                row.dataset.c24Done = "true";
            });
        });
    }

    function c24_highlightElement(el, note, textColor, backgroundColor) {
        const originalText = el.innerText.trim();
        el.innerHTML = `
            <div style="display: flex; align-items: center;">
                <span style="background-color: ${backgroundColor}; color: ${textColor}; padding: 2px 4px; margin-right: 6px; font-size: 0.9em;">${note}</span>
                <span style="color: black;">${originalText}</span>
            </div>
        `;
    }

    // =========================================================================
    // MODULE 12: GENDER SWITCHER (v7.0)
    // =========================================================================
    function runGenderSwitcher() {
        const switchBtnId = 'rt-gender-switch-btn';
        const existingSwitch = document.getElementById(switchBtnId);

        if (!isModuleActive('rt_mod_genderswitcher')) {
            if (existingSwitch) existingSwitch.remove();
            const container = document.getElementById('select2-gender-container');
            if (container) {
                container.style.pointerEvents = '';
                container.style.userSelect = '';
                container.removeAttribute('tabindex');
                container.style.backgroundColor = '';
                container.style.color = '';
                delete container.dataset.gsSetup;
            }
            return;
        }

        const container = document.getElementById('select2-gender-container');
        if (!container) return;

        const parent = container.parentNode;
        if (!parent) return;

        if (container.dataset.gsSetup === "true" && existingSwitch) {
            return;
        }

        container.dataset.gsSetup = "true";
        parent.style.position = 'relative';

        const genderSelect = document.getElementById('gender') || parent.querySelector('select');
        const label = document.querySelector('label[for="gender"]');
        if (label) label.style.display = 'inline-block';

        container.style.pointerEvents = 'none';
        container.style.userSelect = 'none';
        container.setAttribute('tabindex', '-1');

        const stopEvent = (e) => {
            e.preventDefault();
            e.stopPropagation();
        };
        ['mousedown', 'click', 'focus', 'keydown', 'touchstart'].forEach(evt => {
            container.addEventListener(evt, stopEvent);
        });

        const $ = window.jQuery || window.$;
        if (typeof $ !== 'undefined') {
            if (genderSelect && $(genderSelect).select2) {
                try { $(genderSelect).select2('close'); } catch (_) {}
            } else if ($(container).select2) {
                try { $(container).select2('close'); } catch (_) {}
            }
        }

        if (existingSwitch) existingSwitch.remove();

        const switchBtn = document.createElement('div');
        switchBtn.id = switchBtnId;
        switchBtn.style.width = '50px';
        switchBtn.style.height = '20px';
        switchBtn.style.border = '2px solid #888';
        switchBtn.style.borderRadius = '12px';
        switchBtn.style.cursor = 'pointer';
        switchBtn.style.position = 'absolute';
        switchBtn.style.left = '-80px';
        switchBtn.style.top = '50%';
        switchBtn.style.transform = 'translateY(-50%)';
        switchBtn.style.boxSizing = 'border-box';
        switchBtn.style.zIndex = '999';

        const circle = document.createElement('div');
        circle.id = 'rt-gender-switch-circle';
        circle.style.width = '18px';
        circle.style.height = '18px';
        circle.style.borderRadius = '50%';
        circle.style.backgroundColor = 'white';
        circle.style.position = 'absolute';
        circle.style.top = '1px';
        circle.style.transition = '0.3s';

        switchBtn.appendChild(circle);
        parent.appendChild(switchBtn);

        const setGenderByTextPrefix = (prefix) => {
            if (!genderSelect) return;
            const prefixLower = prefix.toLowerCase();
            const options = Array.from(genderSelect.options || []);
            const match = options.find(opt =>
                opt.text.trim().toLowerCase().startsWith(prefixLower)
            );

            if (match) {
                genderSelect.value = match.value;
                if (typeof $ !== 'undefined' && $(genderSelect).trigger) {
                    $(genderSelect).trigger('change');
                } else {
                    genderSelect.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }
        };

        const updateSwitchColor = () => {
            const text = (container.innerText || "").trim();
            const isMale = text.toLowerCase().startsWith('male');

            if (isMale) {
                switchBtn.style.backgroundColor = '#2196F3';
                container.style.backgroundColor = '#2196F3';
                container.style.color = '#ffffff';
                circle.style.left = '1px';
            } else {
                switchBtn.style.backgroundColor = '#e91e63';
                container.style.backgroundColor = '#e91e63';
                container.style.color = '#ffffff';
                circle.style.left = '31px';
            }
        };

        updateSwitchColor();

        const observer = new MutationObserver(updateSwitchColor);
        observer.observe(container, { childList: true, characterData: true, subtree: true });

        switchBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            const text = (container.innerText || "").trim().toLowerCase();
            if (text.startsWith('male')) {
                setGenderByTextPrefix('female');
            } else {
                setGenderByTextPrefix('male');
            }

            if (typeof $ !== 'undefined') {
                if (genderSelect && $(genderSelect).select2) {
                    try { $(genderSelect).select2('close'); } catch (_) {}
                }
                if ($(container).select2) {
                    try { $(container).select2('close'); } catch (_) {}
                }
            }

            container.blur();
            if (document.activeElement === container) {
                document.activeElement.blur();
            }

            setTimeout(updateSwitchColor, 50);
        });
    }

    // =========================================================================
    // OPTIMIZED THROTTLED EXECUTION CONTROLLER
    // =========================================================================
    let isExecuting = false;

    async function executeAllModules() {
        if (isExecuting) return;
        isExecuting = true;

        try {
            refreshActiveModulesCache();
            await bn9_checkInputFields();
            await bn9_startHighlighter();
            await vp_highlightCells();
            await nat_highlightCells();
            await cr_highlightCells();
            await pass_highlightCells();
            await pay_highlightCells();
            await runSavePdf();
            await runDateCounter();
            await runLinkClick();
            if (typeof insertCancelTickButton === 'function') insertCancelTickButton();
            await c24_highlightCells();
            runGenderSwitcher();
        } finally {
            isExecuting = false;
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", executeAllModules);
    } else {
        executeAllModules();
    }

    let debounceTimer = null;
    const observer = new MutationObserver((mutations) => {
        let hasMeaningfulChange = false;
        for (const m of mutations) {
            if (
                m.type === 'attributes' ||
                m.target.classList?.contains('warning-message') ||
                m.target.closest?.('#pdf-link-container, #custom-date, .my-custom-btn, .my-label-link, #rt-gender-switch-btn')
            ) {
                continue;
            }
            if (m.addedNodes.length > 0) {
                hasMeaningfulChange = true;
                break;
            }
        }

        if (hasMeaningfulChange) {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(executeAllModules, 800);
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    window.addEventListener('rt_ext_state_changed', () => {
        refreshActiveModulesCache();
        executeAllModules();
    });

})();
