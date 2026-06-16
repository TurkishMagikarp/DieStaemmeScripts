(function () {
  'use strict';
  if (window.__dsCaptchaSolverLoaded) return;
  window.__dsCaptchaSolverLoaded = true;

  var solving = false;
  var CHECK_INTERVAL_MS = 3000;
  var RELOAD_COOLDOWN_MS = 12000;
  var lastInteractionTs = Date.now();
  var lastReloadTs = 0;

  var PRE_STAGE_SELECTORS = [
    '#bot-icon',
    '.bot-icon',
    'img[src*="bot-icon"]',
    'img[src*="character"]',
    'div[class*="bot"]:not(.bot-protection-row):not(.bot-protection-blur)',
    'a[href*="bot_check"]',
    'div[onclick*="bot"]',
    '#content_value div:has(img[src*="bot"])',
    '.bot_start',
    '#bot_start',
    'div[id*="bot"]:not([id*="protect"])',
  ];

  function clickPreStage() {
    for (var i = 0; i < PRE_STAGE_SELECTORS.length; i++) {
      try {
        var el = document.querySelector(PRE_STAGE_SELECTORS[i]);
        if (el && el.offsetParent !== null) {
          el.click();
          lastInteractionTs = Date.now();
          console.log('[CaptchaSolver] Pre-Stage Männchen geklickt.');
          return true;
        }
      } catch (e) {}
    }
    return false;
  }

  function clickStartButton() {
    var selectors = [
      '.bot-protection-blur button',
      '.bot-protection-blur a',
      '.bot-protection-blur input[type="submit"]',
      '.bot-protection-row a.btn.btn-default',
      '.bot-protection-row a.btn-default',
      '.bot-protection-row button',
      '.bot-protection-row input[type="submit"]',
      'td.bot-protection-row a.btn.btn-default',
      'td.bot-protection-row a.btn-default',
    ];
    for (var i = 0; i < selectors.length; i++) {
      try {
        var el = document.querySelector(selectors[i]);
        if (el && el.offsetParent !== null) {
          el.click();
          lastInteractionTs = Date.now();
          console.log('[CaptchaSolver] "Beginne Bot-Schutz" geklickt.');
          return true;
        }
      } catch (e) {}
    }
    var all = document.querySelectorAll(
      '.bot-protection-blur button, .bot-protection-blur a, .bot-protection-blur input[type="submit"], ' +
      '.bot-protection-row button, .bot-protection-row a, .bot-protection-row input[type="submit"], ' +
      'td.bot-protection-row button, td.bot-protection-row a, td.bot-protection-row input[type="submit"]'
    );
    for (var i = 0; i < all.length; i++) {
      if (all[i].offsetParent !== null) {
        var txt = (all[i].textContent || all[i].value || '').trim().toLowerCase();
        if (txt.indexOf('beginne bot-schutz') !== -1 || txt.indexOf('bot-schutz-pr') !== -1 || all[i].closest('.bot-protection-row')) {
          all[i].click();
          lastInteractionTs = Date.now();
          console.log('[CaptchaSolver] Start-Button (Bot-Schutz) geklickt.');
          return true;
        }
      }
    }
    return false;
  }

  async function attemptSolve() {
    if (solving) return;
    solving = true;
    try {
      if (clickPreStage()) {
        await new Promise(function (r) { setTimeout(r, 500); });
        solving = false;
        return;
      }

      if (document.querySelector('.bot-protection-blur, .bot-protection-row, td.bot-protection-row')) {
        if (clickStartButton()) {
          await new Promise(function (r) { setTimeout(r, 1500); });
          solving = false;
          return;
        }
      }
      maybeReloadForBotGuard();
    } catch (e) {
      console.error('[CaptchaSolver] Fehler:', e);
    } finally {
      solving = false;
    }
  }

  function maybeReloadForBotGuard() {
    try {
      var bg = window.DS_BotGuard;
      if (!bg || !bg.isActive || !bg.isActive()) return;
      var now = Date.now();
      if (now - lastReloadTs < RELOAD_COOLDOWN_MS) return;
      if (now - lastInteractionTs < RELOAD_COOLDOWN_MS) return;
      var hasCandidate = !!document.querySelector(
        '#bot-icon, .bot-icon, .bot-protection-blur button, .bot-protection-blur a, .bot-protection-row a, .bot-protection-row button, td.bot-protection-row a, td.bot-protection-row button'
      );
      if (hasCandidate) return;
      lastReloadTs = now;
      console.log('[CaptchaSolver] Bot-Schutz aktiv ohne Button -> Seite wird neu geladen.');
      var u = new URL(location.href);
      u.searchParams.set('_ds_captcha_cb', String(now));
      location.assign(u.toString());
    } catch (e) {}
  }

  var preStageObserver = null;

  function startPreStageWatcher() {
    if (preStageObserver) return;
    var throttle = 0;
    var clickCount = 0;
    preStageObserver = new MutationObserver(function () {
      var now = Date.now();
      if (now - throttle < CHECK_INTERVAL_MS) return;
      throttle = now;
      if (solving) return;
      if (clickPreStage()) {
        clickCount++;
        if (clickCount >= 3) {
          preStageObserver.disconnect();
          preStageObserver = null;
        }
      }
    });
    preStageObserver.observe(document.body, { childList: true, subtree: true });
  }

  function startDomWatcher() {
    if (domCheckInterval) return;
    domCheckInterval = setInterval(function () {
      if (solving) return;
      attemptSolve();
    }, CHECK_INTERVAL_MS);
  }

  var domCheckInterval = null;

  function hookBotGuard() {
    var bg = window.DS_BotGuard;
    if (!bg || !bg.onChange) { setTimeout(hookBotGuard, 500); return; }
    bg.onChange(function (active) { if (active) setTimeout(function () { attemptSolve(); }, 600); });
    if (bg.isActive()) setTimeout(function () { attemptSolve(); }, 600);
    startDomWatcher();
    console.log('[CaptchaSolver] BotGuard-Hook aktiv.');
  }

  function init() {
    startPreStageWatcher();
    clickPreStage();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hookBotGuard);
    else hookBotGuard();
  }
  init();
})();
