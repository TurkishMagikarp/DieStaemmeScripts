(function () {
  'use strict';
  if (window.__dsCaptchaSolverLoaded) return;
  window.__dsCaptchaSolverLoaded = true;

  var SETTINGS_KEY = 'dsToolsUserSettings';

  var solving = false;

  async function readSettingsFromGM() {
    try { if (typeof GM !== 'undefined' && GM.getValue) return await GM.getValue(SETTINGS_KEY, {}); } catch {}
    try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch {}
    return {};
  }

  function getApiKey() {
    try { var s = window.DS_USER_SETTINGS || {}; return s.captchaApiKey || ''; } catch { return ''; }
  }

  async function getApiKeyAsync() {
    var key = getApiKey();
    if (key) return key;
    var settings = await readSettingsFromGM();
    return settings.captchaApiKey || '';
  }

  function isEnabled() {
    try { var s = window.DS_USER_SETTINGS || {}; return s.captchaSolverEnabled !== false; } catch { return true; }
  }

  function gmRequest(method, url, data) {
    return new Promise(function (resolve, reject) {
      if (typeof GM_xmlhttpRequest === 'function') {
        GM_xmlhttpRequest({
          method: method,
          url: url,
          data: data || null,
          headers: data ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {},
          onload: function (r) { resolve(r.responseText); },
          onerror: reject,
          ontimeout: function () { reject(new Error('timeout')); },
          timeout: 30000,
        });
      } else {
        fetch(url, { method: method, body: data, mode: 'no-cors' }).then(function (r) { return r.text(); }).then(resolve).catch(reject);
      }
    });
  }

  async function poll2captcha(apiKey, captchaId) {
    for (var i = 0; i < 90; i++) {
      await new Promise(function (r) { setTimeout(r, 3000); });
      var text = await gmRequest('GET', 'https://2captcha.com/res.php?key=' + encodeURIComponent(apiKey) + '&action=get&id=' + encodeURIComponent(captchaId) + '&json=1');
      var d = JSON.parse(text);
      if (d.status === 1) return d.request;
      if (d.request && d.request !== 'CAPCHA_NOT_READY') { console.error('[CaptchaSolver] 2captcha error:', d.request); return null; }
    }
    return null;
  }

  async function solveImgCaptcha(apiKey, img) {
    var resp = await fetch(img.src, { credentials: 'include' });
    var blob = await resp.blob();
    var base64 = await new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onloadend = function () { resolve(r.result.split(',')[1]); };
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
    var body = 'method=base64&key=' + encodeURIComponent(apiKey) + '&body=' + encodeURIComponent(base64) + '&json=1';
    var text = await gmRequest('POST', 'https://2captcha.com/in.php', body);
    var d = JSON.parse(text);
    if (d.status !== 1) { console.error('[CaptchaSolver] Upload failed:', d.error || d.request); return null; }
    return await poll2captcha(apiKey, d.request);
  }

  async function solveRecaptcha(apiKey, sitekey) {
    var pageUrl = location.href.split('?')[0] + '?' + location.search.slice(1);
    var body = 'method=userrecaptcha&key=' + encodeURIComponent(apiKey) + '&googlekey=' + encodeURIComponent(sitekey) + '&pageurl=' + encodeURIComponent(pageUrl) + '&json=1';
    var text = await gmRequest('POST', 'https://2captcha.com/in.php', body);
    var d = JSON.parse(text);
    if (d.status !== 1) { console.error('[CaptchaSolver] reCAPTCHA upload failed:', d.error || d.request); return null; }
    return await poll2captcha(apiKey, d.request);
  }

  function clickCheckbox() {
    var selectors = [
      '.bot-protection-row .recaptcha-checkbox',
      '.bot-protection-row iframe[src*="recaptcha"]',
      '.bot-protection-row button:first-child',
      '.bot-protection-row a',
      '#content_value .captcha button',
      '.captcha button',
    ];
    for (var i = 0; i < selectors.length; i++) {
      var el = document.querySelector(selectors[i]);
      if (el) { el.click(); console.log('[CaptchaSolver] Checkbox geklickt'); return true; }
    }
    return false;
  }

  function findSitekey() {
    var gc = document.querySelector('.g-recaptcha');
    if (gc) {
      var sk = gc.getAttribute('data-sitekey');
      if (sk) return sk;
    }
    var iframe = document.querySelector('iframe[src*="recaptcha"]');
    if (iframe) {
      var m = iframe.src.match(/[?&]k=([^&]+)/);
      if (m) return m[1];
    }
    return null;
  }

  function injectRecaptchaToken(token) {
    var ta = document.getElementById('g-recaptcha-response');
    if (ta) {
      ta.innerHTML = token;
      ta.value = token;
    }
    var forms = document.querySelectorAll('form');
    for (var i = 0; i < forms.length; i++) {
      var inp = forms[i].querySelector('input[name="g-recaptcha-response"]');
      if (inp) { inp.value = token; }
    }
    try {
      if (window.___grecaptcha_cfg) {
        for (var id in window.___grecaptcha_cfg.closed) {
          var c = window.___grecaptcha_cfg.closed[id];
          if (c && typeof c.callback === 'function') c.callback(token);
        }
      }
    } catch (e) {}
  }

  async function attemptSolve() {
    if (solving) return;
    if (!isEnabled()) return;
    var apiKey = await getApiKeyAsync();
    if (!apiKey) {
      console.log('[CaptchaSolver] Kein 2captcha API-Key konfiguriert.');
      return;
    }
    solving = true;
    try {
      // Phase 1: reCAPTCHA (Bildauswahl)
      var sitekey = findSitekey();
      if (sitekey) {
        console.log('[CaptchaSolver] reCAPTCHA erkannt, sende an 2captcha...');
        var token = await solveRecaptcha(apiKey, sitekey);
        if (token) {
          injectRecaptchaToken(token);
          await new Promise(function (r) { setTimeout(r, 300 + Math.random() * 300); });
          var btn = document.querySelector('.bot-protection-row button[type="submit"], .bot-protection-row input[type="submit"], #content_value .captcha button, .captcha button');
          if (btn) { btn.disabled = false; btn.click(); }
          console.log('[CaptchaSolver] reCAPTCHA gelöst!');
        } else {
          console.warn('[CaptchaSolver] reCAPTCHA Lösung fehlgeschlagen.');
        }
        return;
      }

      // Phase 2: Text-Captcha (Bild + Eingabefeld)
      var img = document.querySelector('.bot-protection-row img[src*="captcha"], .bot-protection-row img[src*="bot"], #content_value .captcha img, .captcha img');
      var input = document.querySelector('.bot-protection-row input[type="text"], .bot-protection-row input[name="captcha"], #content_value .captcha input, .captcha input[type="text"]');
      var submit = document.querySelector('.bot-protection-row button[type="submit"], .bot-protection-row input[type="submit"], #content_value .captcha button, .captcha button');
      if (img && input && submit) {
        if (!img.complete || img.naturalWidth === 0) await new Promise(function (r) { img.onload = r; img.onerror = r; setTimeout(r, 5000); });
        console.log('[CaptchaSolver] Text-Captcha erkannt, sende an 2captcha...');
        var result = await solveImgCaptcha(apiKey, img);
        if (result) {
          input.value = result;
          await new Promise(function (r) { setTimeout(r, 200 + Math.random() * 300); });
          submit.disabled = false;
          submit.click();
          console.log('[CaptchaSolver] Text-Captcha gelöst!');
        } else {
          console.warn('[CaptchaSolver] Text-Captcha fehlgeschlagen.');
        }
        return;
      }

      // Phase 3: Einfacher Klick (keine Bildauswahl, kein Input)
      var protection = document.querySelector('.bot-protection-row, #content_value .captcha, .captcha');
      if (protection && !protection.querySelector('input[type="text"], input[type="email"], input[type="password"], input[name="captcha"], img[src*="captcha"], .g-recaptcha, iframe[src*="recaptcha"]')) {
        console.log('[CaptchaSolver] Einfacher Klick reicht...');
        clickCheckbox();
      }
    } catch (e) {
      console.error('[CaptchaSolver] Fehler:', e);
    } finally {
      solving = false;
    }
  }

  var domCheckInterval = null;

  function startDomWatcher() {
    if (domCheckInterval) return;
    domCheckInterval = setInterval(function () {
      if (solving || !isEnabled()) return;
      var bg = window.DS_BotGuard;
      if (bg && bg.isActive && bg.isActive()) attemptSolve();
    }, 2000);
  }

  function hookBotGuard() {
    var bg = window.DS_BotGuard;
    if (!bg || !bg.onChange) { setTimeout(hookBotGuard, 500); return; }
    bg.onChange(function (active) { if (active) setTimeout(function () { attemptSolve(); }, 600); });
    if (bg.isActive()) setTimeout(function () { attemptSolve(); }, 600);
    startDomWatcher();
    console.log('[CaptchaSolver] BotGuard-Hook aktiv.');
  }

  async function testApiKey() {
    var key = await getApiKeyAsync();
    if (!key) { console.warn('[CaptchaSolver] Kein API-Key.'); return; }
    try {
      var text = await gmRequest('GET', 'https://2captcha.com/res.php?key=' + encodeURIComponent(key) + '&action=getbalance&json=1');
      var d = JSON.parse(text);
      if (d.status === 1) console.log('[CaptchaSolver] API-Key VALIDE. Guthaben: ' + d.request + ' USDC');
      else console.error('[CaptchaSolver] API-Key UNGÜLTIG:', d.request);
    } catch (e) { console.error('[CaptchaSolver] Fehler:', e); }
  }

  async function testFullFlow() {
    var key = await getApiKeyAsync();
    if (!key) { console.warn('[CaptchaSolver] Kein API-Key.'); return; }
    console.log('[CaptchaSolver] Starte Text-Captcha Test...');
    try {
      var c = document.createElement('canvas');
      c.width = 200; c.height = 60;
      var ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 200, 60);
      ctx.font = '30px Arial'; ctx.fillStyle = '#333';
      ctx.fillText('test42', 40, 42);
      var base64 = c.toDataURL('image/png').split(',')[1];
      var body = 'method=base64&key=' + encodeURIComponent(key) + '&body=' + encodeURIComponent(base64) + '&json=1';
      var text = await gmRequest('POST', 'https://2captcha.com/in.php', body);
      var d = JSON.parse(text);
      if (d.status !== 1) { console.error('[CaptchaSolver] Upload failed:', d.error || d.request); return; }
      var result = await poll2captcha(key, d.request);
      if (result) console.log('[CaptchaSolver] Test BESTANDEN! 2captcha:', result);
      else console.error('[CaptchaSolver] Test FEHLGESCHLAGEN.');
    } catch (e) { console.error('[CaptchaSolver] Fehler:', e); }
  }

  var pageWin = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  pageWin.DSTools = pageWin.DSTools || {};
  pageWin.DSTools.testCaptchaSolver = testApiKey;
  pageWin.DSTools.testFullFlow = testFullFlow;
  pageWin.DSTools.triggerCaptchaSolve = attemptSolve;

  function init() {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hookBotGuard);
    else hookBotGuard();
  }
  init();
})();
