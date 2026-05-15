(function () {
  'use strict';
  if (window.__dsCaptchaSolverLoaded) return;
  window.__dsCaptchaSolverLoaded = true;

  const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

  const SETTINGS_KEY = 'dsToolsUserSettings';

  const SELECTORS_CAPTCHA_IMG = [
    '.bot-protection-row img[src*="captcha"]',
    '.bot-protection-row img[src*="bot"]',
    '#content_value .captcha img',
    '.captcha img',
  ];
  const SELECTORS_CAPTCHA_INPUT = [
    '.bot-protection-row input[type="text"]',
    '.bot-protection-row input[name="captcha"]',
    '#content_value .captcha input',
    '.captcha input[type="text"]',
  ];
  const SELECTORS_CAPTCHA_SUBMIT = [
    '.bot-protection-row button[type="submit"]',
    '.bot-protection-row input[type="submit"]',
    '#content_value .captcha button',
    '.captcha button',
  ];

  let solving = false;

  function getApiKey() {
    try {
      const s = win.DS_USER_SETTINGS || {};
      return s.captchaApiKey || '';
    } catch { return ''; }
  }

  function isEnabled() {
    try {
      const s = win.DS_USER_SETTINGS || {};
      return s.captchaSolverEnabled !== false;
    } catch { return true; }
  }

  function findCaptchaImage() {
    for (const sel of SELECTORS_CAPTCHA_IMG) {
      const img = document.querySelector(sel);
      if (img && img.src) return img;
    }
    return null;
  }

  function findCaptchaInput() {
    for (const sel of SELECTORS_CAPTCHA_INPUT) {
      const inp = document.querySelector(sel);
      if (inp) return inp;
    }
    return null;
  }

  function findCaptchaSubmit() {
    for (const sel of SELECTORS_CAPTCHA_SUBMIT) {
      const btn = document.querySelector(sel);
      if (btn) return btn;
    }
    return null;
  }

  async function imgToBase64ViaFetch(img) {
    const resp = await fetch(img.src, { credentials: 'include' });
    const blob = await resp.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result;
        resolve(dataUrl.split(',')[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  async function solveWith2Captcha(base64, apiKey) {
    const formData = new FormData();
    formData.append('method', 'base64');
    formData.append('key', apiKey);
    formData.append('body', base64);
    formData.append('json', '1');

    let resp;
    try {
      resp = await fetch('https://2captcha.com/in.php', {
        method: 'POST',
        body: formData,
      });
      const data = await resp.json();
      if (data.status !== 1) {
        console.error('[CaptchaSolver] 2captcha upload failed:', data.error || data.request);
        return null;
      }
      const captchaId = data.request;

      for (let i = 0; i < 90; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const pollResp = await fetch(
          `https://2captcha.com/res.php?key=${apiKey}&action=get&id=${captchaId}&json=1`
        );
        const pollData = await pollResp.json();
        if (pollData.status === 1) return pollData.request;
        if (pollData.request && pollData.request !== 'CAPCHA_NOT_READY') {
          console.error('[CaptchaSolver] 2captcha error:', pollData.request);
          return null;
        }
      }
      console.error('[CaptchaSolver] 2captcha timeout');
      return null;
    } catch (e) {
      console.error('[CaptchaSolver] 2captcha network error:', e);
      return null;
    }
  }

  async function attemptSolve() {
    if (solving) return;
    if (!isEnabled()) return;

    const apiKey = getApiKey();
    if (!apiKey) {
      console.log('[CaptchaSolver] Kein 2captcha API-Key konfiguriert → Settings-Seite offen (screen=dstools)');
      return;
    }

    const img = findCaptchaImage();
    const input = findCaptchaInput();
    const submit = findCaptchaSubmit();

    if (!img || !input || !submit) {
      console.log('[CaptchaSolver] Captcha-Elemente nicht vollständig gefunden.');
      return;
    }

    solving = true;
    console.log('[CaptchaSolver] Captcha erkannt, sende an 2captcha...');

    try {
      if (!img.complete || img.naturalWidth === 0) {
        await new Promise((resolve) => {
          img.onload = resolve;
          img.onerror = resolve;
          setTimeout(resolve, 5000);
        });
      }

      const base64 = await imgToBase64ViaFetch(img);
      const result = await solveWith2Captcha(base64, apiKey);

      if (result) {
        input.value = result;
        await new Promise((r) => setTimeout(r, 200 + Math.random() * 300));
        submit.disabled = false;
        submit.click();
        console.log('[CaptchaSolver] Captcha gelöst und abgesendet!');
      } else {
        console.warn('[CaptchaSolver] Konnte Captcha nicht lösen.');
      }
    } catch (e) {
      console.error('[CaptchaSolver] Fehler:', e);
    } finally {
      solving = false;
    }
  }

  let domCheckInterval = null;

  function startDomWatcher() {
    if (domCheckInterval) return;
    domCheckInterval = setInterval(() => {
      if (solving) return;
      if (!isEnabled()) return;
      const bg = win.DS_BotGuard;
      if (bg && bg.isActive && bg.isActive()) {
        attemptSolve();
      }
    }, 2000);
  }

  function hookBotGuard() {
    const bg = win.DS_BotGuard;
    if (!bg || !bg.onChange) {
      setTimeout(hookBotGuard, 500);
      return;
    }

    bg.onChange((active) => {
      if (active) setTimeout(() => attemptSolve(), 600);
    });

    if (bg.isActive()) {
      setTimeout(() => attemptSolve(), 600);
    }

    startDomWatcher();
    console.log('[CaptchaSolver] BotGuard-Hook aktiv.');
  }

  function init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', hookBotGuard);
    } else {
      hookBotGuard();
    }
  }

  init();
})();
