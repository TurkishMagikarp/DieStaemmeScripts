(function () {
  'use strict';
  if (window.__dsFakeGenLoaded) return;
  window.__dsFakeGenLoaded = true;

  var sp = new URL(location.href).searchParams;
  var screen = sp.get('screen');
  if (screen !== 'place') return;
  var mode = sp.get('mode') || '';
  if (mode === 'scavenge' || mode === 'scavenge_mass' || mode === 'call') return;

  var guards = window.DSGuards || {};
  var guardAction = guards.guardAction;
  var pendingConfirm = false;
  var SESSION_KEY = 'dsFakeRun';

  var state = {
    targets: [],
    unitConfig: { spear: 0, sword: 0, axe: 0, archer: 0, light: 0, heavy: 0, ram: 0, catapult: 0 },
    attackMode: 'attack',
    delayMs: 3000,
    autoSend: true,
    running: false,
    currentIndex: 0,
    observer: null,
    finished: false
  };

  try {
    var saved = JSON.parse(localStorage.getItem('dsFakeGenConfig'));
    if (saved) {
      if (saved.unitConfig) state.unitConfig = saved.unitConfig;
      if (saved.attackMode) state.attackMode = saved.attackMode;
      if (saved.delayMs) state.delayMs = saved.delayMs;
      if (saved.targetsText) state.targetsText = saved.targetsText;
      if (typeof saved.autoSend !== 'undefined') state.autoSend = saved.autoSend;
    }
  } catch (e) {}

  var UNIT_LABELS = {
    spear: 'Speertr\u00e4ger', sword: 'Schwertk\u00e4mpfer', axe: 'Axtk\u00e4mpfer',
    archer: 'Bogensch\u00fctze', light: 'Leichte Kav.', heavy: 'Schwere Kav.',
    ram: 'Rammbock', catapult: 'Katapult'
  };

  var POP_COST = {
    spear: 1, sword: 1, axe: 1, archer: 1,
    spy: 2, light: 4, marauder: 5, heavy: 6,
    ram: 5, catapult: 8, trebuchet: 8,
    snob: 100, noble: 100, coach: 100
  };

  var FILL_ORDER = ['spy', 'spear', 'sword', 'axe'];

  function getAvailableUnits() {
    var avail = {};
    var units = ['spear', 'sword', 'axe', 'spy', 'light', 'heavy', 'ram', 'catapult', 'snob'];
    for (var i = 0; i < units.length; i++) {
      var u = units[i];
      var inp = document.querySelector('input[name="' + u + '"]');
      avail[u] = 0;
      if (inp) {
        var row = inp.closest('tr') || inp.closest('div.unit-input') || inp.parentElement;
        if (row) {
          var txt = row.textContent;
          var m = txt.match(/\((\d+)\)/);
          if (m) avail[u] = parseInt(m[1]);
        }
      }
    }
    return avail;
  }

  function getCalcMinPop() {
    var gd = typeof unsafeWindow !== 'undefined' ? unsafeWindow.game_data : window.game_data;
    if (gd && gd.village && gd.village.points) {
      return Math.max(1, Math.floor(parseInt(gd.village.points) * 0.01));
    }
    return 25;
  }

  function calculateFake() {
    var fakeType = document.getElementById('ds-fg-faketype').value;
    var minPop = getCalcMinPop();
    var avail = getAvailableUnits();

    var units = { spear: 0, sword: 0, axe: 0, archer: 0, spy: 0, light: 0, heavy: 0, ram: 0, catapult: 0 };
    var usedPop = 0;

    if (fakeType === 'ram') {
      if (avail.ram > 0) { units.ram = 1; usedPop += POP_COST.ram; }
    } else if (fakeType === 'cata') {
      if (avail.catapult > 0) { units.catapult = 1; usedPop += POP_COST.catapult; }
    } else if (fakeType === 'hcata') {
      var cataCount = Math.min(5, avail.catapult);
      if (cataCount > 0) { units.catapult = cataCount; usedPop += POP_COST.catapult * cataCount; }
    }

    var remaining = minPop - usedPop;
    if (remaining > 0) {
      for (var f = 0; f < FILL_ORDER.length; f++) {
        var unit = FILL_ORDER[f];
        var cost = POP_COST[unit] || 1;
        var max = avail[unit] || 0;
        var count = Math.min(Math.floor(remaining / cost), max);
        if (count > 0) {
          units[unit] = count;
          remaining -= count * cost;
        }
        if (remaining <= 0) break;
      }
    }

    var displayParts = [];
    for (var u in units) {
      state.unitConfig[u] = units[u];
      var gameInp = document.querySelector('input[name="' + u + '"]');
      if (gameInp && units[u] > 0) gameInp.value = units[u];
      if (units[u] > 0) displayParts.push(units[u] + 'x ' + (UNIT_LABELS[u] || u));
    }
    saveConfig();
    var disp = document.getElementById('ds-fg-units-display');
    if (disp) disp.innerHTML = '<b>Fake:</b> ' + displayParts.join(', ') + ' <span style="color:#888;">(' + minPop + ' Pop)</span>';
  }

  function saveConfig() {
    localStorage.setItem('dsFakeGenConfig', JSON.stringify({
      unitConfig: state.unitConfig,
      attackMode: state.attackMode,
      delayMs: state.delayMs,
      targetsText: state.targetsText || '',
      autoSend: state.autoSend
    }));
  }

  function parseTargets(text) {
    var coords = [];
    text.split('\n').forEach(function (line) {
      line = line.trim();
      if (!line) return;
      var m = line.match(/(\d{1,3})\s*[|\s]\s*(\d{1,3})/);
      if (m) coords.push({ x: m[1], y: m[2], orig: line });
    });
    return coords;
  }

  function createUI() {
    if (document.getElementById('ds-fakegen')) return;
    var panel = document.createElement('div');
    panel.id = 'ds-fakegen';
    var topPos = (window.DSUI?.position?.getNextTop('fakeGenerator') || 150) + 'px';
    panel.style.cssText = 'position:fixed;top:' + topPos + ';right:20px;z-index:9999;background:#f9f9f9;padding:12px;border:1px solid #ccc;border-radius:8px;box-shadow:0 0 5px rgba(0,0,0,.2);font-family:Verdana,sans-serif;font-size:12px;min-width:300px;max-width:340px;color:#333;max-height:80vh;overflow-y:auto;';

    var html = '';
    html += '<div style="font-weight:bold;font-size:14px;margin-bottom:6px;border-bottom:1px solid #ddd;padding-bottom:4px;">Fake-Generator</div>';

    html += '<div style="margin-bottom:4px;">';
    html += '<label style="font-weight:bold;font-size:11px;">Ziel-Koordinaten (eine pro Zeile)</label>';
    html += '<textarea id="ds-fg-targets" style="width:100%;height:60px;font-size:11px;margin-top:2px;box-sizing:border-box;">' + (state.targetsText || '') + '</textarea>';
    html += '</div>';

    html += '<div id="ds-fg-units-display" style="margin-bottom:4px;font-size:11px;color:#555;min-height:16px;"></div>';

    html += '<div style="margin-bottom:6px;padding:6px;border:1px solid #ddd;border-radius:4px;background:#f5f5f5;">';
    html += '<div style="font-size:11px;font-weight:bold;margin-bottom:4px;">Fake-Berechnung</div>';
    html += '<div style="margin-bottom:4px;display:flex;align-items:center;gap:6px;">';
    html += '<label style="font-size:11px;">Typ:</label>';
    html += '<select id="ds-fg-faketype" style="font-size:11px;">';
    html += '<option value="ram">1 Ramme + F\u00fcllung</option>';
    html += '<option value="cata">1 Kata + F\u00fcllung</option>';
    html += '<option value="hcata">5 Katas + F\u00fcllung</option>';
    html += '</select>';
    html += '</div>';
    html += '<button id="ds-fg-calc" style="width:100%;padding:4px;font-size:11px;font-weight:bold;cursor:pointer;background:#2196F3;color:#fff;border:none;border-radius:4px;">Calculate Fake</button>';
    html += '</div>';

    html += '<div style="margin-bottom:4px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">';
    html += '<label style="font-size:11px;">Modus:</label>';
    html += '<select id="ds-fg-mode" style="font-size:11px;">';
    html += '<option value="attack"' + (state.attackMode === 'attack' ? ' selected' : '') + '>Angriff</option>';
    html += '<option value="support"' + (state.attackMode === 'support' ? ' selected' : '') + '>Unterst\u00fctzung</option>';
    html += '</select>';
    html += '</div>';
    html += '<div style="margin-bottom:6px;display:flex;align-items:center;gap:6px;">';
    var asColor = state.autoSend ? '#4CAF50' : '#888';
    var asText = state.autoSend ? 'AN' : 'AUS';
    html += '<span style="font-size:11px;">Auto-Senden:</span>';
    html += '<button id="ds-fg-autosend" style="font-size:11px;padding:2px 10px;font-weight:bold;border:none;border-radius:4px;cursor:pointer;background:' + asColor + ';color:#fff;">' + asText + '</button>';
    html += '</div>';

    html += '<div id="ds-fg-progress" style="font-size:11px;color:#666;margin-bottom:4px;"></div>';

    html += '<div style="display:flex;gap:6px;">';
    html += '<button id="ds-fg-start" style="flex:1;padding:6px;font-weight:bold;cursor:pointer;background:#4CAF50;color:#fff;border:none;border-radius:4px;">Start</button>';
    html += '<button id="ds-fg-stop" style="flex:1;padding:6px;font-weight:bold;cursor:pointer;background:#f44336;color:#fff;border:none;border-radius:4px;" disabled>Stop</button>';
    html += '</div>';

    panel.innerHTML = html;
    document.body.appendChild(panel);
    if (window.DSUI?.position?.setPanelEl) window.DSUI.position.setPanelEl('fakeGenerator', panel);

    document.getElementById('ds-fg-start').addEventListener('click', startFaking);
    document.getElementById('ds-fg-stop').addEventListener('click', stopFaking);
    document.getElementById('ds-fg-autosend').addEventListener('click', toggleAutoSend);
    document.getElementById('ds-fg-calc').addEventListener('click', calculateFake);
  }

  function readForm() {
    state.targetsText = document.getElementById('ds-fg-targets').value;
    state.targets = parseTargets(state.targetsText);
    state.attackMode = document.getElementById('ds-fg-mode').value;
    saveConfig();
  }

  function toggleAutoSend() {
    state.autoSend = !state.autoSend;
    var btn = document.getElementById('ds-fg-autosend');
    if (btn) {
      btn.textContent = state.autoSend ? 'AN' : 'AUS';
      btn.style.background = state.autoSend ? '#4CAF50' : '#888';
    }
    saveConfig();
    if (state.autoSend && pendingConfirm) {
      clickConfirmAndContinue();
    }
  }

  function clickConfirmAndContinue() {
    var btn = document.getElementById('troop_confirm_submit');
    if (!btn) {
      btn = document.querySelector('input[value="Senden"], button[type="submit"], .btn-send, [data-action="send"]');
    }
    if (!btn) return false;
    btn.disabled = false;
    if (guardAction) guardAction(function(){ btn.click(); });
    else btn.click();
    return true;
  }

  function updateProgress() {
    var el = document.getElementById('ds-fg-progress');
    if (!el) return;
    if (state.finished) {
      el.innerHTML = '<span style="color:#4CAF50;">Fertig! ' + state.currentIndex + '/' + state.targets.length + ' gesendet</span>';
    } else if (state.running) {
      var extra = '';
      if (pendingConfirm) {
        extra = state.autoSend ? ' (best\u00e4tige...)' : ' (klicke Senden oder Auto-Senden AN)';
      }
      el.innerHTML = 'Sende ' + (state.currentIndex + 1) + '/' + state.targets.length + extra;
    } else {
      el.innerHTML = state.targets.length + ' Ziele geladen';
    }
  }

  function saveSession() {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({
        targets: state.targets,
        unitConfig: state.unitConfig,
        attackMode: state.attackMode,
        delayMs: state.delayMs,
        autoSend: state.autoSend,
        running: true,
        currentIndex: state.currentIndex
      }));
    } catch (e) {}
  }

  function clearSession() {
    try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {}
  }

  function doAttack(index) {
    if (!state.running || index >= state.targets.length) {
      finishRun();
      return;
    }

    var xInp = document.querySelector('input[name="x"]');
    var yInp = document.querySelector('input[name="y"]');
    if (!xInp || !yInp) {
      setTimeout(function () { doAttack(index); }, 500);
      return;
    }

    var t = state.targets[index];
    state.currentIndex = index;
    pendingConfirm = false;
    updateProgress();

    xInp.value = t.x;
    yInp.value = t.y;

    for (var u in state.unitConfig) {
      var amt = state.unitConfig[u];
      var inp = document.querySelector('input[name="' + u + '"]');
      if (inp && amt > 0) inp.value = amt;
    }

    // Save session so we can resume after page reload
    saveSession();

    // Click action button
    setTimeout(function () {
      var isAttack = state.attackMode === 'attack';
      var btnId = isAttack ? 'target_attack' : 'target_support';
      var btn = document.getElementById(btnId);
      if (!btn) btn = document.querySelector('button[value="' + (isAttack ? 'attack' : 'support') + '"]');
      if (btn) {
        if (guardAction) guardAction(function(){ btn.click(); });
        else btn.click();
        // Schedule resume after page reload
        // If no reload happens within 5s, try observer-based flow
        setTimeout(function () {
          if (state.running) {
            var cb = document.getElementById('troop_confirm_submit');
            if (cb) handleConfirm(cb, index);
          }
        }, 2000);
      } else {
        setTimeout(function () { doAttack(index); }, 500);
      }
    }, 300);
  }

  function handleConfirm(btn, index) {
    if (!state.autoSend) {
      pendingConfirm = true;
      updateProgress();
      return;
    }
    pendingConfirm = true;
    updateProgress();
    btn.disabled = false;
    if (guardAction) guardAction(function(){ btn.click(); });
    else btn.click();
    pendingConfirm = false;
    state.currentIndex = index + 1;
    saveSession();
    updateProgress();
  }

  function finishRun() {
    state.finished = true;
    state.running = false;
    pendingConfirm = false;
    clearSession();
    var startBtn = document.getElementById('ds-fg-start');
    var stopBtn = document.getElementById('ds-fg-stop');
    if (startBtn) startBtn.disabled = false;
    if (stopBtn) stopBtn.disabled = true;
    updateProgress();
  }

  function startFaking() {
    readForm();
    if (state.targets.length === 0) return;
    state.running = true;
    state.finished = false;
    state.currentIndex = 0;
    pendingConfirm = false;
    document.getElementById('ds-fg-start').disabled = true;
    document.getElementById('ds-fg-stop').disabled = false;
    doAttack(0);
  }

  function stopFaking() {
    state.running = false;
    pendingConfirm = false;
    clearSession();
    if (state.observer) state.observer.disconnect();
    var startBtn = document.getElementById('ds-fg-start');
    var stopBtn = document.getElementById('ds-fg-stop');
    if (startBtn) startBtn.disabled = false;
    if (stopBtn) stopBtn.disabled = true;
    updateProgress();
  }

  function resumeFromSession() {
    try {
      var data = JSON.parse(sessionStorage.getItem(SESSION_KEY));
      if (!data || !data.running) return false;
      state.targets = data.targets || [];
      state.unitConfig = data.unitConfig || state.unitConfig;
      state.attackMode = data.attackMode || 'attack';
      state.delayMs = data.delayMs || 3000;
      state.autoSend = typeof data.autoSend !== 'undefined' ? data.autoSend : true;
      state.currentIndex = data.currentIndex || 0;
      state.running = true;
      state.finished = false;

      // Confirm page: click the confirm button, session stays for next round
      var cb = document.getElementById('troop_confirm_submit');
      if (cb) {
        document.getElementById('ds-fg-start').disabled = true;
        document.getElementById('ds-fg-stop').disabled = false;
        handleConfirm(cb, state.currentIndex);
        return true;
      }

      // Place screen: continue with next target after delay
      var xInp = document.querySelector('input[name="x"]');
      if (xInp) {
        document.getElementById('ds-fg-start').disabled = true;
        document.getElementById('ds-fg-stop').disabled = false;
        updateProgress();
        setTimeout(function () {
          if (state.running) doAttack(state.currentIndex);
        }, 500);
        return true;
      }

      clearSession();
      state.running = false;
      return false;
    } catch (e) {
      clearSession();
      return false;
    }
  }

  function init() {
    createUI();
    if (!resumeFromSession()) {
      updateProgress();
    }
  }

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
