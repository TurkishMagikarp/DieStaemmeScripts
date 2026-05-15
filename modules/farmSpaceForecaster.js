(function () {
  'use strict';
  if (window.__dsFarmForecastLoaded) return;
  window.__dsFarmForecastLoaded = true;

  const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  const gd = win.game_data;
  if (!gd || !gd.village) return;
  if (win.location.href.indexOf('screen=main') === -1) return;

  const POP_COST = {
    spear: 1, sword: 1, axe: 1, archer: 1,
    spy: 2, light: 4, marauder: 5, heavy: 6,
    ram: 5, catapult: 8, trebuchet: 8,
    snob: 100, noble: 100, coach: 100,
    doppelsoldner: 6, berserker: 6, ritter: 100,
    militia: 1
  };

  const UNIT_NAMES = {
    spear: 'Speertr\u00e4ger', sword: 'Schwertk\u00e4mpfer', axe: 'Axtk\u00e4mpfer',
    archer: 'Bogensch\u00fctze', spy: 'Sp\u00e4her', light: 'Leichte Kav.',
    marauder: 'Pl\u00fcnderer', heavy: 'Schwere Kav.',
    ram: 'Rammbock', catapult: 'Katapult', trebuchet: 'Tribock',
    snob: 'Adel', noble: 'Adel', coach: 'Adel',
    doppelsoldner: 'Doppels\u00f6ldner', berserker: 'Berserker',
    ritter: 'Paladin', militia: 'Miliz'
  };

  const VID = gd.village.id;
  let refreshTimer = null;

  function getFarmCapacity(lvl) {
    return Math.round(240 * Math.pow(1.17210245334, lvl - 1));
  }

  function parseTime(s) {
    if (!s) return NaN;
    s = s.trim();
    const parts = s.split(':');
    if (parts.length === 3) {
      return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
    }
    const n = parseInt(s);
    return isNaN(n) ? NaN : n;
  }

  function getUnitName(key) {
    return UNIT_NAMES[key] || key;
  }

  function getBuildQueueEvents() {
    const events = [];
    document.querySelectorAll('#buildqueue tr').forEach(function (row) {
      var m = (row.className || '').match(/buildorder_(\w+)/);
      if (!m) return;
      var building = m[1];
      var cells = row.querySelectorAll('td');
      if (cells.length < 2) return;
      var lvl = NaN;
      var levelMatch = cells[0].textContent.match(/(?:Stufe|Level)\s*(\d+)/i);
      if (levelMatch) lvl = parseInt(levelMatch[1]);
      var timer = row.querySelector('.timer');
      var timeStr = timer ? timer.textContent.trim() : cells[1].textContent.trim();
      var secs = parseTime(timeStr);
      if (!isNaN(lvl) && lvl > 0 && lvl < 200 && !isNaN(secs)) {
        var ev = {
          type: 'build',
          building: building,
          level: lvl,
          delayMs: secs * 1000,
          desc: (building === 'farm' ? 'Farm' : building) + ' auf Stufe ' + lvl
        };
        if (building === 'farm') {
          ev.newCapacity = getFarmCapacity(lvl);
        }
        events.push(ev);
      }
    });
    return events;
  }

  function fetchRecruitEvents() {
    return $.get('/game.php?village=' + VID + '&screen=train&_=' + Date.now()).then(function (html) {
      return parseRecruitHTML(html);
    });
  }

  function parseRecruitHTML(html) {
    var events = [];
    var div = document.createElement('div');
    div.innerHTML = html;

    function findUnitInRow(row) {
      var img = row.querySelector('img[src*="/unit/"]');
      if (!img) return null;
      var src = img.src;
      var parts = src.split('/');
      var file = parts[parts.length - 1];
      var name = file.replace(/\.png$/, '').toLowerCase();
      return name;
    }

    function findCountInRow(row) {
      var cells = row.querySelectorAll('td');
      for (var i = 0; i < cells.length; i++) {
        var val = parseInt(cells[i].textContent.replace(/\D/g, ''));
        if (!isNaN(val) && val > 0 && val < 100000) return val;
      }
      return 0;
    }

    function findTimerInRow(row) {
      var timer = row.querySelector('.timer');
      if (timer) return parseTime(timer.textContent);
      var cells = row.querySelectorAll('td');
      for (var i = 0; i < cells.length; i++) {
        var text = cells[i].textContent.trim();
        if (text.match(/^\d{1,3}:\d{2}:\d{2}$/)) return parseTime(text);
        var innerTimer = cells[i].querySelector('.timer');
        if (innerTimer) return parseTime(innerTimer.textContent);
      }
      return NaN;
    }

    var queueContainer = div.querySelector('#trainqueue');
    if (!queueContainer) {
      queueContainer = div.querySelector('#unit_queue');
    }
    if (!queueContainer) {
      var tables = div.querySelectorAll('table.vis');
      for (var i = 0; i < tables.length; i++) {
        if (tables[i].innerHTML.indexOf('Kaserne') !== -1 || tables[i].innerHTML.indexOf('train') !== -1 || tables[i].querySelector('img[src*="/unit/"]')) {
          queueContainer = tables[i];
          break;
        }
      }
    }
    if (!queueContainer) return events;

    var rows = queueContainer.querySelectorAll('tr');
    for (var j = 0; j < rows.length; j++) {
      var row = rows[j];
      if (row.querySelector('th')) continue;
      var unit = findUnitInRow(row);
      if (!unit) continue;
      var count = findCountInRow(row);
      var secs = findTimerInRow(row);
      if (count > 0 && !isNaN(secs)) {
        var pop = (POP_COST[unit] || 1) * count;
        events.push({
          type: 'recruit',
          unit: unit,
          count: count,
          popAdd: pop,
          delayMs: secs * 1000,
          desc: getUnitName(unit) + ': ' + count + ' (' + pop + ' Pop)'
        });
      }
    }
    return events;
  }

  function calculateForecast(buildEvents, recruitEvents, currentPop, currentMax) {
    var timeline = [];
    var now = Date.now();

    buildEvents.forEach(function (e) {
      if (e.building === 'farm') {
        timeline.push({ at: now + e.delayMs, type: 'cap', newCap: e.newCapacity, desc: e.desc });
      }
    });
    recruitEvents.forEach(function (e) {
      timeline.push({ at: now + e.delayMs, type: 'pop', add: e.popAdd, desc: e.desc });
    });
    timeline.sort(function (a, b) { return a.at - b.at; });

    var pop = currentPop;
    var cap = currentMax;

    for (var i = 0; i < timeline.length; i++) {
      var ev = timeline[i];
      if (ev.type === 'cap') cap = ev.newCap;
      else if (ev.type === 'pop') pop += ev.add;

      if (pop > cap) {
        return {
          status: 'overflow',
          fullAt: ev.at,
          fullDate: new Date(ev.at),
          popAtFull: pop,
          capAtFull: cap,
          cause: ev.desc,
          overflowBy: pop - cap
        };
      }
    }

    var remaining = cap - pop;
    return {
      status: 'safe',
      remainingCap: remaining,
      popEnd: pop,
      capEnd: cap,
      eventsProcessed: timeline.length
    };
  }

  function renderUnitSuggestion(remaining) {
    var units = [
      { n: 'Speertr\u00e4ger', p: 1 },
      { n: 'Schwertk\u00e4mpfer', p: 1 },
      { n: 'Axtk\u00e4mpfer', p: 1 },
      { n: 'Leichte Kav.', p: 4 },
      { n: 'Schwere Kav.', p: 6 },
      { n: 'Rammbock', p: 5 },
      { n: 'Katapult', p: 8 }
    ];
    var parts = [];
    for (var i = 0; i < units.length; i++) {
      var c = Math.floor(remaining / units[i].p);
      if (c > 0) {
        parts.push(c + 'x ' + units[i].n);
        if (parts.length >= 3) break;
      }
    }
    return parts.join(', ');
  }

  function renderBar(pct, color) {
    return '<div style="height:14px;background:#e0e0e0;border-radius:7px;overflow:hidden;">'
      + '<div style="height:100%;width:' + Math.min(pct, 100) + '%;background:' + color + ';border-radius:7px;"></div></div>';
  }

  function getFutureMax(buildEvents) {
    var maxLvl = getCurrentFarmLevel();
    for (var i = 0; i < buildEvents.length; i++) {
      if (buildEvents[i].building === 'farm' && buildEvents[i].level > maxLvl) {
        maxLvl = buildEvents[i].level;
      }
    }
    return maxLvl > getCurrentFarmLevel() ? getFarmCapacity(maxLvl) : 0;
  }

  function renderPanel(data) {
    var panel = document.getElementById('ds-farm-forecast');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'ds-farm-forecast';
      panel.style.cssText = 'position:fixed;top:200px;right:20px;z-index:9999;background:#f9f9f9;padding:12px;border:1px solid #ccc;border-radius:8px;box-shadow:0 0 5px rgba(0,0,0,.2);font-family:Verdana,sans-serif;font-size:12px;min-width:280px;max-width:320px;color:#333;';
      document.body.appendChild(panel);
    }

    var pop = getCurrentPop();
    var lvl = getCurrentFarmLevel();
    var max = getFarmCapacity(lvl);
    var curFree = max - pop;
    var pct = Math.round((pop / max) * 100);

    var buildEv = data._buildEvents || [];
    var futureMax = getFutureMax(buildEv);

    var color = '#4CAF50';
    if (pct > 90) { color = '#f44336'; }
    else if (pct > 75) { color = '#ff9800'; }

    var html = '';
    html += '<div style="font-weight:bold;font-size:14px;margin-bottom:6px;border-bottom:1px solid #ddd;padding-bottom:4px;">Farm-Prognose</div>';

    html += '<div style="margin-bottom:2px;display:flex;justify-content:space-between;font-size:11px;">';
    html += '<span>Jetzt: <b>' + pop + '</b> / <b>' + max + '</b></span>';
    html += '<span style="color:' + color + ';font-weight:bold;">' + pct + '%</span>';
    html += '</div>';
    html += renderBar(pct, color);

    if (futureMax > 0) {
      var futurePct = Math.round((pop / futureMax) * 100);
      var futureColor = '#4CAF50';
      if (futurePct > 90) futureColor = '#f44336';
      else if (futurePct > 75) futureColor = '#ff9800';
      html += '<div style="margin-top:6px;margin-bottom:2px;display:flex;justify-content:space-between;font-size:11px;">';
      html += '<span>Nach Bau: <b>' + pop + '</b> / <b>' + futureMax + '</b></span>';
      html += '<span style="color:' + futureColor + ';font-weight:bold;">' + futurePct + '%</span>';
      html += '</div>';
      html += '<div class="ds-farm-future-bar" style="animation:dsFarmPulse 1.5s ease-in-out infinite;">'
        + renderBar(futurePct, futureColor) + '</div>';
    }

    if (data.status === 'overflow') {
      var d = data.fullDate;
      var ds = pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '. ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
      html += '<div style="color:#f44336;font-weight:bold;margin-top:4px;">Farm voll ca. ' + ds + ' Uhr</div>';
      html += '<div style="font-size:11px;color:#888;">Ausgel\u00f6st durch: ' + data.cause + '</div>';
    }

    var allEvents = [];
    var recEv = data._recruitEvents || [];
    for (var i = 0; i < buildEv.length; i++) allEvents.push(buildEv[i]);
    for (var j = 0; j < recEv.length; j++) allEvents.push(recEv[j]);
    allEvents.sort(function (a, b) { return a.delayMs - b.delayMs; });

    if (allEvents.length > 0) {
      html += '<div style="margin-top:6px;border-top:1px solid #ddd;padding-top:4px;">';
      html += '<div style="font-size:11px;font-weight:bold;margin-bottom:2px;cursor:pointer;" onclick="var e=document.getElementById(\'ds-farm-events\');e.style.display=e.style.display===\'none\'?\'\':\'none\'">Details &#9662;</div>';
      html += '<div id="ds-farm-events" style="font-size:11px;color:#555;">';
      for (var k = 0; k < allEvents.length; k++) {
        var e = allEvents[k];
        var mins = Math.round(e.delayMs / 60000);
        var hrs = Math.floor(mins / 60);
        var rmin = mins % 60;
        var ts = hrs > 0 ? hrs + 'h ' + rmin + 'min' : rmin + 'min';
        var icon = e.type === 'build' ? '[B]' : '[R]';
        html += '<div style="margin:2px 0;">' + icon + ' ' + e.desc + ' <span style="color:#888;">(' + ts + ')</span></div>';
      }
      html += '</div></div>';
    }

    html += '<div style="margin-top:6px;text-align:right;font-size:11px;color:#aaa;">Farm Lv.' + lvl + '</div>';

    panel.innerHTML = html;
  }

  function pad(n) {
    return n < 10 ? '0' + n : '' + n;
  }

  function getCurrentPop() {
    if (typeof gd.village.pop === 'number' && gd.village.pop > 0) return gd.village.pop;
    var el = document.querySelector('.population');
    if (el) {
      var v = parseInt(el.textContent.replace(/\D/g, ''));
      if (!isNaN(v) && v > 0) return v;
    }
    return 0;
  }

  function getCurrentFarmLevel() {
    var lvl = parseInt(gd.village.buildings.farm);
    if (!isNaN(lvl) && lvl > 0 && lvl < 200) return lvl;
    return 1;
  }

  function update() {
    var buildEvents = getBuildQueueEvents();
    var currentPop = getCurrentPop();
    var farmLvl = getCurrentFarmLevel();
    fetchRecruitEvents().then(function (recruitEvents) {
      var forecast = calculateForecast(
        buildEvents, recruitEvents,
        currentPop,
        getFarmCapacity(farmLvl)
      );
      forecast._buildEvents = buildEvents;
      forecast._recruitEvents = recruitEvents;
      renderPanel(forecast);
    }, function () {
      var forecast = calculateForecast(
        buildEvents, [],
        currentPop,
        getFarmCapacity(farmLvl)
      );
      forecast._buildEvents = buildEvents;
      forecast._recruitEvents = [];
      renderPanel(forecast);
    });
  }

  (function injectCSS() {
    var s = document.createElement('style');
    s.textContent = '@keyframes dsFarmPulse{0%,100%{opacity:1}50%{opacity:.45}}';
    document.head.appendChild(s);
  })();

  setTimeout(update, 800);
  refreshTimer = setInterval(update, 30000);

  win.addEventListener('beforeunload', function () {
    if (refreshTimer) clearInterval(refreshTimer);
  });
})();
