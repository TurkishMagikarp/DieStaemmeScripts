(function () {
    'use strict';

    if (!/screen=main/.test(location.href)) return;
    if (window.__dsBuildQueueLoaded) return;
    window.__dsBuildQueueLoaded = true;

    const { gateInterval, gateTimeout, guardAction } = window.DSGuards || {};
    if (!gateInterval || !gateTimeout || !guardAction) {
        console.warn('[BuildBot] DSGuards not available → aborting for safety.');
        return;
    }

    const GMwrap = {
        async get(key, def) {
            try { return (await GM.getValue(key)) ?? def; } catch { return JSON.parse(localStorage.getItem(key) ?? 'null') ?? def; }
        },
        async set(key, val) {
            try { await GM.setValue(key, val); } catch { localStorage.setItem(key, JSON.stringify(val)); }
        },
        async del(key) { try { await GM.deleteValue(key); } catch { localStorage.removeItem(key); } }
    };

    const W = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    const game_data = W.game_data;
    const WORLD = game_data.world;
    const VILLAGE_ID = game_data.village?.id;
    const PLAYER_ID = game_data.player?.id;
    const K = (s) => 'dsu.buildbot.' + s + '.' + WORLD;

    const BUILDINGS = [
        { id: 'main',       name: 'Hauptgebäude' },
        { id: 'barracks',   name: 'Kaserne' },
        { id: 'stable',     name: 'Stall' },
        { id: 'garage',     name: 'Werkstatt' },
        { id: 'smith',      name: 'Schmiede' },
        { id: 'market',     name: 'Marktplatz' },
        { id: 'place',      name: 'Versammlungsplatz' },
        { id: 'statue',     name: 'Statue' },
        { id: 'wall',       name: 'Wall' },
        { id: 'snob',       name: 'Adelshof' },
        { id: 'farm',       name: 'Bauernhof' },
        { id: 'storage',    name: 'Speicher' },
        { id: 'hide',       name: 'Versteck' },
        { id: 'church',     name: 'Kirche' },
        { id: 'watchtower', name: 'Wachturm' },
        { id: 'timber',     name: 'Holzfällerlager' },
        { id: 'clay',       name: 'Lehmgrube' },
        { id: 'iron',       name: 'Eisenmine' },
    ];
    const BUILDING_MAP = {};
    BUILDINGS.forEach(function (b) { BUILDING_MAP[b.id] = b; });

    const PREREQS = {
        smith:      [{ building: 'main', level: 5 }, { building: 'barracks', level: 1 }],
        barracks:   [{ building: 'main', level: 3 }],
        stable:     [{ building: 'main', level: 10 }, { building: 'barracks', level: 5 }, { building: 'smith', level: 5 }],
        garage:     [{ building: 'main', level: 7 }],
        market:     [{ building: 'main', level: 3 }],
        snob:       [{ building: 'main', level: 20 }, { building: 'market', level: 10 }, { building: 'smith', level: 20 }],
        wall:       [{ building: 'main', level: 1 }],
    };

    const KEY_TEMPLATES = K('templates');
    const KEY_SELECTED = K('selectedTemplate') + '.' + VILLAGE_ID;
    const KEY_QUESTS = K('doQuests') + '.' + PLAYER_ID;
    const KEY_FOLD = K('foldState') + '.' + PLAYER_ID;

    var templates = [];
    var selectedIdx = -1;
    var doQuests = false;
    var isRunning = false;
    var isFolded = false;
    var cancelRunLoop = null;
    var cancelRepaintLoop = null;

    function getCurrentLevel(buildingId) {
        try {
            var gb = game_data.village.buildings || {};
            var map = { timber: 'wood', clay: 'stone' };
            var key = map[buildingId] || buildingId;
            return parseInt(gb[key] || 0);
        } catch { return 0; }
    }

    function getDisplayId(bid) {
        var map = { wood: 'timber', stone: 'clay' };
        return map[bid] || bid;
    }

    function getBuildingName(id) {
        var b = BUILDING_MAP[id];
        return b ? b.name : id;
    }

    function getPrereqs(buildingId) {
        return PREREQS[buildingId] || [];
    }

    function validateEntry(entry) {
        var warnings = [];
        if (!BUILDING_MAP[entry.building]) {
            warnings.push('Unbekanntes Gebäude: ' + entry.building);
            return warnings;
        }
        var current = getCurrentLevel(entry.building);
        var prereqs = getPrereqs(entry.building);
        for (var i = 0; i < prereqs.length; i++) {
            var p = prereqs[i];
            var pCur = getCurrentLevel(p.building);
            if (pCur < p.level) {
                warnings.push(getBuildingName(p.building) + ' benötigt Stufe ' + p.level + ' (aktuell: ' + pCur + ')');
            }
        }
        if (entry.level > 30) {
            warnings.push(getBuildingName(entry.building) + ' ' + entry.level + ' überschreitet Maximalstufe 30');
        }
        return warnings;
    }

    function validateQueue(queue) {
        var allWarnings = [];
        for (var i = 0; i < queue.length; i++) {
            var w = validateEntry(queue[i]);
            for (var j = 0; j < w.length; j++) {
                allWarnings.push('#' + (i + 1) + ': ' + w[j]);
            }
        }
        return allWarnings;
    }

    async function loadTemplates() {
        var raw = await GMwrap.get(KEY_TEMPLATES, []);
        templates = raw;
        selectedIdx = parseInt(await GMwrap.get(KEY_SELECTED, -1));
        if (selectedIdx < 0 || selectedIdx >= templates.length) {
            selectedIdx = templates.length > 0 ? 0 : -1;
        }
    }

    async function saveTemplates() {
        await GMwrap.set(KEY_TEMPLATES, templates);
    }

    function getQueue() {
        if (selectedIdx < 0 || selectedIdx >= templates.length) return [];
        var t = templates[selectedIdx];
        if (!t) return [];
        return t.queue || [];
    }

    async function setQueue(queue) {
        if (selectedIdx >= 0 && selectedIdx < templates.length) {
            templates[selectedIdx].queue = queue;
            await saveTemplates();
        }
    }

    function isVisible(el) {
        return el && el.offsetParent !== null;
    }

    function click(el) {
        if (!el) return;
        guardAction(function () {
            try {
                el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                el.click();
                el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
            } catch (e) {}
        });
    }

    function handleFreeComplete() {
        document.querySelectorAll('a.btn-instant-free').forEach(function (el) {
            if (isVisible(el)) click(el);
        });
    }

    function denyBrowserNotif() {
        var input = document.querySelector('input#browser_notification_enable');
        if (input) {
            input.checked = false;
            var btn = document.querySelector('a#browser_notification_enabled_button');
            if (btn) click(btn);
        }
    }

    var buildProgress = {};

    function tryBuildFromQueue(queue) {
        try {
            var additional = (game_data.features && game_data.features.Premium && game_data.features.Premium.active) ? 4 : 1;
            if (document.querySelectorAll('tr.sortable_row').length >= additional) return false;

            var map = { timber: 'wood', clay: 'stone', iron: 'iron' };
            for (var i = 0; i < queue.length; i++) {
                var entry = queue[i];
                var buildingId = map[entry.building] || entry.building;
                var targetLvl = entry.level;

                var current = getCurrentLevel(entry.building);
                var nextLvl = buildProgress[entry.building] || (current + 1);

                if (nextLvl > targetLvl) continue;

                var sel = 'a#main_buildlink_' + buildingId + '_' + nextLvl;
                var el = document.querySelector(sel);
                if (el) {
                    if (isVisible(el)) {
                        click(el);
                        buildProgress[entry.building] = nextLvl + 1;
                        return true;
                    }
                }

                var unmet = document.querySelector('#buildings_unmet a[href$="' + buildingId + '"]');
                if (current === 0 && unmet) return false;
                if (current === 0) return false;
            }
        } catch (e) {
            console.warn('[BuildBot] tryBuildFromQueue error:', e);
        }
        return false;
    }

    async function run() {
        try {
            handleFreeComplete();
            denyBrowserNotif();

            if (doQuests && document.querySelector('div#questlog > div.quest')) {
                var popup = document.querySelector('div#popup_box_quest');
                if (popup) {
                    var confirmBtn = popup.querySelector('a.btn-confirm-yes');
                    var closeBtn = popup.querySelector('a.popup_box_close');
                    click(confirmBtn || closeBtn);
                    gateTimeout(function () { run(); }, 1000);
                    return;
                }
            }

            var q = getQueue();
            tryBuildFromQueue(q);
        } catch (e) {
            console.warn('[BuildBot] run error:', e);
        }
    }

    function startRunLoop() {
        if (typeof cancelRunLoop === 'function') cancelRunLoop();
        buildProgress = {};
        isRunning = true;
        gateTimeout(function () { run(); }, 300);
        cancelRunLoop = gateInterval(function () { run(); }, 5000, {
            jitter: [250, 750],
            requireVisible: false
        });
    }

    function stopRunLoop() {
        if (typeof cancelRunLoop === 'function') cancelRunLoop();
        isRunning = false;
    }

    function buildQueueContent() {
        var queue = getQueue();
        var warnings = validateQueue(queue);

        var html = '<br/><table class="vis" style="width:100%;">';

        html += '<tr><th colspan="2" style="text-align:center;background-color:#c1a264;">Bauvorlagen-Verwaltung</th></tr>';

        html += '<tr><td colspan="2" style="padding:6px;text-align:center;">';
        html += '<select id="tkk-template-select" style="width:40%;margin-right:4px;">';
        if (templates.length === 0) {
            html += '<option value="">– Keine Vorlagen –</option>';
        } else {
            for (var ti = 0; ti < templates.length; ti++) {
                var tName = templates[ti].name || 'Vorlage ' + (ti + 1);
                html += '<option value="' + ti + '"' + (ti === selectedIdx ? ' selected' : '') + '>' + tName + '</option>';
            }
        }
        html += '</select>';
        html += '<input type="button" id="tkk-template-new" value="Neu" class="btn" style="width:8%;"/>';
        html += '<input type="button" id="tkk-template-save" value="Umbenennen" class="btn" style="width:12%;"/>';
        html += '<input type="button" id="tkk-template-del" value="Löschen" class="btn" style="width:8%;"/>';
        html += '</td></tr>';

        var foldIcon = isFolded ? 'plus' : 'minus';
        html += '<tr><th colspan="2"><img id="tkk-fold" src="graphic/' + foldIcon + '.png" style="vertical-align:-4px;cursor:pointer;"/> Bau-Reihenfolge</th></tr>';

        if (!isFolded) {
            html += '<tr><td colspan="2" style="padding:4px;">';
            html += '<table class="vis" style="width:100%;">';
            html += '<tr><th style="width:40px;">#</th><th>Gebäude</th><th style="width:60px;">Stufe</th><th style="width:30px;"></th></tr>';

            if (queue.length === 0) {
                html += '<tr><td colspan="4" style="text-align:center;padding:8px;color:#888;">Keine Einträge. Füge Gebäude hinzu.</td></tr>';
            } else {
                for (var qi = 0; qi < queue.length; qi++) {
                    var e = queue[qi];
                    var bName = getBuildingName(e && e.building);
                    var w = e && e.building ? validateEntry(e) : ['Ungültiger Eintrag'];
                    var targetLvl = parseInt(e && e.level, 10);
                    var currentLvl = e && e.building ? getCurrentLevel(e.building) : 0;
                    var isDone = Number.isFinite(targetLvl) && targetLvl > 0 && currentLvl >= targetLvl;
                    var color = isDone ? '#2e9f3f' : (w.length > 0 ? '#a009' : '#5a09');
                    html += '<tr>';
                    html += '<td style="text-align:center;background:' + color + ';">' + (qi + 1) + '</td>';
                    html += '<td>' + (bName || '???') + '</td>';
                    html += '<td style="text-align:center;">' + (e ? e.level : '?') + '</td>';
                    html += '<td><a href="#" class="tkk-remove-entry" data-idx="' + qi + '" style="color:#a00;text-decoration:none;">✖</a></td>';
                    html += '</tr>';
                }
            }
            html += '</table></td></tr>';

            html += '<tr><td colspan="2" style="padding:4px;text-align:center;">';
            html += '<select id="tkk-add-building" style="width:40%;margin-right:4px;">';
            for (var bi = 0; bi < BUILDINGS.length; bi++) {
                html += '<option value="' + BUILDINGS[bi].id + '">' + BUILDINGS[bi].name + '</option>';
            }
            html += '</select>';
            html += '<input type="number" id="tkk-add-level" value="1" min="1" max="30" style="width:60px;margin-right:4px;"/>';
            html += '<input type="button" id="tkk-add-entry" value="Hinzufügen" class="btn" style="width:12%;"/>';
            html += '<input type="button" id="tkk-clear-queue" value="Alle Leeren" class="btn" style="width:10%;"/>';
            html += '</td></tr>';

            if (warnings.length > 0) {
                html += '<tr><td colspan="2" style="padding:4px;">';
                html += '<div style="background:#fff3cd;border:1px solid #ffc107;border-radius:4px;padding:6px;font-size:12px;">';
                html += '<b>Warnungen:</b><br/>';
                for (var wi = 0; wi < warnings.length; wi++) {
                    html += '⚠ ' + warnings[wi] + '<br/>';
                }
                html += '</div></td></tr>';
            }
        }

        html += '<tr><td colspan="2" style="text-align:center;padding:6px;">';
        html += '<label style="margin-right:12px;"><input type="checkbox" id="tkk-quests"' + (doQuests ? ' checked' : '') + '/> Quests</label>';
        html += '<input type="button" id="tkk-start" value="' + (isRunning ? 'Stoppen' : 'Starten') + '" class="btn" style="width:12%;"' + (queue.length === 0 ? ' disabled' : '') + '/>';
        html += '</td></tr>';

        html += '</table>';
        return html;
    }

    var _renderCache = '';
    function render() {
        try {
            var container = document.getElementById('content_value') || document.querySelector('td#content_value') || document.body;
            var existing = document.getElementById('tkk-queue');
            var content = buildQueueContent();
            if (existing && _renderCache === content) return;

            if (existing) {
                existing.innerHTML = content;
            } else {
                var div = document.createElement('div');
                div.id = 'tkk-queue';
                div.innerHTML = content;
                var target = container.querySelector('table');
                if (target && target.parentNode) {
                    target.parentNode.insertBefore(div, target.nextSibling);
                } else {
                    container.appendChild(div);
                }
            }
            _renderCache = content;
        } catch (e) {
            console.error('[BuildBot] render error:', e);
        }
    }

    function wireHandlers() {
        document.body.addEventListener('click', function (ev) {
            var target = ev.target;
            var id = target && target.id;

            if (id === 'tkk-fold') {
                isFolded = !isFolded;
                GMwrap.set(KEY_FOLD, isFolded);
                render();
                return;
            }

            if (id === 'tkk-template-new') {
                (async function () {
                    var name = prompt('Name der neuen Vorlage:');
                    if (!name) return;
                    templates.push({ name: name, queue: [] });
                    selectedIdx = templates.length - 1;
                    await saveTemplates();
                    await GMwrap.set(KEY_SELECTED, selectedIdx);
                    render();
                })();
                return;
            }

            if (id === 'tkk-template-save') {
                (async function () {
                    if (selectedIdx < 0 || selectedIdx >= templates.length) return;
                    var name = prompt('Neuer Name:', templates[selectedIdx].name);
                    if (!name) return;
                    templates[selectedIdx].name = name;
                    await saveTemplates();
                    render();
                })();
                return;
            }

            if (id === 'tkk-template-del') {
                (async function () {
                    if (selectedIdx < 0 || selectedIdx >= templates.length) return;
                    if (!confirm('Vorlage "' + templates[selectedIdx].name + '" wirklich löschen?')) return;
                    templates.splice(selectedIdx, 1);
                    if (selectedIdx >= templates.length) selectedIdx = templates.length - 1;
                    await saveTemplates();
                    await GMwrap.set(KEY_SELECTED, selectedIdx);
                    render();
                })();
                return;
            }

            if (id === 'tkk-add-entry') {
                (async function () {
                    var building = document.getElementById('tkk-add-building').value;
                    var level = parseInt(document.getElementById('tkk-add-level').value) || 1;
                    if (!building) return;
                    var q = getQueue().slice();
                    q.push({ building: building, level: level });
                    await setQueue(q);
                    render();
                })();
                return;
            }

            if (id === 'tkk-clear-queue') {
                (async function () {
                    if (!confirm('Wirklich alle Einträge löschen?')) return;
                    await setQueue([]);
                    render();
                })();
                return;
            }

            if (id === 'tkk-start') {
                if (isRunning) {
                    stopRunLoop();
                    render();
                } else {
                    startRunLoop();
                    render();
                }
                return;
            }

            // Remove entry buttons
            if (target.classList && target.classList.contains('tkk-remove-entry')) {
                (async function () {
                    var idx = parseInt(target.getAttribute('data-idx'));
                    var q = getQueue().slice();
                    if (idx >= 0 && idx < q.length) {
                        q.splice(idx, 1);
                        await setQueue(q);
                        render();
                    }
                })();
                return;
            }
        });

        document.body.addEventListener('change', function (ev) {
            if (ev.target && ev.target.id === 'tkk-template-select') {
                selectedIdx = parseInt(ev.target.value);
                if (isNaN(selectedIdx) || selectedIdx < 0 || selectedIdx >= templates.length) {
                    selectedIdx = templates.length > 0 ? 0 : -1;
                }
                GMwrap.set(KEY_SELECTED, selectedIdx);
                render();
                return;
            }

            if (ev.target && ev.target.id === 'tkk-quests') {
                doQuests = ev.target.checked;
                GMwrap.set(KEY_QUESTS, doQuests);
            }
        });
    }

    (async function init() {
        try {
            doQuests = await GMwrap.get(KEY_QUESTS, false);
            var foldRaw = await GMwrap.get(KEY_FOLD, false);
            isFolded = foldRaw === true || foldRaw === 'plus';
            await loadTemplates();

            var waitForContent = setInterval(function () {
                var cv = document.getElementById('content_value') || document.querySelector('td#content_value');
                if (!cv) return;
                clearInterval(waitForContent);

                (async function () {
                    render();
                    wireHandlers();

                    if (typeof cancelRepaintLoop === 'function') cancelRepaintLoop();
                    cancelRepaintLoop = gateInterval(function () {
                        if (!document.getElementById('tkk-queue')) render();
                    }, 1000, { requireVisible: false });
                })();
            }, 100);
        } catch (e) {
            console.error('[BuildBot] init error:', e);
        }
    })();
})();
