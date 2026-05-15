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

    // =========================================================================
    //  STATE
    // =========================================================================

    let SH = wind.SettingsHelper || null;
    let buildConf = null;
    let serverConf = null;
    let unitConf = null;
    let isComputing = false;

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

    function fmtRes(r) { return (r.wood || 0) + ' / ' + (r.clay || 0) + ' / ' + (r.iron || 0); }
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

    var LEVEL_FACTOR = [
        0,
        0.01,
        0.01,
        0.161516436165735,
        0.50029139641408,
        0.956686699233349,
        1.5081900491495,
        2.15872239973382,
        2.92402139950873,
        3.8264181497567,
        4.89346144998492,
        6.15818184983154,
        7.65953289967186,
        9.443819799993,
        11.5652774999329,
        14.0884324499439,
        17.0893036499556,
        20.6580694499856,
        24.9012377499945,
        29.945072799976,
        35.9387667499927,
        43.0592063999605,
        51.5155386999649,
        61.5553531499961,
        73.4716182999805,
        87.6113783496337,
        104.384299199706,
        124.275985499834,
        147.860715649921,
        175.81797914994,
        208.950582949914
    ];

    function getLevelFactor(lvl, building) {
        if (lvl < 1) return LEVEL_FACTOR[1] || 0.096;
        if (lvl === 1 && building) {
            var cfg = buildConf && buildConf[building];
            if (cfg && parseInt(cfg.max_level, 10) === 1) return 0.095972951067676;
        }
        if (lvl <= 30) return LEVEL_FACTOR[lvl];
        var val = LEVEL_FACTOR[30];
        for (var i = 31; i <= lvl; i++) {
            val *= 1.188;
        }
        return val;
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
        var gv = game_data.village;
        if (gv) {
            var prodKey = type === 'timber' ? 'wood' : type === 'clay' ? 'stone' : type === 'iron' ? 'iron' : null;
            if (prodKey && gv[prodKey + '_prod'] !== undefined) {
                return Math.round(parseFloat(gv[prodKey + '_prod']) * 3600);
            }
        }
        if (!serverConf) return 30;
        var base = (serverConf.game && serverConf.game.base_production) ? parseFloat(serverConf.game.base_production) : 30;
        var sp = speed();
        var bonus = (gv && gv.bonus && gv.bonus[prodKey]) ? parseFloat(gv.bonus[prodKey]) : 1;
        return Math.round(base * sp * Math.pow(1.1631, Math.max(0, parseInt(lvl) - 1)) * bonus);
    }

    function getProductionPerHour(building, lvl) {
        return getProduction(toInternalBuilding(building), building === 'timber' ? 'wood' : building === 'clay' ? 'stone' : 'iron');
    }

    function getQuestReduction(cost) {
        function reduceOne(val, isIron) {
            if (isIron) {
                if (val < 1000) return Math.min(val, 100);
                if (val > 20000) return 2000;
                return Math.round(val * 0.1);
            }
            if (val < 1500) return Math.min(val, 150);
            if (val > 30000) return 2000;
            return Math.round(val * 0.1);
        }
        return {
            wood: reduceOne(cost.wood || 0, false),
            clay: reduceOne(cost.clay || 0, false),
            iron: reduceOne(cost.iron || 0, true)
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
        // Speicher nur fürs Ziel relevant
        return true;
    }

    function calcProduction(state) {
        return {
            wood: getProduction(state.buildings.timber || 0, 'timber'),
            clay: getProduction(state.buildings.clay || 0, 'clay'),
            iron: getProduction(state.buildings.iron || 0, 'iron')
        };
    }

    function calcWaitTime(state, cost) {
        var prod = calcProduction(state);
        var maxWait = 0;
        var res = state.res || { wood: 0, clay: 0, iron: 0 };
        var qr = getQuestReduction(cost);
        var needWood  = Math.max(0, (cost.wood  || 0) - qr.wood  - (res.wood  || 0));
        var needClay  = Math.max(0, (cost.clay  || 0) - qr.clay  - (res.clay  || 0));
        var needIron  = Math.max(0, (cost.iron  || 0) - qr.iron  - (res.iron  || 0));
        if (prod.wood  > 0 && needWood  > 0) maxWait = Math.max(maxWait, needWood  / (prod.wood  / 3600));
        if (prod.clay  > 0 && needClay  > 0) maxWait = Math.max(maxWait, needClay  / (prod.clay  / 3600));
        if (prod.iron  > 0 && needIron  > 0) maxWait = Math.max(maxWait, needIron  / (prod.iron  / 3600));
        return maxWait;
    }

    function applyProduction(state, duration) {
        var p = calcProduction(state);
        var hours = duration / 3600;
        state.res.wood  += p.wood  * hours;
        state.res.clay  += p.clay  * hours;
        state.res.iron  += p.iron  * hours;
    }



    // =========================================================================
    //  GREEDY-SCHEDULER
    // =========================================================================

    function getActions(state, required, mineTargets) {
        var actions = [];
        var isMine = function (b) { return b === 'timber' || b === 'clay' || b === 'iron'; };

        for (var bId in state.buildings) {
            var curLvl = state.buildings[bId] || 0;
            var tgt = required[bId] || 0;
            if (isMine(bId) && mineTargets) tgt = Math.max(tgt, mineTargets[bId] || 0);
            var nextLvl = curLvl + 1;
            if (nextLvl > tgt) continue;

            var preqs = getBuildingPrereqs(bId);
            var met = true;
            for (var pi = 0; pi < preqs.length; pi++) {
                if ((state.buildings[preqs[pi].building] || 0) < preqs[pi].level) { met = false; break; }
            }
            if (!met) continue;

            var cost = getBuildCostAll(bId, nextLvl);
            var bt = getBuildTime(bId, nextLvl, state.buildings.main || 1);
            var wait = calcWaitTime(state, cost);

            actions.push({
                building: bId, level: nextLvl, cost: cost,
                buildTime: bt, waitTime: wait,
                isMain: bId === 'main', isMine: isMine(bId),
                isRequired: (required[bId] || 0) >= nextLvl,
            });
        }
        return actions;
    }

    function chooseAction(actions, targetBuilding) {
        if (!actions.length) return null;
        actions.sort(function (a, b) {
            // Zielgebäude immer nach hinten (alle Voraussetzungen müssen erst fertig sein)
            if (a.building === targetBuilding && b.building !== targetBuilding) return 1;
            if (a.building !== targetBuilding && b.building === targetBuilding) return -1;
            if (a.isMain !== b.isMain) return a.isMain ? -1 : 1;
            if (a.isMine !== b.isMine) return a.isMine ? -1 : 1;
            if (a.isRequired !== b.isRequired) return a.isRequired ? -1 : 1;
            if (Math.abs(a.waitTime - b.waitTime) > 1) return a.waitTime - b.waitTime;
            return a.buildTime - b.buildTime;
        });
        return actions[0];
    }

    // =========================================================================
    //  SIMULATION
    // =========================================================================

    function simulateScenario(targetUnit, startRes, startBld, mineTargets) {
        var req = resolveRequirements(targetUnit);
        if (req.error) return { error: req.error };

        var required = req.required;
        var state = {
            time: 0, res: cloneObj(startRes || {}),
            buildings: cloneObj(startBld || {}),
            steps: []
        };

        var maxSteps = 200;
        for (var sc = 0; sc < maxSteps; sc++) {
            var targetMet = true;
            for (var tb in required) {
                if ((state.buildings[tb] || 0) < required[tb]) { targetMet = false; break; }
            }
            if (targetMet) break;

            var actions = getActions(state, required, mineTargets);
            if (!actions.length) break;

            var chosen = chooseAction(actions, req.targetBuilding);
            if (!chosen) break;

            var totalWait = 0;
            if (chosen.waitTime > 0) {
                totalWait += chosen.waitTime;
                applyProduction(state, chosen.waitTime);
                state.time += chosen.waitTime;
                chosen.waitTime = calcWaitTime(state, chosen.cost);
                if (chosen.waitTime > 0) {
                    totalWait += chosen.waitTime;
                    applyProduction(state, chosen.waitTime);
                    state.time += chosen.waitTime;
                }
            }

            var qReduction = getQuestReduction(chosen.cost);
            state.res.wood  = Math.max(0, (state.res.wood  || 0) - ((chosen.cost.wood  || 0) - qReduction.wood));
            state.res.clay  = Math.max(0, (state.res.clay  || 0) - ((chosen.cost.clay  || 0) - qReduction.clay));
            state.res.iron  = Math.max(0, (state.res.iron  || 0) - ((chosen.cost.iron  || 0) - qReduction.iron));

            var bt = chosen.buildTime;
            state.time += bt;
            applyProduction(state, bt);
            state.buildings[chosen.building] = (state.buildings[chosen.building] || 0) + 1;

            state.steps.push({
                step: state.steps.length + 1,
                building: chosen.building,
                fromLevel: (state.buildings[chosen.building] || 0) - 1,
                toLevel: state.buildings[chosen.building] || 0,
                startTime: state.time - bt,
                waitTime: totalWait,
                buildTime: bt,
                endTime: state.time,
                cost: chosen.cost,
                questReduction: qReduction,
                resAfter: cloneObj(state.res),
                isMain: chosen.building === 'main',
                isMine: chosen.building === 'timber' || chosen.building === 'clay' || chosen.building === 'iron',
            });
        }

        return {
            targetId: targetUnit,
            targetName: U_NAMES[targetUnit] || targetUnit,
            totalTime: state.time,
            steps: state.steps,
            finalBuildings: cloneObj(state.buildings),
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

        var worldName = game_data.world || '';

        var html = '';
        html += '<div id="dso-overlay" style="position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:99999;max-width:1300px;width:95%;max-height:85vh;overflow-y:auto;background:#f9f6ed;border:2px solid #c1a264;border-radius:10px;box-shadow:0 6px 28px rgba(0,0,0,0.35);padding:14px;font:13px/1.4 system-ui,sans-serif;color:#2c2c2c;">';

        // --- Header ---
        html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;padding-bottom:6px;border-bottom:2px solid #c1a264;">';
        html += '<div><h2 style="margin:0;font-size:17px;">⚙ Build Optimierer</h2>';
        html += '<div style="font-size:12px;color:#666;">';
        html += 'Einheit: <b>' + (U_NAMES[targetUnit] || targetUnit) + '</b>';
        if (worldName) html += ' | Welt: <b>' + worldName + '</b>';
        if (result && !result.error) html += ' | Gesamt: <b>' + fmtTime(result.totalTime) + '</b>';
        if (diffTotal !== null && diffTotal > 0) html += ' | <span style="color:#b91c1c;">Minen +1: +' + fmtTime(diffTotal) + ' langsamer</span>';
        else if (diffTotal !== null) html += ' | <span style="color:#888;">Minen +1: kein Zeitgewinn</span>';
        html += '</div></div>';
        html += '<div style="display:flex;gap:4px;">';
        html += '<button class="dso-btn" onclick="this.closest(\'#dso-overlay\').remove()">✕ Schließen</button>';
        html += '</div></div>';

        // --- Fehleranzeige ---
        if (result.error) {
            html += '<p style="color:#b91c1c;font-weight:bold;text-align:center;padding:20px;">' + result.error + '</p>';
        }

        // --- Detailtabelle ---
        if (result && !result.error && result.steps && result.steps.length) {
            html += '<h3 style="margin:8px 0 4px;font-size:14px;">📋 Buildorder</h3>';
            html += '<table class="dso-tbl" style="width:100%;border-collapse:collapse;font-size:11px;">';
            html += '<tr style="background:#c1a264;color:#fff;">';
            html += '<th>#</th><th>Gebäude</th><th>Stufe</th><th>Start</th><th>Warten</th><th>Bauzeit</th><th>Ende</th>';
            html += '<th>Kosten (H/L/E)</th><th>Reserven</th><th>Quest</th></tr>';

            result.steps.forEach(function (st) {
                var bg = '#fff';
                if (st.isMain) bg = '#e8f0fe';
                else if (st.isMine) bg = '#e8f5e9';
                if (st.waitTime > 1) bg = '#fff3e0';

                html += '<tr style="background:' + bg + ';">';
                html += '<td>' + st.step + '</td>';
                html += '<td>' + getBuildingName(st.building) + '</td>';
                html += '<td>' + st.fromLevel + ' → ' + st.toLevel + '</td>';
                html += '<td>' + fmtTime(st.startTime) + '</td>';
                html += '<td>' + (st.waitTime > 1 ? fmtTime(st.waitTime) : '-') + '</td>';
                html += '<td>' + fmtTime(st.buildTime) + '</td>';
                html += '<td>' + fmtTime(st.endTime) + '</td>';
                html += '<td>' + fmtRes(st.cost) + '</td>';
                html += '<td>' + fmtRes(st.resAfter) + '</td>';
                html += '<td>' + (st.questReduction && (st.questReduction.wood || st.questReduction.clay || st.questReduction.iron) ? '-' + (st.questReduction.wood || 0) + ' / -' + (st.questReduction.clay || 0) + ' / -' + (st.questReduction.iron || 0) : '-') + '</td>';
                html += '</tr>';
            });
            html += '</table>';

            // Export-Buttons
            html += '<div style="margin-top:6px;display:flex;gap:4px;">';
            html += '<button class="dso-btn" onclick="DSO_copyBBCode()">📋 BBCode</button>';
            html += '<button class="dso-btn" onclick="DSO_copyCSV()">📊 CSV</button>';
            // Vergleich: Mit Minen +1
            if (resultMines && !resultMines.error && resultMines.steps && resultMines.steps.length && diffTotal !== 0) {
                html += '<details style="margin-top:10px;"><summary style="cursor:pointer;font-weight:bold;font-size:12px;color:#666;">📋 Mit Minen +1 — ' + fmtTime(resultMines.totalTime) + ' (' + (diffTotal > 0 ? '+' : '') + fmtTime(diffTotal) + ')</summary>';
                html += '<table class="dso-tbl" style="width:100%;border-collapse:collapse;font-size:10px;margin-top:4px;">';
                html += '<tr style="background:#c1a264;color:#fff;"><th>#</th><th>Gebäude</th><th>Stufe</th><th>Start</th><th>Warten</th><th>Bauzeit</th><th>Ende</th><th>Kosten</th><th>Quest</th></tr>';
                resultMines.steps.forEach(function (st) {
                    html += '<tr><td>' + st.step + '</td><td>' + getBuildingName(st.building) + '</td><td>' + st.fromLevel + '→' + st.toLevel + '</td>';
                    html += '<td>' + fmtTime(st.startTime) + '</td><td>' + (st.waitTime > 1 ? fmtTime(st.waitTime) : '-') + '</td>';
                    html += '<td>' + fmtTime(st.buildTime) + '</td><td>' + fmtTime(st.endTime) + '</td>';
                    html += '<td>' + fmtRes(st.cost) + '</td>';
                    html += '<td>' + (st.questReduction && (st.questReduction.wood || st.questReduction.clay || st.questReduction.iron) ? '-' + (st.questReduction.wood || 0) + ' / -' + (st.questReduction.clay || 0) + ' / -' + (st.questReduction.iron || 0) : '-') + '</td></tr>';
                });
                html += '</table></details>';
            }
            html += '</div>';
        }

        html += '</div>';

        // Style injecten
        var style = document.getElementById('dso-style');
        if (!style) {
            style = document.createElement('style');
            style.id = 'dso-style';
            style.textContent = `
                .dso-btn { padding:3px 10px; background:#c1a264; color:#fff; border:none; border-radius:4px; cursor:pointer; font-size:12px; font-family:inherit; }
                .dso-btn:hover { background:#a88844; }
                .dso-tbl { border-collapse:collapse; }
                .dso-tbl th, .dso-tbl td { padding:2px 5px; border:1px solid #d4c9a8; text-align:center; white-space:nowrap; }
                .dso-tbl th { font-weight:bold; }
                #dso-overlay ::-webkit-scrollbar { width:6px; }
                #dso-overlay ::-webkit-scrollbar-track { background:#f5f0e0; }
                #dso-overlay ::-webkit-scrollbar-thumb { background:#c1a264; border-radius:3px; }
                #dso-overlay details summary { padding:2px 0; }
                #dso-overlay details summary:hover { color:#8b6914; }
            `;
            document.head.appendChild(style);
        }

        var div = document.createElement('div');
        div.innerHTML = html;
        document.body.appendChild(div.firstElementChild);
    }

    function removeOverlay() {
        var el = document.getElementById('dso-overlay');
        if (el) el.remove();
    }

    // =========================================================================
    //  EXPORT
    // =========================================================================

    window.DSO_copyBBCode = function () {
        var el = document.getElementById('dso-overlay');
        if (!el) return;
        var tables = el.querySelectorAll('.dso-tbl');
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
        var el = document.getElementById('dso-overlay');
        if (!el) return;
        var tables = el.querySelectorAll('.dso-tbl');
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
            var diffTotal = null;
            var resultMines = null;
            var mineTargetsPlus = {
                timber: (startBld.timber || 0) + 1,
                clay: (startBld.clay || 0) + 1,
                iron: (startBld.iron || 0) + 1
            };
            resultMines = simulateScenario(targetUnit, startRes, cloneObj(startBld), mineTargetsPlus);
            if (resultMines && !resultMines.error) {
                diffTotal = resultMines.totalTime - (result.totalTime || 0);
            }
            renderOverlay(result, targetUnit, diffTotal, resultMines);
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
