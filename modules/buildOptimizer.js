(function () {
    'use strict';

    const wind = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    const game_data = wind.game_data;

    if (wind.__dsBuildOptimizerLoaded) return;
    wind.__dsBuildOptimizerLoaded = true;

    if (!game_data || !/screen=main/.test(location.href)) return;

    // =========================================================================
    //  KONSTANTEN
    // =========================================================================

    const N_NAMES = {
        wood: 'Holzfällerlager', stone: 'Lehmgrube', iron: 'Eisenmine',
        farm: 'Bauernhof', storage: 'Speicher', main: 'Hauptgebäude',
        place: 'Versammlungsplatz', statue: 'Statue', smith: 'Schmiede',
        barracks: 'Kaserne', stable: 'Stall', garage: 'Werkstatt',
        market: 'Marktplatz', wall: 'Wall', hide: 'Versteck',
        snob: 'Adelshof', church: 'Kirche', watchtower: 'Wachturm',
        academy: 'Akademie', timber: 'Holzfällerlager', clay: 'Lehmgrube'
    };

    const U_NAMES = {
        spear: 'Speerträger', sword: 'Schwertkämpfer', axe: 'Axtkämpfer',
        spy: 'Späher', light: 'Leichte Kavallerie', heavy: 'Schwere Kavallerie',
        ram: 'Ramme', catapult: 'Katapult', snob: 'Adliger'
    };

    const UNIT_BUILDING = {
        spear:    { building: 'barracks', level: 1,  pop: 1 },
        sword:    { building: 'smith',     level: 1,  pop: 1 },
        axe:      { building: 'smith',     level: 2,  pop: 1 },
        spy:      { building: 'stable',    level: 1,  pop: 2 },
        light:    { building: 'stable',    level: 3,  pop: 4 },
        heavy:    { building: 'stable',    level: 10, pop: 6, smith: 15 },
        ram:      { building: 'garage',    level: 1,  pop: 5 },
        catapult: { building: 'garage',    level: 2,  pop: 8, smith: 12 },
        snob:     { building: 'snob',      level: 1,  pop: 100, smith: 20 }
    };

    const BUILDING_PREQ_MULTI = {
        smith:      [{ building: 'main', level: 5 }, { building: 'barracks', level: 1 }],
        barracks:   [{ building: 'main', level: 3 }],
        stable:     [{ building: 'main', level: 10 }, { building: 'barracks', level: 5 }, { building: 'smith', level: 5 }],
        garage:     [{ building: 'main', level: 7 }],
        market:     [{ building: 'main', level: 3 }],
        snob:       [{ building: 'main', level: 20 }, { building: 'market', level: 10 }, { building: 'smith', level: 20 }],
        wall:       [{ building: 'main', level: 1 }],
    };

    const RES_MAP = { timber: 'wood', clay: 'stone', iron: 'iron' };
    const INTERNAL_MAP = { wood: 'timber', stone: 'clay' };

    const BUILD_QUEUE_ID_MAP = {
        wood: 'timber',
        stone: 'clay',
        timber: 'timber',
        clay: 'clay',
        iron: 'iron',
        farm: 'farm',
        storage: 'storage',
        main: 'main',
        place: 'place',
        statue: 'statue',
        smith: 'smith',
        barracks: 'barracks',
        stable: 'stable',
        garage: 'garage',
        market: 'market',
        wall: 'wall',
        hide: 'hide',
        snob: 'snob',
        church: 'church',
        watchtower: 'watchtower'
    };

    // =========================================================================
    //  STATE
    // =========================================================================

    let SH = wind.SettingsHelper || null;
    let buildConf = null;
    let serverConf = null;
    let unitConf = null;
    let isComputing = false;
    const OPT_SEARCH = {
        beamWidth: 72,
        branchFactor: 4,
        maxSteps: 220,
        resourceQuantum: 25
    };
    const QUEST_REWARD_MIN = { wood: 150, clay: 150, iron: 100 };

    // =========================================================================
    //  CONFIG-LOADING (aus DS-Tools)
    // =========================================================================

    function ensureConfigs(cb) {
        if (SH && SH.getBuildConf() && SH.getServerConf()) {
            buildConf = SH.getBuildConf();
            serverConf = SH.getServerConf();
            unitConf = SH.getUnitConf ? SH.getUnitConf() : null;
            if (cb) cb(true); return;
        }
        const world = game_data.world;
        const ld = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
        buildConf = ld('building_settings_' + world);
        serverConf = ld('server_settings_' + world);
        unitConf = ld('unit_settings_' + world);
        if (buildConf && serverConf) { if (cb) cb(true); return; }
        if (!SH || typeof SH.checkConfigs !== 'function') {
            initSH(function () {
                SH = wind.SettingsHelper;
                if (SH && SH.getBuildConf()) {
                    buildConf = SH.getBuildConf();
                    serverConf = SH.getServerConf();
                    unitConf = SH.getUnitConf ? SH.getUnitConf() : null;
                }
                if (cb) cb(!!buildConf);
            }); return;
        }
        SH.checkConfigs();
        var iv = setInterval(function () {
            buildConf = SH.getBuildConf();
            serverConf = SH.getServerConf();
            if (buildConf && serverConf) {
                unitConf = SH.getUnitConf ? SH.getUnitConf() : null;
                clearInterval(iv); if (cb) cb(true);
            }
        }, 300);
        setTimeout(function () { clearInterval(iv); if (cb) cb(false); }, 15000);
    }

    function initSH(cb) {
        SH = {
            serverConf: null, unitConf: null, buildConf: null,
            loadSettings: function (type) {
                var paths = {
                    server: { url: '/interface.php?func=get_config' },
                    unit: { url: '/interface.php?func=get_unit_info' },
                    building: { url: '/interface.php?func=get_building_info' }
                };
                var p = paths[type];
                if (!p) return null;
                var key = (type === 'server' ? 'server_settings_' : type === 'unit' ? 'unit_settings_' : 'building_settings_') + game_data.world;
                if (localStorage.getItem(key)) return JSON.parse(localStorage.getItem(key));
                var req = new XMLHttpRequest();
                req.open('GET', 'https://' + location.hostname + p.url, false);
                req.send(null);
                if (req.status !== 200) return null;
                var json = xmlToJson(req.responseXML).config;
                localStorage.setItem(key, JSON.stringify(json));
                return json;
            },
            getServerConf: function () {
                if (!this.serverConf) this.serverConf = JSON.parse(localStorage.getItem('server_settings_' + game_data.world));
                return this.serverConf;
            },
            getUnitConf: function () {
                if (!this.unitConf) this.unitConf = JSON.parse(localStorage.getItem('unit_settings_' + game_data.world));
                return this.unitConf;
            },
            getBuildConf: function () {
                if (!this.buildConf) this.buildConf = JSON.parse(localStorage.getItem('building_settings_' + game_data.world));
                return this.buildConf;
            },
            checkConfigs: function () { return !!(this.getServerConf() && this.getUnitConf() && this.getBuildConf()); }
        };
        wind.SettingsHelper = SH;
        try { SH.loadSettings('server'); } catch(e) {}
        try { SH.loadSettings('building'); } catch(e) {}
        try { SH.loadSettings('unit'); } catch(e) {}
        setTimeout(function () { if (cb) cb(); }, 1000);
    }

    function xmlToJson(xml) {
        var obj = {};
        if (xml.nodeType === 1) {
            if (xml.attributes.length > 0) {
                obj['@attributes'] = {};
                for (var j = 0; j < xml.attributes.length; j++) {
                    var attr = xml.attributes.item(j);
                    obj['@attributes'][attr.nodeName] = isNaN(parseFloat(attr.nodeValue)) ? attr.nodeValue : parseFloat(attr.nodeValue);
                }
            }
        } else if (xml.nodeType === 3) { obj = xml.nodeValue; }
        var textNodes = [].slice.call(xml.childNodes).filter(function (n) { return n.nodeType === 3; });
        if (xml.hasChildNodes() && xml.childNodes.length === textNodes.length) {
            obj = [].slice.call(xml.childNodes).reduce(function (t, n) { return t + n.nodeValue; }, '');
        } else if (xml.hasChildNodes()) {
            for (var i = 0; i < xml.childNodes.length; i++) {
                var item = xml.childNodes.item(i);
                var name = item.nodeName;
                if (typeof obj[name] === 'undefined') { obj[name] = xmlToJson(item); }
                else { if (!Array.isArray(obj[name])) { obj[name] = [obj[name]]; } obj[name].push(xmlToJson(item)); }
            }
        }
        return obj;
    }

    // =========================================================================
    //  HILFSFUNKTIONEN
    // =========================================================================

    function fmtTime(sec) {
        if (!sec || sec < 0 || !isFinite(sec)) return '0:00:00';
        var h = Math.floor(sec / 3600);
        var m = Math.floor((sec % 3600) / 60);
        var s = Math.floor(sec % 60);
        return h + ':' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    }

    function fmtNum(n) {
        if (n === undefined || n === null || isNaN(n)) return '0';
        return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    }

    function fmtRes(r) { return fmtNum(r.wood || 0) + ' / ' + fmtNum(r.clay || 0) + ' / ' + fmtNum(r.iron || 0); }
    function cloneObj(o) { return JSON.parse(JSON.stringify(o)); }

    function getBuildingName(id) { return N_NAMES[id] || id; }

    function toInternalBuilding(id) { return INTERNAL_MAP[id] || id; }

    function speed() { return (serverConf && serverConf.speed) ? parseFloat(serverConf.speed) : 1; }

    const FALLBACK_COST = {
        snob: { wood: 30000, stone: 20000, iron: 15000, wood_factor: 1.0, stone_factor: 1.0, iron_factor: 1.0, build_time: 86400 },
        statue: { wood: 30000, stone: 20000, iron: 15000, wood_factor: 1.0, stone_factor: 1.0, iron_factor: 1.0, build_time: 86400 }
    };

    // =========================================================================
    //  KOSTEN / ZEITEN / PRODUKTION
    // =========================================================================

    function getBuildCost(building, lvl, res) {
        building = RES_MAP[building] || building;
        if (!buildConf || !buildConf[building]) {
            var fb = FALLBACK_COST[building];
            if (!fb) return 0;
            return Math.round((parseFloat(fb[res]) || 0) * Math.pow(parseFloat(fb[res + '_factor']) || 1.0, lvl - 1));
        }
        var base = parseFloat(buildConf[building][res]) || 0;
        var factor = parseFloat(buildConf[building][res + '_factor']) || 1.26;
        return Math.round(base * Math.pow(factor, lvl - 1));
    }

    function getBuildCostAll(building, lvl) {
        return {
            wood: getBuildCost(building, lvl, 'wood'),
            clay: getBuildCost(building, lvl, 'stone'),
            iron: getBuildCost(building, lvl, 'iron')
        };
    }

    // =========================================================================
    //  BAUZEIT (Formel 2 – seit 2015)
    //  build_time ist BEREITS speed-angepasst (KEIN /speed)
    //  time = build_time * 1.05^(-hqLvl) * level_factor[target_level]
    //  level_factor-Tabelle empirisch aus Spielwerten ermittelt
    // =========================================================================

    function getLevelFactor(lvl, building) {
        // Welt-spezifisch: build_time_factor aus interface.php?func=get_building_info
        var b = RES_MAP[building] || building;
        var factor = buildConf && buildConf[b] ? parseFloat(buildConf[b].build_time_factor) : NaN;
        if (!Number.isFinite(factor) || factor <= 0) factor = 1.2;

        var level = Math.max(1, parseInt(lvl, 10) || 1);
        var denom = level - 1;
        var exponent = Math.max(-13, denom === 0 ? -Infinity : (denom - (14 / denom)));
        return 1.18 * Math.pow(factor, exponent);
    }

    function getBuildTime(building, lvl, hqLvl) {
        building = RES_MAP[building] || building;
        var base;
        if (buildConf && buildConf[building]) base = parseFloat(buildConf[building].build_time) || 150;
        else if (FALLBACK_COST[building]) base = parseFloat(FALLBACK_COST[building].build_time) || 86400;
        else return 999999;
        // Formel 2: build_time ist bereits speed-angepasst
        var ml = hqLvl != null ? parseInt(hqLvl) : (game_data.village.buildings.main || 0);
        ml = Math.max(0, ml);
        var hq = Math.pow(1.05, -ml);
        return base * hq * getLevelFactor(lvl, building);
    }



    function getFarm(lvl) {
        return Math.round(240 * Math.pow(1.1721, Math.max(0, parseInt(lvl) - 1)));
    }

    function getStorage(lvl) {
        return Math.round(1000 * Math.pow(1.2295, Math.max(0, parseInt(lvl) - 1)));
    }

    function getProduction(lvl, type) {
        var prodKey = type === 'timber' ? 'wood' : type === 'clay' ? 'stone' : type === 'iron' ? 'iron' : null;
        if (!prodKey) return 0;

        var level = parseInt(lvl, 10);
        if (!Number.isFinite(level) || level < 1) level = 1;

        var gv = game_data.village || {};
        var base = (serverConf && serverConf.game && serverConf.game.base_production) ? parseFloat(serverConf.game.base_production) : 30;
        var sp = speed();

        // Calibrate the formula to the currently observed village production,
        // then scale by simulated mine level.
        var bonus = 1;
        var curProdSec = parseFloat(gv[prodKey + '_prod']);
        var curLvl = gv.buildings ? parseInt(gv.buildings[prodKey], 10) : NaN;
        if (Number.isFinite(curProdSec) && Number.isFinite(curLvl) && curLvl > 0) {
            var modelCur = base * sp * Math.pow(1.1631, Math.max(0, curLvl - 1));
            if (modelCur > 0) {
                bonus = (curProdSec * 3600) / modelCur;
            }
        } else if (gv.bonus && Number.isFinite(parseFloat(gv.bonus[prodKey]))) {
            bonus = parseFloat(gv.bonus[prodKey]);
        }

        if (!Number.isFinite(bonus) || bonus <= 0) bonus = 1;
        bonus = Math.max(0.25, Math.min(4, bonus));

        return Math.round(base * sp * Math.pow(1.1631, Math.max(0, level - 1)) * bonus);
    }

    function getProductionPerHour(building, lvl) {
        var b = toInternalBuilding(building);
        if (b === 'wood') b = 'timber';
        if (b === 'stone') b = 'clay';
        return getProduction(lvl, b);
    }

    function getQuestReduction(cost) {
        function reduceOne(val, minReward) {
            var v = parseFloat(val) || 0;
            if (v <= 0) return 0;

            // Mindestreward pro Ressourcentyp + 10%-Regel, gedeckelt bei 2000.
            var byPercent = Math.round(v * 0.1);
            var reduced = Math.max(minReward, byPercent);
            reduced = Math.min(2000, reduced);
            return Math.min(v, reduced);
        }
        return {
            wood: reduceOne(cost.wood || 0, QUEST_REWARD_MIN.wood),
            clay: reduceOne(cost.clay || 0, QUEST_REWARD_MIN.clay),
            iron: reduceOne(cost.iron || 0, QUEST_REWARD_MIN.iron)
        };
    }

    // =========================================================================
    //  VORAUSSETZUNGEN
    // =========================================================================

    function getBuildingPrereqs(building) {
        building = RES_MAP[building] || building;
        var result = [];
        if (buildConf && buildConf[building]) {
            var cfg = buildConf[building];
            for (var i = 1; ; i++) {
                var pKey = i === 1 ? 'preq' : 'preq' + i;
                var lKey = i === 1 ? 'preq_level' : 'preq' + i + '_level';
                var pv = cfg[pKey];
                if (pv === undefined || pv === null || pv === '') break;
                var bName = (typeof pv === 'object' && pv.building) ? String(pv.building) : String(pv);
                var bLevel = parseInt(cfg[lKey] || (typeof pv === 'object' ? pv.level : 1)) || 1;
                result.push({ building: bName, level: bLevel });
            }
        }
        if (result.length === 0 && BUILDING_PREQ_MULTI[building]) {
            result = cloneObj(BUILDING_PREQ_MULTI[building]);
        }
        result = result.filter(function (pre) {
            return pre.building === 'main' || (game_data.village.buildings && game_data.village.buildings[pre.building] !== undefined) || (buildConf && buildConf[pre.building]);
        });
        return result;
    }

    function resolveRequirements(targetUnit) {
        var unitReq = UNIT_BUILDING[targetUnit];
        if (!unitReq) return { error: 'Keine Voraussetzungen für ' + (U_NAMES[targetUnit] || targetUnit) };

        var required = {};
        var seen = new Set();
        var queue = [{ b: unitReq.building, lvl: unitReq.level }];

        if (unitReq.smith) queue.push({ b: 'smith', lvl: unitReq.smith });

        while (queue.length) {
            var item = queue.shift();
            var key = item.b + '_' + item.lvl;
            if (seen.has(key)) continue;
            seen.add(key);
            if (!required[item.b] || required[item.b] < item.lvl) required[item.b] = item.lvl;
            var pres = getBuildingPrereqs(item.b);
            pres.forEach(function (p) { queue.push({ b: p.building, lvl: p.level }); });
        }

        if (Object.keys(required).length > 50) return { error: 'Zirkuläre Voraussetzungen' };

        return {
            unit: unitReq,
            required: required,
            targetBuilding: unitReq.building,
            targetLevel: unitReq.level,
            popNeeded: unitReq.pop || 0
        };
    }

    // =========================================================================
    //  STATE-HELFER
    // =========================================================================

    function currentResources() {
        var r = { wood: 0, clay: 0, iron: 0 };
        try {
            var elW = document.getElementById('wood');
            var elS = document.getElementById('stone');
            var elI = document.getElementById('iron');
            if (elW) r.wood = parseInt(elW.textContent.replace(/[^\d]/g, '')) || 0;
            if (elS) r.clay = parseInt(elS.textContent.replace(/[^\d]/g, '')) || 0;
            if (elI) r.iron = parseInt(elI.textContent.replace(/[^\d]/g, '')) || 0;
        } catch (e) {}
        return r;
    }

    function currentBuildings() {
        var b = {};
        var gb = game_data.village.buildings || {};
        var map = { wood: 'timber', stone: 'clay' };
        for (var k in gb) {
            var mk = map[k] || k;
            b[mk] = parseInt(gb[k]) || 0;
        }
        return b;
    }

    function hasFarmCapacity(state, neededPop) {
        var curPop = 0;
        for (var k in state.buildings) {
            if (k !== 'farm') curPop += (state.buildings[k] || 0);
        }
        var farmCap = getFarm(state.buildings.farm || 0);
        return farmCap >= curPop + neededPop;
    }

    function hasStorageCapacity(state, cost) {
        var cap = getStorage(state.buildings.storage || 0);
        var qr = getQuestReduction(cost || {});
        var needWood = Math.max(0, (cost.wood || 0) - qr.wood);
        var needClay = Math.max(0, (cost.clay || 0) - qr.clay);
        var needIron = Math.max(0, (cost.iron || 0) - qr.iron);
        return needWood <= cap && needClay <= cap && needIron <= cap;
    }

    function calcProduction(state) {
        return {
            wood: getProduction(state.buildings.timber || 0, 'timber'),
            clay: getProduction(state.buildings.clay || 0, 'clay'),
            iron: getProduction(state.buildings.iron || 0, 'iron')
        };
    }

    function calcWaitTime(state, cost) {
        if (!hasStorageCapacity(state, cost)) return Infinity;

        var prod = calcProduction(state);
        var maxWait = 0;
        var res = state.res || { wood: 0, clay: 0, iron: 0 };
        var qr = getQuestReduction(cost);
        var needWood  = Math.max(0, (cost.wood  || 0) - qr.wood  - (res.wood  || 0));
        var needClay  = Math.max(0, (cost.clay  || 0) - qr.clay  - (res.clay  || 0));
        var needIron  = Math.max(0, (cost.iron  || 0) - qr.iron  - (res.iron  || 0));
        if (needWood > 0 && prod.wood <= 0) return Infinity;
        if (needClay > 0 && prod.clay <= 0) return Infinity;
        if (needIron > 0 && prod.iron <= 0) return Infinity;
        if (prod.wood  > 0 && needWood  > 0) maxWait = Math.max(maxWait, needWood  / (prod.wood  / 3600));
        if (prod.clay  > 0 && needClay  > 0) maxWait = Math.max(maxWait, needClay  / (prod.clay  / 3600));
        if (prod.iron  > 0 && needIron  > 0) maxWait = Math.max(maxWait, needIron  / (prod.iron  / 3600));
        return maxWait;
    }

    function capResources(state) {
        var cap = getStorage(state.buildings.storage || 0);
        if (!Number.isFinite(cap) || cap <= 0) return;
        state.res.wood = Math.min(cap, Math.max(0, state.res.wood || 0));
        state.res.clay = Math.min(cap, Math.max(0, state.res.clay || 0));
        state.res.iron = Math.min(cap, Math.max(0, state.res.iron || 0));
    }

    function applyProduction(state, duration) {
        var p = calcProduction(state);
        var hours = duration / 3600;
        state.res.wood  += p.wood  * hours;
        state.res.clay  += p.clay  * hours;
        state.res.iron  += p.iron  * hours;
        capResources(state);
    }



    // =========================================================================
    //  SEARCH-SCHEDULER
    // =========================================================================

    function getActions(state, required, mineTargets) {
        var actions = [];
        var isMine = function (b) { return b === 'timber' || b === 'clay' || b === 'iron'; };
        var candidates = new Set(Object.keys(state.buildings || {}));

        Object.keys(required || {}).forEach(function (b) { candidates.add(b); });
        if (mineTargets) {
            ['timber', 'clay', 'iron'].forEach(function (b) { candidates.add(b); });
        }

        candidates.forEach(function (bId) {
            var curLvl = state.buildings[bId] || 0;
            var tgt = required[bId] || 0;
            if (isMine(bId) && mineTargets) tgt = Math.max(tgt, mineTargets[bId] || 0);
            var nextLvl = curLvl + 1;
            if (nextLvl > tgt) return;

            var cfgKey = RES_MAP[bId] || bId;
            var maxLvl = 30;
            if (buildConf && buildConf[cfgKey] && buildConf[cfgKey].max_level !== undefined) {
                maxLvl = parseInt(buildConf[cfgKey].max_level, 10) || 30;
            }
            if (nextLvl > maxLvl) return;

            var preqs = getBuildingPrereqs(bId);
            var met = true;
            for (var pi = 0; pi < preqs.length; pi++) {
                if ((state.buildings[preqs[pi].building] || 0) < preqs[pi].level) { met = false; break; }
            }
            if (!met) return;

            var cost = getBuildCostAll(bId, nextLvl);
            var bt = getBuildTime(bId, nextLvl, state.buildings.main || 1);
            var wait = calcWaitTime(state, cost);
            if (!Number.isFinite(wait) || !Number.isFinite(bt)) return;

            actions.push({
                building: bId,
                level: nextLvl,
                cost: cost,
                buildTime: bt,
                waitTime: wait,
                isMain: bId === 'main',
                isMine: isMine(bId),
                isRequired: (required[bId] || 0) >= nextLvl
            });
        });

        return actions;
    }

    function compareActions(a, b, targetBuilding) {
        if (Math.abs(a.waitTime - b.waitTime) > 1) return a.waitTime - b.waitTime;
        if (a.isRequired !== b.isRequired) return a.isRequired ? -1 : 1;
        if (a.building === targetBuilding && b.building !== targetBuilding) return -1;
        if (a.building !== targetBuilding && b.building === targetBuilding) return 1;
        if (Math.abs(a.buildTime - b.buildTime) > 1) return a.buildTime - b.buildTime;
        if (a.isMine !== b.isMine) return a.isMine ? 1 : -1;
        return 0;
    }

    function chooseAction(actions, targetBuilding) {
        if (!actions.length) return null;
        var sorted = actions.slice().sort(function (a, b) {
            return compareActions(a, b, targetBuilding);
        });
        return sorted[0];
    }

    function chooseActions(actions, targetBuilding, limit) {
        if (!actions.length) return [];
        var sorted = actions.slice().sort(function (a, b) {
            return compareActions(a, b, targetBuilding);
        });
        return sorted.slice(0, Math.max(1, limit || 1));
    }

    function isTargetMet(buildings, required) {
        for (var tb in required) {
            if ((buildings[tb] || 0) < required[tb]) return false;
        }
        return true;
    }

    function getTrackedBuildings(required, mineTargets) {
        var tracked = new Set(Object.keys(required || {}));
        if (mineTargets) {
            Object.keys(mineTargets).forEach(function (b) {
                if ((mineTargets[b] || 0) > 0) tracked.add(b);
            });
        }
        if (!tracked.has('main')) tracked.add('main');
        return Array.from(tracked).sort();
    }

    function buildStateKey(state, trackedBuildings) {
        var q = OPT_SEARCH.resourceQuantum || 25;
        var lvlKey = trackedBuildings.map(function (b) { return (state.buildings[b] || 0); }).join('|');
        var rw = Math.floor((state.res.wood || 0) / q);
        var rc = Math.floor((state.res.clay || 0) / q);
        var ri = Math.floor((state.res.iron || 0) / q);
        return lvlKey + ';' + rw + ',' + rc + ',' + ri;
    }

    function simulateAction(state, action) {
        var next = {
            time: state.time,
            res: cloneObj(state.res || {}),
            buildings: cloneObj(state.buildings || {}),
            steps: state.steps.slice()
        };

        var wait = calcWaitTime(next, action.cost);
        if (!Number.isFinite(wait)) return null;
        if (wait > 0) {
            applyProduction(next, wait);
            next.time += wait;
        }

        var qReduction = getQuestReduction(action.cost);
        next.res.wood = Math.max(0, (next.res.wood || 0) - ((action.cost.wood || 0) - qReduction.wood));
        next.res.clay = Math.max(0, (next.res.clay || 0) - ((action.cost.clay || 0) - qReduction.clay));
        next.res.iron = Math.max(0, (next.res.iron || 0) - ((action.cost.iron || 0) - qReduction.iron));

        var bt = action.buildTime;
        if (!Number.isFinite(bt) || bt < 0) return null;

        var fromLevel = next.buildings[action.building] || 0;
        var startTime = next.time;
        next.time += bt;
        applyProduction(next, bt);
        next.buildings[action.building] = fromLevel + 1;

        next.steps.push({
            step: next.steps.length + 1,
            building: action.building,
            fromLevel: fromLevel,
            toLevel: next.buildings[action.building],
            startTime: startTime,
            waitTime: wait,
            buildTime: bt,
            endTime: next.time,
            cost: action.cost,
            questReduction: qReduction,
            resAfter: cloneObj(next.res),
            isMain: action.building === 'main',
            isMine: action.building === 'timber' || action.building === 'clay' || action.building === 'iron'
        });

        return next;
    }

    // =========================================================================
    //  SIMULATION (BEAM SEARCH)
    // =========================================================================

    function simulateScenario(targetUnit, startRes, startBld, mineTargets) {
        var req = resolveRequirements(targetUnit);
        if (req.error) return { error: req.error };

        var required = req.required;
        var trackedBuildings = getTrackedBuildings(required, mineTargets);
        var startState = {
            time: 0,
            res: cloneObj(startRes || {}),
            buildings: cloneObj(startBld || {}),
            steps: []
        };

        if (isTargetMet(startState.buildings, required)) {
            return {
                targetId: targetUnit,
                targetName: U_NAMES[targetUnit] || targetUnit,
                totalTime: 0,
                steps: [],
                finalBuildings: cloneObj(startState.buildings)
            };
        }

        var frontier = [startState];
        var bestComplete = null;
        var bestSeen = new Map();
        var maxSteps = OPT_SEARCH.maxSteps || 220;
        var beamWidth = OPT_SEARCH.beamWidth || 72;
        var branchFactor = OPT_SEARCH.branchFactor || 4;

        for (var depth = 0; depth < maxSteps; depth++) {
            var nextFrontier = [];

            for (var fi = 0; fi < frontier.length; fi++) {
                var state = frontier[fi];

                if (bestComplete && state.time >= bestComplete.time) continue;
                if (isTargetMet(state.buildings, required)) {
                    if (!bestComplete || state.time < bestComplete.time) bestComplete = state;
                    continue;
                }

                var actions = getActions(state, required, mineTargets);
                if (!actions.length) continue;

                var picked = chooseActions(actions, req.targetBuilding, branchFactor);
                for (var ai = 0; ai < picked.length; ai++) {
                    var ns = simulateAction(state, picked[ai]);
                    if (!ns) continue;
                    if (bestComplete && ns.time >= bestComplete.time) continue;

                    var key = buildStateKey(ns, trackedBuildings);
                    var prev = bestSeen.get(key);
                    if (prev !== undefined && prev <= ns.time) continue;
                    bestSeen.set(key, ns.time);
                    nextFrontier.push(ns);
                }
            }

            if (!nextFrontier.length) break;
            nextFrontier.sort(function (a, b) { return a.time - b.time; });
            frontier = nextFrontier.slice(0, beamWidth);
        }

        var best = bestComplete;
        if (!best && frontier.length) {
            frontier.sort(function (a, b) { return a.time - b.time; });
            best = frontier[0];
        }

        if (!best) return { error: 'Keine gültige Baureihenfolge gefunden.' };
        if (!isTargetMet(best.buildings, required)) return { error: 'Optimierung unvollständig: Ziel konnte nicht erreicht werden.' };

        return {
            targetId: targetUnit,
            targetName: U_NAMES[targetUnit] || targetUnit,
            totalTime: best.time,
            steps: best.steps,
            finalBuildings: cloneObj(best.buildings)
        };
    }

    // =========================================================================
    //  OPTIMALE MINEN
    // =========================================================================

    function optimize(targetUnit, startRes, startBld) {
        var mineTargets = { timber: startBld.timber || 0, clay: startBld.clay || 0, iron: startBld.iron || 0 };
        var bestResult = simulateScenario(targetUnit, startRes, cloneObj(startBld), mineTargets);
        if (bestResult.error) return bestResult;
        var bestTime = bestResult.totalTime;

        for (var iter = 0; iter < 15; iter++) {
            var improved = false;
            var mines = ['timber', 'clay', 'iron'];
            for (var mi = 0; mi < mines.length; mi++) {
                var mine = mines[mi];
                var curTarget = mineTargets[mine] || 0;
                if (curTarget >= (startBld[mine] || 0) + 5) continue;
                var testTargets = cloneObj(mineTargets);
                testTargets[mine] = curTarget + 1;
                var testResult = simulateScenario(targetUnit, startRes, cloneObj(startBld), testTargets);
                if (testResult.error) continue;
                if (testResult.totalTime < bestTime - 1) {
                    bestTime = testResult.totalTime;
                    bestResult = testResult;
                    mineTargets = testTargets;
                    improved = true;
                } else {
                    var mc = getBuildCostAll(mine, curTarget + 1);
                    var mq = getQuestReduction(mc);
                    var free = (mc.wood - mq.wood) + (mc.clay - mq.clay) + (mc.iron - mq.iron) <= 0;
                    if (free && testResult.totalTime < bestTime + 3600) {
                        bestTime = testResult.totalTime;
                        bestResult = testResult;
                        mineTargets = testTargets;
                        improved = true;
                    }
                }
            }
            if (!improved) break;
        }

        return bestResult;
    }

    // =========================================================================
    //  OVERLAY-UI
    // =========================================================================

    function renderOverlay(result, targetUnit, diffTotal, resultMines) {
        removeOverlay();

        var container = document.getElementById('dso-result');
        if (!container) {
            var panel = document.getElementById('ds-optimizer-panel');
            if (!panel) return;
            container = document.createElement('div');
            container.id = 'dso-result';
            container.className = 'vis';
            container.style.cssText = 'margin-top:10px;padding:10px;';
            panel.parentNode.insertBefore(container, panel.nextSibling);
        }

        var worldName = game_data.world || '';

        var html = '';

        // --- Header / Info ---
        html += '<div class="dso-hdr">';
        html += '<div><h4>⚙ Buildorder</h4>';
        html += '<div class="dso-meta">';
        html += 'Einheit: <b>' + (U_NAMES[targetUnit] || targetUnit) + '</b>';
        if (worldName) html += ' | Welt: <b>' + worldName + '</b>';
        if (result && !result.error) html += ' | Gesamt: <b>' + fmtTime(result.totalTime) + '</b>';
        if (diffTotal !== null && diffTotal > 0) html += ' | <span class="dso-slower">Minen +1: +' + fmtTime(diffTotal) + '</span>';
        else if (diffTotal !== null) html += ' | <span class="dso-fast">Minen +1: kein Zeitgewinn</span>';
        html += '</div></div>';
        html += '<div style="display:flex;gap:4px;flex-shrink:0;">';
        html += '<button class="btn" onclick="DSO_copyBBCode()">📋 BBCode</button>';
        html += '<button class="btn" onclick="DSO_copyCSV()">📊 CSV</button>';
        html += '<button class="btn" id="dso-queue-btn">🔽 Queue</button>';
        html += '</div></div>';

        // --- Fehler ---
        if (result.error) {
            html += '<p class="dso-error">' + result.error + '</p>';
            container.innerHTML = html;
            return;
        }

        // --- Detailtabelle ---
        if (result && result.steps && result.steps.length) {
            html += '<div class="dso-scroll">';
            html += '<table class="vis_table">';
            html += '<tr><th>#</th><th>Gebäude</th><th>Stufe</th><th>Start</th><th>Warten</th><th>Bauzeit</th><th>Ende</th>';
            html += '<th>Kosten (H/L/E)</th><th>Reserven</th><th>Quest</th></tr>';

            result.steps.forEach(function (st) {
                var cls = '';
                if (st.isMain) cls = ' dso-main';
                else if (st.isMine) cls = ' dso-mine';
                else if (st.waitTime > 1) cls = ' dso-wait';

                html += '<tr class="' + cls.trim() + '">';
                html += '<td class="dso-step">' + st.step + '</td>';
                html += '<td class="dso-building">' + getBuildingName(st.building) + '</td>';
                html += '<td>' + st.fromLevel + ' → ' + st.toLevel + '</td>';
                html += '<td class="dso-time">' + fmtTime(st.startTime) + '</td>';
                html += '<td class="dso-time">' + (st.waitTime > 1 ? fmtTime(st.waitTime) : '-') + '</td>';
                html += '<td class="dso-time">' + fmtTime(st.buildTime) + '</td>';
                html += '<td class="dso-time">' + fmtTime(st.endTime) + '</td>';
                html += '<td class="dso-cost">' + fmtRes(st.cost) + '</td>';
                html += '<td class="dso-cost">' + fmtRes(st.resAfter) + '</td>';
                html += '<td class="dso-quest">' + (st.questReduction && (st.questReduction.wood || st.questReduction.clay || st.questReduction.iron) ? '-' + (st.questReduction.wood || 0) + ' / -' + (st.questReduction.clay || 0) + ' / -' + (st.questReduction.iron || 0) : '-') + '</td>';
                html += '</tr>';
            });
            html += '</table>';
            html += '</div>';
        }

        // --- Mit Minen +1 ---
        if (resultMines && !resultMines.error && resultMines.steps && resultMines.steps.length && diffTotal !== 0) {
            html += '<details><summary>📋 Mit Minen +1 — ' + fmtTime(resultMines.totalTime) + ' (' + (diffTotal > 0 ? '+' : '') + fmtTime(diffTotal) + ')</summary>';
            html += '<div class="dso-scroll">';
            html += '<table class="vis_table">';
            html += '<tr><th>#</th><th>Gebäude</th><th>Stufe</th><th>Start</th><th>Warten</th><th>Bauzeit</th><th>Ende</th><th>Kosten</th><th>Quest</th></tr>';
            resultMines.steps.forEach(function (st) {
                html += '<tr><td class="dso-step">' + st.step + '</td><td class="dso-building">' + getBuildingName(st.building) + '</td><td>' + st.fromLevel + '→' + st.toLevel + '</td>';
                html += '<td class="dso-time">' + fmtTime(st.startTime) + '</td><td class="dso-time">' + (st.waitTime > 1 ? fmtTime(st.waitTime) : '-') + '</td>';
                html += '<td class="dso-time">' + fmtTime(st.buildTime) + '</td><td class="dso-time">' + fmtTime(st.endTime) + '</td>';
                html += '<td class="dso-cost">' + fmtRes(st.cost) + '</td>';
                html += '<td class="dso-quest">' + (st.questReduction && (st.questReduction.wood || st.questReduction.clay || st.questReduction.iron) ? '-' + (st.questReduction.wood || 0) + ' / -' + (st.questReduction.clay || 0) + ' / -' + (st.questReduction.iron || 0) : '-') + '</td></tr>';
            });
            html += '</table></div></details>';
        }

        container.innerHTML = html;

        var qBtn = document.getElementById('dso-queue-btn');
        if (qBtn) {
            qBtn.addEventListener('click', async function () {
                var result = wind.__dsoLastResult;
                if (!result || !result.steps || !result.steps.length) {
                    try { UI.ErrorMessage('Kein Optimierungsergebnis vorhanden.', 3000); } catch(e) {}
                    return;
                }
                var queue = [];
                result.steps.forEach(function (st) {
                    var bid = BUILD_QUEUE_ID_MAP[st.building];
                    var lvl = parseInt(st.toLevel, 10);
                    if (!bid || !Number.isFinite(lvl) || lvl < 1) return;
                    queue.push({ building: bid, level: lvl });
                });
                if (!queue.length) {
                    try { UI.ErrorMessage('Keine baubaren Schritte in der Queue.', 3000); } catch(e) {}
                    return;
                }
                var world = game_data.world;
                var villageId = game_data.village && game_data.village.id;
                var keyTemplates = 'dsu.buildbot.templates.' + world;
                var keySelected = 'dsu.buildbot.selectedTemplate.' + world + '.' + villageId;
                var existingTemplates = [];
                try {
                    if (typeof GM !== 'undefined' && GM.getValue) {
                        existingTemplates = await GM.getValue(keyTemplates, []);
                    } else {
                        existingTemplates = JSON.parse(localStorage.getItem(keyTemplates) || '[]');
                    }
                } catch (e) {
                    existingTemplates = [];
                }

                if (!Array.isArray(existingTemplates)) existingTemplates = [];

                var templateName = 'Optimizer ' + new Date().toLocaleString('de-DE');
                existingTemplates.push({ name: templateName, queue: queue });
                var newIdx = existingTemplates.length - 1;

                try {
                    if (typeof GM !== 'undefined' && GM.setValue) {
                        await GM.setValue(keyTemplates, existingTemplates);
                        if (villageId) await GM.setValue(keySelected, newIdx);
                    } else {
                        localStorage.setItem(keyTemplates, JSON.stringify(existingTemplates));
                        if (villageId) localStorage.setItem(keySelected, JSON.stringify(newIdx));
                    }
                    try { UI.SuccessMessage('Vorlage "' + templateName + '" erstellt – ' + queue.length + ' Schritte.', 4000); } catch(e) {}
                } catch (e) {
                    try { UI.ErrorMessage('Export fehlgeschlagen: ' + e.message, 3000); } catch(ex) {}
                }
            });
        }

        if (!document.getElementById('dso-style')) {
            var s = document.createElement('style');
            s.id = 'dso-style';
            s.textContent = `
                #dso-result { background:linear-gradient(135deg,#f9f6ed 0%,#f5f0e0 100%); border:1px solid #c1a264; border-radius:6px; box-shadow:0 2px 8px rgba(0,0,0,0.08); }
                #dso-result .dso-hdr { display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; padding-bottom:6px; border-bottom:2px solid #c1a264; }
                #dso-result .dso-hdr h4 { margin:0; font-size:15px; color:#5c4a1e; }
                #dso-result .dso-hdr .dso-meta { font-size:11px; color:#888; }
                #dso-result .dso-hdr .dso-meta b { color:#5c4a1e; }
                #dso-result .dso-hdr .dso-meta .dso-slower { color:#b91c1c; }
                #dso-result .dso-hdr .dso-meta .dso-fast { color:#888; }
                #dso-result .vis_table { width:100%; font-size:11px; border-collapse:separate; border-spacing:0; border-radius:4px; overflow:hidden; }
                #dso-result .vis_table th { background:linear-gradient(180deg,#d4b86a 0%,#c1a264 100%); color:#fff; padding:5px 6px; font-weight:bold; text-shadow:0 1px 1px rgba(0,0,0,0.2); white-space:nowrap; }
                #dso-result .vis_table th:first-child { border-radius:4px 0 0 0; }
                #dso-result .vis_table th:last-child { border-radius:0 4px 0 0; }
                #dso-result .vis_table td { padding:3px 6px; border-bottom:1px solid #e8dcc6; text-align:center; white-space:nowrap; }
                #dso-result .vis_table tr:last-child td { border-bottom:none; }
                #dso-result .vis_table tr:hover td { background:rgba(193,162,100,0.08) !important; }
                #dso-result .dso-main td { background:#e8f0fe; }
                #dso-result .dso-mine td { background:#e8f5e9; }
                #dso-result .dso-wait td { background:#fff3e0; }
                #dso-result .dso-step { font-weight:bold; color:#5c4a1e; }
                #dso-result .dso-building { font-weight:500; }
                #dso-result .dso-time { font-family:monospace; font-size:11px; color:#444; }
                #dso-result .dso-cost { color:#666; font-size:10px; }
                #dso-result .dso-quest { color:#2e7d32; font-size:10px; }
                #dso-result .dso-btn-row { margin-top:6px; display:flex; gap:4px; }
                #dso-result .dso-btn-row .btn { font-size:11px !important; }
                #dso-result details { margin-top:8px; }
                #dso-result details summary { cursor:pointer; font-weight:bold; font-size:12px; color:#888; padding:3px 0; border-radius:3px; }
                #dso-result details summary:hover { color:#8b6914; background:rgba(193,162,100,0.06); }
                #dso-result details .vis_table { font-size:10px; margin-top:4px; }
                #dso-result .dso-scroll { overflow-x:auto; }
                #dso-result .dso-error { color:#b91c1c; font-weight:bold; text-align:center; padding:15px; }
            `;
            document.head.appendChild(s);
        }
    }

    function removeOverlay() {
        var el = document.getElementById('dso-result');
        if (el) el.remove();
    }

    // =========================================================================
    //  EXPORT
    // =========================================================================

    window.DSO_copyBBCode = function () {
        var el = document.getElementById('dso-result');
        if (!el) return;
        var tables = el.querySelectorAll('.vis_table, .dso-tbl');
        var bb = '';
        tables.forEach(function (t) {
            var rows = t.querySelectorAll('tr');
            bb += '[table]\n';
            rows.forEach(function (r) {
                var cells = r.querySelectorAll('th, td');
                var row = '[*]';
                cells.forEach(function (c, i) {
                    if (i > 0) row += '[|]';
                    row += c.textContent.trim();
                });
                bb += row + '\n';
            });
            bb += '[/table]\n\n';
        });
        var ta = document.createElement('textarea');
        ta.value = bb;
        ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch(e) {}
        document.body.removeChild(ta);
        try { UI.SuccessMessage('BBCode kopiert!', 2000); } catch(e) {}
    };

    window.DSO_copyCSV = function () {
        var el = document.getElementById('dso-result');
        if (!el) return;
        var tables = el.querySelectorAll('.vis_table, .dso-tbl');
        var csv = '';
        tables.forEach(function (t) {
            var rows = t.querySelectorAll('tr');
            rows.forEach(function (r) {
                var cells = r.querySelectorAll('th, td');
                var row = [];
                cells.forEach(function (c) { row.push('"' + c.textContent.trim() + '"'); });
                csv += row.join(';') + '\n';
            });
        });
        var ta = document.createElement('textarea');
        ta.value = csv; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); } catch(e) {}
        document.body.removeChild(ta);
        try { UI.SuccessMessage('CSV kopiert!', 2000); } catch(e) {}
    };

    // =========================================================================
    //  HAUPTPROGRAMM
    // =========================================================================

    function runOptimization(targetUnit) {
        if (isComputing) return;
        isComputing = true;

        ensureConfigs(function (ready) {
            if (!ready) {
                try { UI.ErrorMessage('Configs konnten nicht geladen werden.', 3000); } catch(e) {}
                isComputing = false;
                return;
            }

            var startRes = currentResources();
            var startBld = currentBuildings();
            var result = optimize(targetUnit, startRes, startBld);
            wind.__dsoLastResult = result;
            renderOverlay(result, targetUnit, null, null);
            isComputing = false;
        });
    }

    // =========================================================================
    //  INIT
    // =========================================================================

    function init() {
        var iv = setInterval(function () {
            if (!document.getElementById('content_value')) return;
            clearInterval(iv);

            // Panel im Spiel
            var panel = document.createElement('div');
            panel.id = 'ds-optimizer-panel';
            panel.className = 'vis';
            panel.style.cssText = 'margin-top:10px;padding:10px;';
            panel.innerHTML = '<h4>⚙ Bau-Optimierer</h4>'
                + '<div class="vis_item"><select id="dso-unit" style="width:100%;margin-bottom:6px;">'
                + Object.keys(UNIT_BUILDING).map(function (k) {
                    return '<option value="' + k + '">' + (U_NAMES[k] || k) + '</option>';
                }).join('')
                + '</select>'
                + '<button id="dso-start" class="btn" style="width:100%;">Optimierung berechnen</button></div>';

            var cv = document.getElementById('content_value');
            var target = cv.querySelector('table.vis') || cv.firstElementChild;
            if (target && target.parentNode) {
                target.parentNode.insertBefore(panel, target.nextSibling);
            } else {
                cv.appendChild(panel);
            }

            document.getElementById('dso-start').addEventListener('click', function () {
                var sel = document.getElementById('dso-unit');
                var unitId = sel ? sel.value : 'snob';
                var btn = this;
                btn.textContent = 'Berechne...';
                btn.disabled = true;
                setTimeout(function () {
                    removeOverlay();
                    runOptimization(unitId);
                    btn.textContent = 'Vergleich berechnen';
                    btn.disabled = false;
                }, 30);
            });
        }, 200);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Console-API
    window.DSO = {
        run: function (id) { runOptimization(id || 'snob'); },
        config: function () { return { buildConf: buildConf, serverConf: serverConf }; },
        units: UNIT_BUILDING,
    };
    console.log('[DSO] Build Optimierer geladen. DSO.run("snob")');
})();
