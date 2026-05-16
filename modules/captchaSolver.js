(function () {
  'use strict';
  if (window.__dsCaptchaSolverLoaded) return;
  window.__dsCaptchaSolverLoaded = true;

  var solving = false;

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
    ];
    for (var i = 0; i < selectors.length; i++) {
      try {
        var el = document.querySelector(selectors[i]);
        if (el && el.offsetParent !== null) {
          el.click();
          console.log('[CaptchaSolver] "Beginne Bot-Schutz" geklickt.');
          return true;
        }
      } catch (e) {}
    }
    var all = document.querySelectorAll('.bot-protection-blur button, .bot-protection-blur a, .bot-protection-blur input[type="submit"]');
    for (var i = 0; i < all.length; i++) {
      if (all[i].offsetParent !== null) { all[i].click(); console.log('[CaptchaSolver] Start-Button im Blur geklickt.'); return true; }
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

      if (document.querySelector('.bot-protection-blur')) {
        if (clickStartButton()) {
          await new Promise(function (r) { setTimeout(r, 1500); });
          solving = false;
          return;
        }
      }
    } catch (e) {
      console.error('[CaptchaSolver] Fehler:', e);
    } finally {
      solving = false;
    }
  }

  var preStageObserver = null;

  function startPreStageWatcher() {
    if (preStageObserver) return;
    var throttle = 0;
    preStageObserver = new MutationObserver(function () {
      var now = Date.now();
      if (now - throttle < 1000) return;
      throttle = now;
      if (solving) return;
      clickPreStage();
    });
    preStageObserver.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
  }

  function startDomWatcher() {
    if (domCheckInterval) return;
    domCheckInterval = setInterval(function () {
      if (solving) return;
      var bg = window.DS_BotGuard;
      if (bg && bg.isActive && bg.isActive()) attemptSolve();
    }, 2000);
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
