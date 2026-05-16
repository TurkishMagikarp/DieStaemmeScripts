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
    const PLAYER_ID = game_data.player?.id;
    const VILLAGE_ID = game_data.village?.id;
    const K = (s) => 'dsu.buildbot.' + s + '.' + WORLD;

    const KEY_SELECTED = (vid) => K('selected') + '.' + vid;
    const KEY_QUEUE_T = (tIdx) => K('queueTemplate') + '.' + tIdx;
    const KEY_STATE = K('foldState') + '.' + PLAYER_ID;
    const KEY_QUESTS = K('doQuests') + '.' + PLAYER_ID;

    const CODES = [
        { name: 'wood', image: '3', title: 'Holzfällerlager', levels: 30 },
        { name: 'stone', image: '3', title: 'Lehmgrube', levels: 30 },
        { name: 'iron', image: '3', title: 'Eisenmine', levels: 30 },
        { name: 'farm', image: '3', title: 'Bauernhof', levels: 30 },
        { name: 'storage', image: '3', title: 'Speicher', levels: 30 },
        { name: 'main', image: '3', title: 'Hauptgebäude', levels: 30 },
        { name: 'place', image: '1', title: 'Versammlungsplatz', levels: 1 },
        { name: 'statue', image: '1', title: 'Statue', levels: 1 },
        { name: 'smith', image: '3', title: 'Schmiede', levels: 20 },
        { name: 'barracks', image: '3', title: 'Kaserne', levels: 25 },
        { name: 'stable', image: '3', title: 'Stall', levels: 20 },
        { name: 'garage', image: '3', title: 'Werkstatt', levels: 15 },
        { name: 'market', image: '3', title: 'Marktplatz', levels: 25 },
        { name: 'wall', image: '3', title: 'Wall', levels: 20 },
        { name: 'hide', image: '1', title: 'Versteck', levels: 10 },
        { name: 'snob', image: '1', title: 'Adelshof', levels: 1 },
        { name: 'church', image: '3', title: 'Kirche', levels: 3 },
        { name: 'watchtower', image: '3', title: 'Wachturm', levels: 20 }
    ];

    const FALLBACKS = (function () {
        var f = {};
        f.default = ["5","4","6","1","0","3","2","1","0","2","1","0","2","5","5","4","4","12","2","2","1","0","2","1","3","3","3","4","0","2","4","1","0","1","4","0","12","12","12","12","5","1","5","0","3","1","5","0","4","3","2","1","3","0","5","4","4","0","3","1","0","1","5","2","5","0","4","1","3","5","2","1","0","4","2","4","4","5","0","1","2","4","5","5","1","0","2","4","3","3","3","3","3","5","5","2","1","0","5","2","5","5","4","3","2","5","1","0","4","5","1","0","4","5","4","2","1","0","3","4","1","0","2","3","4","5","1","0","2","3","4","1","0","5","2","3","5","4","1","0","5","2","4","4","2","3","2","3","2","3","8","8","8","8","8","8","9","9","9","9","9","8","8","10","10","10","10","8","8","11","11","11","8","8","8","8","8","8","8","8","8","8","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-"];
        f[1] = ["5","0","1","2","3","4","5","0","1","2","3","4","5","0","1","2","3","4","5","0","1","2","3","4","5","0","1","2","3","4","9","12","12","13","5","0","1","2","4","13","12","5","0","1","2","13","4","12","5","0","1","2","4","13","12","5","0","1","2","4","5","0","1","2","4","0","1","0","1","5","4","12","0","1","2","0","1","5","4","12","2","0","1","9","9","9","9","8","8","8","8","8","10","10","10","0","1","2","5","4","12","0","1","2","0","1","2","5","4","12","0","1","2","5","4","12","1","0","2","5","4","0","1","2","5","4","0","1","2","5","4","0","1","2","5","4","0","1","2","5","4","0","1","2","0","1","2","4","0","1","2","-","-","-","-","-","-","-","-","-"];
        f[2] = ["5","0","1","2","3","4","5","0","1","2","3","4","5","0","1","2","3","4","5","0","1","2","3","4","5","0","1","2","3","4","9","12","12","13","5","0","1","2","4","13","12","5","0","1","2","13","4","12","5","0","1","2","4","13","12","5","0","1","2","4","5","0","1","2","4","0","1","0","1","5","13","4","12","0","1","2","0","1","5","4","12","2","0","1","9","9","9","9","13","8","8","8","8","8","10","10","10","0","1","2","5","4","12","0","1","2","0","1","2","5","4","12","0","1","2","5","4","12","1","0","2","5","4","0","1","2","5","4","0","1","2","5","4","0","1","2","5","4","0","1","2","5","4","0","1","2","0","1","2","4","0","1","2","-","-","-","-","-","-","-"];
        f[3] = f.default.slice(); f[4] = f.default.slice(); f[5] = f.default.slice();
        f[6] = f.default.slice(); f[7] = f.default.slice(); f[8] = f.default.slice();
        f[9] = f.default.slice();
        f[10] = ["13","13","13","13","13","13","13","13","13","13","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-"];
        f[11] = f[10].concat();
        f[12] = f[10].concat('13');
        f[13] = ["5","5","5","5","5","9","9","9","9","8","8","8","8","8","9","5","5","5","5","5","9","10","10","10","9","9","9","9","10","10","8","8","8","9","10","8","8","9","10","11","11","11","11","11","9","9","10","9","10","10","9","10","9","10","9","10","11","11","11","9","9","10","10","9","9","9","10","10","9","9","10","10","10","11","11","11","11","11","11","11","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-"];
        f[14] = ["5","5","5","5","5","5","5","5","5","5","5","5","5","5","5","5","5","5","5","5","9","9","9","9","9","8","8","8","8","8","8","8","12","12","12","12","12","12","12","12","12","12","8","8","8","8","8","8","8","8","8","8","8","8","8","15","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-","-"];
        f[15] = f.default.slice(); f[16] = f.default.slice(); f[17] = f.default.slice(); f[18] = f.default.slice();
        return f;
    })();

    var TEMPLATES_COUNT = 5;
    var selectedT = 1;
    var stateFold = 'minus';
    var doQuests = false;
    var disableStart = false;
    var COLS = 20;
    var RERUN_SEC = 5;

    var cancelRunLoop = null;
    var cancelRepaintLoop = null;

    var dragSourceId = null;

    function isVisible(el) {
        return el && el.offsetParent !== null;
    }

    function iconHtml(code) {
        return '<i class="icon building-' + CODES[code].name + '" style="height:16px;vertical-align:-3px;"></i><b>00</b>';
    }

    function cell(code) {
        var isNum = !isNaN(code);
        return '<td role="tkk-element"' + (isNum ? ' data-code="' + code + '"' : '') + ' style="text-align:center;white-space:nowrap;">' + (isNum ? iconHtml(code) : '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;') + '</td>';
    }

    function levelPaint(content) {
        try {
            var colors = { built: '#5a09', building: '#5af9', unbuildable: '#aaa9', error: '#a009' };
            var levels = {};
            document.querySelectorAll('td[role="tkk-element"]').forEach(function (td) {
                var code = parseInt(td.getAttribute('data-code'));
                if (Number.isNaN(code)) return;
                var lvl = (levels[code] || 1);
                var current = parseInt((game_data.village && game_data.village.buildings && game_data.village.buildings[CODES[code].name]) || '0');
                var btn = document.querySelector('a.btn-build[data-building="' + CODES[code].name + '"]');
                var next = btn ? parseInt(btn.getAttribute('data-level-next') || '0') : 0;
                if (!next && document.querySelector('tr.buildorder_' + CODES[code].name)) next = CODES[code].levels + 1;
                if (content) {
                    var b = td.querySelector('b');
                    if (b) b.textContent = ('0' + lvl).slice(-2);
                }
                var bg = '';
                if (!current) bg = colors.unbuildable;
                else if (current >= lvl) bg = colors.built;
                else if (lvl > CODES[code].levels) bg = colors.error;
                else if (next && lvl < next) bg = colors.building;
                td.style.backgroundColor = bg;
                levels[code] = lvl + 1;
            });
        } catch (e) {
            console.warn('[BuildBot] levelPaint error:', e);
        }
    }

    async function getQueue() {
        try {
            var q = await GMwrap.get(KEY_QUEUE_T(selectedT), null);
            return q || FALLBACKS.default.slice();
        } catch (e) {
            return FALLBACKS.default.slice();
        }
    }

    async function setQueue(arr) {
        await GMwrap.set(KEY_QUEUE_T(selectedT), arr);
    }

    function toolbarRow() {
        var hidden = stateFold === 'plus' ? ' display:none;' : '';
        return '<tr>\n<td colspan="' + COLS + '" style="text-align:center;">'
            + '<input type="button" id="bauvorlage1" value="Vorlage 1" class="btn" style="width:10%;' + hidden + '"/>'
            + '<input type="button" id="bauvorlage2" value="Vorlage 2" class="btn" style="width:10%;' + hidden + '"/>'
            + '<input type="button" id="bauvorlage3" value="Vorlage 3" class="btn" style="width:10%;' + hidden + '"/>'
            + '<input type="button" id="wall10" value="Wall 10" class="btn" style="width:10%;' + hidden + '"/>'
            + '<input type="button" id="wall15" value="Wall 15" class="btn" style="width:10%;' + hidden + '"/>'
            + '<input type="button" id="wall20" value="Wall 20" class="btn" style="width:10%;' + hidden + '"/>'
            + '<input type="button" id="kaserne_stall_werkstadt" value="Kaserne/Stall/Werkstatt" class="btn" style="width:20%;' + hidden + '"/>'
            + '<input type="button" id="AHpush" value="AHpush" class="btn" style="width:10%;' + hidden + '"/>'
            + '</td></tr>';
    }

    async function draw() {
        try {
            var existing = document.getElementById('tkk-queue');
            if (existing) existing.remove();

            var queue = await getQueue();

            var html = '<div id="tkk-queue"><br/><table class="vis" style="width:100%;"><tr>';
            html += '<th colspan="' + COLS + '" style="text-align:center;background-color:#c1a264;">Bauvorlagen</th></tr>';
            html += toolbarRow();
            hidden = stateFold === 'plus' ? ' style="display:none;"' : '';
            html += '<tr><th colspan="' + COLS + '"><img id="tkk-toggle" src="graphic/' + stateFold + '.png" style="vertical-align:-4px;"/>[DSU] Build Bot</th></tr>';

            html += '<tr role="tkk-row"' + hidden + '>';
            if (queue.length) {
                for (var i = 0; i < queue.length; i++) {
                    var code = queue[i];
                    if (i && i % COLS === 0) html += '</tr><tr role="tkk-row"' + hidden + '>';
                    html += isNaN(code) ? cell() : cell(code);
                    if (i + 1 === queue.length) html += cell().repeat(COLS - ((i + 1) % COLS || COLS));
                }
            } else {
                html += cell().repeat(COLS);
            }
            html += '</tr><tr id="tkk-separator"' + hidden + '><td colspan="' + COLS + '" style="text-align:center;background-color:#c1a264;">\u2195 DK: Herausnehmen \u2022 DK+STRG: Entfernen</td></tr>';

            for (var r = 0; r < Math.ceil(CODES.length / COLS); r++) {
                html += '<tr' + hidden + '>';
                for (var c = 0; c < COLS; c++) {
                    var idx = r * COLS + c;
                    if (CODES[idx]) {
                        html += '<td id="tkk-drag-' + idx + '" data-code="' + idx + '" title="' + CODES[idx].title + '" style="text-align:center;" draggable="true"><img src="https://dsde.innogamescdn.com/asset/f1821a7a/graphic/buildings/mid/' + CODES[idx].name + CODES[idx].image + '.png" style="max-width:25px;max-height:25px;"/></td>';
                    } else html += '<td></td>';
                }
                html += '</tr>';
            }

            html += '<tr' + hidden + '><td colspan="' + COLS + '" style="text-align:center;background-color:#c1a264;">\u2195 DK: Hinzuf\u00fcgen \u2022 D&D: Dazwischenschieben \u2022 D&D+STRG: Ersetzen</td></tr>';
            html += '<tr><td colspan="' + COLS + '" style="text-align:center;">';
            html += '<select id="tkk-template" style="margin-right:3px;vertical-align:1px;">';
            for (var ti = 1; ti <= TEMPLATES_COUNT; ti++) html += '<option value="' + ti + '"' + (selectedT === ti ? ' selected' : '') + '>Vorlage ' + ti + '</option>';
            html += '</select>';
            var h = stateFold === 'plus' ? ' display:none;' : '';
            html += '<input type="button" id="tkk-add" value="+" class="btn" style="width:3%;' + h + '"/>';
            html += '<input type="button" id="tkk-remove" value="-" class="btn" style="width:3%;' + h + '"/>';
            html += '<input type="button" id="tkk-clear" value="X" class="btn" style="width:3%;' + h + '"/>';
            html += '<input type="file" id="tkk-file" style="width:13%;margin-left:3px;vertical-align:1px;' + h + '"/>';
            html += '<input type="button" id="tkk-import" value="\u2191" class="btn" style="width:3%;' + h + '"/>';
            html += '<a id="tkk-export" href="#" class="btn" style="width:2%;' + h + '">\u2193</a>';
            html += '<label style="margin-left:8px;"><input type="checkbox" id="tkk-quests"' + (doQuests ? ' checked' : '') + '/> Quests</label>';
            html += '<input type="button" id="tkk-save" value="Speichern" class="btn" style="width:10%;' + h + '"/>';
            html += '<input type="button" id="tkk-start" value="Starten" class="btn" style="width:10%;"' + (disableStart ? ' disabled' : '') + '/>';
            html += '</td></tr></table></div>';

            var container = document.getElementById('content_value') || document.querySelector('td#content_value') || document.body;
            var firstTable = container.querySelector('table');
            if (firstTable) firstTable.insertAdjacentHTML('afterend', html);
            else container.insertAdjacentHTML('beforeend', html);

            levelPaint(true);

            var exp = document.getElementById('tkk-export');
            if (exp) {
                var dataStr = 'data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(queue));
                exp.setAttribute('download', 'queue.json');
                exp.setAttribute('href', dataStr);
            }
        } catch (e) {
            console.error('[BuildBot] draw error:', e);
        }
    }

    function wireHandlers() {
        document.body.addEventListener('click', function (ev) {
            var target = ev.target;
            var id = target && target.id;

            if (id === 'tkk-toggle') {
                var img = document.getElementById('tkk-toggle');
                if (!img) return;
                stateFold = /minus/.test(img.getAttribute('src')) ? 'plus' : 'minus';
                img.setAttribute('src', 'graphic/' + stateFold + '.png');
                GMwrap.set(KEY_STATE, stateFold).then(function () { draw(); });
                return;
            }

            if (id === 'tkk-add') {
                var sep = document.getElementById('tkk-separator');
                if (sep) {
                    var tr = document.createElement('tr');
                    tr.setAttribute('role', 'tkk-row');
                    tr.innerHTML = cell().repeat(COLS);
                    sep.parentNode.insertBefore(tr, sep);
                }
                return;
            }

            if (id === 'tkk-remove') {
                var rows = document.querySelectorAll('tr[role="tkk-row"]');
                if (rows.length) rows[rows.length - 1].remove();
                return;
            }

            if (id === 'tkk-clear') {
                document.querySelectorAll('td[role="tkk-element"]').forEach(function (td) {
                    td.outerHTML = cell();
                });
                levelPaint(true);
                return;
            }

            if (id === 'tkk-save') {
                (async function () {
                    var data = [];
                    document.querySelectorAll('td[role="tkk-element"]').forEach(function (td) {
                        var code = parseInt(td.getAttribute('data-code'));
                        data.push(Number.isNaN(code) ? '-' : String(code));
                    });
                    await setQueue(data);
                    draw();
                })();
                return;
            }

            if (id === 'tkk-start') {
                var btn = document.getElementById('tkk-start');
                if (btn && !btn.disabled) {
                    btn.disabled = true;
                    disableStart = true;
                    startRunLoop();
                }
                return;
            }

            if (id === 'tkk-import') {
                (async function () {
                    var fileInput = document.getElementById('tkk-file');
                    var file = fileInput && fileInput.files && fileInput.files[0];
                    if (!file) return;
                    try {
                        var txt = await file.text();
                        var arr;
                        try { arr = JSON.parse(txt) || []; } catch (e) { arr = []; }
                        await setQueue(arr);
                        draw();
                    } catch (e) {}
                })();
                return;
            }

            if (id === 'bauvorlage1') { setQueue(FALLBACKS[1]).then(function () { draw(); }); return; }
            if (id === 'bauvorlage2') { setQueue(FALLBACKS[2]).then(function () { draw(); }); return; }
            if (id === 'bauvorlage3') { setQueue(FALLBACKS[3]).then(function () { draw(); }); return; }
            if (id === 'wall10') { setQueue(FALLBACKS[10]).then(function () { draw(); }); return; }
            if (id === 'wall15') { setQueue(FALLBACKS[11]).then(function () { draw(); }); return; }
            if (id === 'wall20') { setQueue(FALLBACKS[12]).then(function () { draw(); }); return; }
            if (id === 'kaserne_stall_werkstadt') { setQueue(FALLBACKS[13]).then(function () { draw(); }); return; }
            if (id === 'AHpush') { setQueue(FALLBACKS[14]).then(function () { draw(); }); return; }
        });

        document.body.addEventListener('change', function (ev) {
            if (ev.target && ev.target.id === 'tkk-template') {
                (async function () {
                    selectedT = parseInt(ev.target.value);
                    await GMwrap.set(KEY_SELECTED(VILLAGE_ID), selectedT);
                    draw();
                })();
                return;
            }

            if (ev.target && ev.target.id === 'tkk-quests') {
                doQuests = ev.target.checked;
                GMwrap.set(KEY_QUESTS, doQuests);
                return;
            }
        });

        document.body.addEventListener('dblclick', function (ev) {
            var target = ev.target;
            var td = target.closest ? target.closest('td[role="tkk-element"]') : null;
            if (td) {
                if (ev.ctrlKey) {
                    td.outerHTML = cell();
                    levelPaint(true);
                    return;
                }
                var table = td.closest('table');
                if (!table) return;
                var cells = table.querySelectorAll('td[role="tkk-element"]');
                var skip = true, last = null;
                cells.forEach(function (c) {
                    if (c === td) { skip = false; return; }
                    if (skip) return;
                    if (last) last.outerHTML = c.outerHTML;
                    last = c;
                });
                if (last) last.outerHTML = cell();
                levelPaint(true);
                return;
            }

            var dragTd = target.closest ? target.closest('td[id^="tkk-drag"]') : null;
            if (dragTd) {
                var code = parseInt(dragTd.getAttribute('data-code'));
                var lastEl = document.querySelector('td[role="tkk-element"]:last-of-type');
                if (lastEl) {
                    lastEl.outerHTML = cell(code);
                    levelPaint(true);
                }
                return;
            }
        });

        document.body.addEventListener('dragstart', function (ev) {
            var target = ev.target;
            var dragTd = target.closest ? target.closest('td[id^="tkk-drag"]') : null;
            if (dragTd) {
                dragSourceId = dragTd.id;
                try { ev.dataTransfer.setData('text/plain', dragTd.id); } catch (e) {}
            }
        });

        document.body.addEventListener('dragover', function (ev) {
            ev.preventDefault();
        });

        document.body.addEventListener('drop', function (ev) {
            ev.preventDefault();
            var target = ev.target;
            var td = target.closest ? target.closest('td[role="tkk-element"]') : null;
            if (!td || !dragSourceId) return;
            var sourceEl = document.getElementById(dragSourceId);
            if (!sourceEl) return;
            var code = parseInt(sourceEl.getAttribute('data-code'));
            if (ev.ctrlKey) {
                td.outerHTML = cell(code);
                levelPaint(true);
                dragSourceId = null;
                return;
            }
            var table = td.closest('table');
            if (!table) return;
            var cells = table.querySelectorAll('td[role="tkk-element"]');
            var skip = true, last = null;
            cells.forEach(function (c) {
                if (c === td) { skip = false; return; }
                if (skip) return;
                var repl = last === null ? cell(code) : last.outerHTML;
                last = c.cloneNode(true);
                c.outerHTML = repl;
            });
            if (last) last.outerHTML = cell();
            levelPaint(true);
            dragSourceId = null;
        });
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

    function tryBuildFromQueue(queue) {
        try {
            var additional = (game_data.features && game_data.features.Premium && game_data.features.Premium.active) ? 4 : 1;
            if (document.querySelectorAll('tr.sortable_row').length >= additional) return false;

            var levels = {};
            for (var i = 0; i < queue.length; i++) {
                var code = queue[i];
                if (isNaN(code)) continue;
                var lvl = (levels[code] || 1);
                var sel = 'a#main_buildlink_' + CODES[code].name + '_' + lvl;
                var el = document.querySelector(sel);
                if (el) {
                    if (isVisible(el)) click(el);
                    return true;
                }

                var unmet = document.querySelector('#buildings_unmet a[href$="' + CODES[code].name + '"]');
                var current = game_data.village && game_data.village.buildings && game_data.village.buildings[CODES[code].name];
                if (!current && unmet) return false;
                levels[code] = lvl + 1;
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

            var q = await getQueue();
            tryBuildFromQueue(q);
        } catch (e) {
            console.warn('[BuildBot] run error:', e);
        }
    }

    function startRunLoop() {
        if (typeof cancelRunLoop === 'function') cancelRunLoop();
        gateTimeout(function () { run(); }, 300);
        cancelRunLoop = gateInterval(function () { run(); }, RERUN_SEC * 1000, {
            jitter: [250, 750],
            requireVisible: false
        });
    }

    (async function init() {
        try {
            selectedT = parseInt(await GMwrap.get(KEY_SELECTED(VILLAGE_ID), 1));
            if (selectedT > TEMPLATES_COUNT) selectedT = 1;
            stateFold = await GMwrap.get(KEY_STATE, 'minus');
            doQuests = await GMwrap.get(KEY_QUESTS, false);

            var waitForContent = setInterval(function () {
                var cv = document.getElementById('content_value') || document.querySelector('td#content_value');
                if (!cv) return;
                clearInterval(waitForContent);

                (async function () {
                    await draw();
                    wireHandlers();

                    if (typeof cancelRepaintLoop === 'function') cancelRepaintLoop();
                    cancelRepaintLoop = gateInterval(function () {
                        if (document.getElementById('tkk-queue')) levelPaint(false);
                        else draw();
                    }, 1000, { requireVisible: false });
                })();
            }, 100);
        } catch (e) {
            console.error('[BuildBot] init error:', e);
        }
    })();
})();
