// ==UserScript Module==
// SpeckMichs Baba Farmer – Modulversion für DS-Tools (place-screen)

(function () {
  "use strict";

  // --- Kontext-Gate: nur normaler Versammlungsplatz, keine Scavenge-/Call-Ansicht ---
  const sp = new URL(location.href).searchParams;
  const screen = sp.get("screen") || "";
  const mode = sp.get("mode") || "";

  if (screen !== "place") return;
  if (mode === "scavenge" || mode === "scavenge_mass" || mode === "call")
    return;

  // --- Context-Gate ...

  // --- BOT-PROTECTION ---
  const { gateInterval, gateTimeout, guardAction } = window.DSGuards || {};
  if (!guardAction) {
    console.warn("[BabaFarmer] DSGuards fehlen – Bot-Protection deaktiviert.");
  }

  // --- Hilfsfunktion: GM-XMLHttpRequest kompatibel holen ---
  const gmXhr =
    typeof GM_xmlhttpRequest === "function"
      ? GM_xmlhttpRequest
      : typeof GM !== "undefined" && typeof GM.xmlHttpRequest === "function"
      ? GM.xmlHttpRequest
      : null;

  if (!gmXhr) {
    console.error(
      "[BabaFarmer] GM_xmlhttpRequest / GM.xmlHttpRequest nicht verfügbar – Modul beendet."
    );
    return;
  }

  // --- Minimal-Ersatz für waitForKeyElements (einmalig pro Selector) ---
  function waitForKeyElements(selector, handler) {
    const existing = document.querySelectorAll(selector);
    if (existing.length) {
      existing.forEach((el) => handler(el)); // DOM-Element
      return;
    }

    const obs = new MutationObserver(() => {
      const elems = document.querySelectorAll(selector);
      if (!elems.length) return;
      elems.forEach((el) => handler(el)); // DOM-Element
      obs.disconnect();
    });

    obs.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  // --- Original-Variablen / State (Keys unverändert gelassen) ---
  let unitsToSend = JSON.parse(localStorage.getItem("unitsToSend")) || {
    spear: 0,
    sword: 0,
    axe: 0,
    light: 0,
  };

  let radius = parseInt(localStorage.getItem("farmingRadius")) || 5;
  let farmingIntervalDelay =
    parseInt(localStorage.getItem("farmingDelay")) || 250;

  let farmingEnabled = JSON.parse(localStorage.getItem("farmingEnabled"));
  if (farmingEnabled === null) farmingEnabled = false;
  let farmingInterval = null;

  function getWorld() {
    const hostname = window.location.hostname;
    const subdomain = hostname.split(".")[0];
    return subdomain;
  }

  function createUnitsInputPanel() {
    const container = document.createElement("div");
    container.style.position = "fixed";
    var topVal = (window.DSUI?.position?.getNextTop('babaFarmerUnits') || 150) + 'px';
    container.style.top = topVal;
    container.style.right = "20px";
    container.style.zIndex = 9999;
    container.style.backgroundColor = "#f9f9f9";
    container.style.padding = "10px";
    container.style.border = "1px solid #ccc";
    container.style.borderRadius = "8px";
    container.style.boxShadow = "0 0 5px rgba(0,0,0,0.2)";
    container.style.fontSize = "14px";
    container.style.maxHeight = "400px";
    container.style.overflowY = "auto";

    const title = document.createElement("div");
    title.textContent = "Units to Send";
    title.style.fontWeight = "bold";
    title.style.marginBottom = "6px";
    container.appendChild(title);

    for (const unit in unitsToSend) {
      const row = document.createElement("div");
      row.style.marginBottom = "4px";

      const label = document.createElement("label");
      label.textContent = unit;
      label.style.marginRight = "5px";

      const input = document.createElement("input");
      input.type = "number";
      input.value = unitsToSend[unit];
      input.style.width = "50px";
      input.min = 0;

      input.addEventListener("change", () => {
        unitsToSend[unit] = parseInt(input.value) || 0;
        localStorage.setItem("unitsToSend", JSON.stringify(unitsToSend));
      });

      row.appendChild(label);
      row.appendChild(input);
      container.appendChild(row);
    }

    const radiusTitle = document.createElement("div");
    radiusTitle.textContent = "Farm Radius";
    radiusTitle.style.marginTop = "10px";
    radiusTitle.style.fontWeight = "bold";
    container.appendChild(radiusTitle);

    const radiusInput = document.createElement("input");
    radiusInput.type = "number";
    radiusInput.value = radius;
    radiusInput.min = 1;
    radiusInput.style.width = "50px";
    radiusInput.style.marginTop = "5px";

    radiusInput.addEventListener("change", () => {
      radius = parseInt(radiusInput.value) || 5;
      localStorage.setItem("farmingRadius", radius.toString());
    });

    container.appendChild(radiusInput);

    const delayTitle = document.createElement("div");
    delayTitle.textContent = "Delay";
    delayTitle.style.marginTop = "10px";
    delayTitle.style.fontWeight = "bold";
    container.appendChild(delayTitle);

    const delayInput = document.createElement("input");
    delayInput.type = "number";
    delayInput.value = farmingIntervalDelay;
    delayInput.min = 1;
    delayInput.style.width = "50px";
    delayInput.style.marginTop = "5px";

    delayInput.addEventListener("change", () => {
      farmingIntervalDelay = parseInt(delayInput.value) || 250;
      localStorage.setItem("farmingDelay", farmingIntervalDelay.toString());
    });

    container.appendChild(delayInput);

  document.body.appendChild(container);
  if (window.DSUI?.position?.setPanelEl) window.DSUI.position.setPanelEl('babaFarmerUnits', container);
  }

  function createToggleButton() {
    const toggleButton = document.createElement("button");
    toggleButton.textContent = farmingEnabled ? "Farming: ON" : "Farming: OFF";
    toggleButton.style.position = "fixed";
    var btnTop = (window.DSUI?.position?.getNextTop('babaFarmerToggle') || 100) + 'px';
    toggleButton.style.top = btnTop;
    toggleButton.style.right = "20px";
    toggleButton.style.zIndex = 9999;
    toggleButton.style.padding = "8px 12px";
    toggleButton.style.backgroundColor = farmingEnabled ? "#4CAF50" : "#f44336";
    toggleButton.style.color = "white";
    toggleButton.style.border = "none";
    toggleButton.style.borderRadius = "5px";
    toggleButton.style.cursor = "pointer";
    toggleButton.style.fontWeight = "bold";

    toggleButton.addEventListener("click", () => {
      farmingEnabled = !farmingEnabled;
      localStorage.setItem("farmingEnabled", JSON.stringify(farmingEnabled));
      toggleButton.textContent = farmingEnabled
        ? "Farming: ON"
        : "Farming: OFF";
      toggleButton.style.backgroundColor = farmingEnabled
        ? "#4CAF50"
        : "#f44336";

      if (farmingEnabled) {
        startFarming();
      } else {
        stopFarming();
      }
    });

    document.body.appendChild(toggleButton);
    if (window.DSUI?.position?.setPanelEl) window.DSUI.position.setPanelEl('babaFarmerToggle', toggleButton);
  }

  function observeConfirmButton() {
    const observer = new MutationObserver(async (mutations, obs) => {
      const button = document.getElementById("troop_confirm_submit");
      if (!button) return;

      console.log("[BabaFarmer] Auto-confirm send.");

      if (guardAction) await guardAction("baba_confirm_click");
      button.click();

      obs.disconnect();
    });

    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  // --- Initialisierung nach DOM-Ready ---
  function init() {
    if (window.__babaFarmerInitialized) return;
    window.__babaFarmerInitialized = true;

    createToggleButton();
    createUnitsInputPanel();

    if (farmingEnabled) {
      startFarming();
      observeConfirmButton();
    }
  }

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
