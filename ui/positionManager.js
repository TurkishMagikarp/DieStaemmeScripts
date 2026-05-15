(function () {
  'use strict';
  if (window.__DSUIPosLoaded) return;
  window.__DSUIPosLoaded = true;

  const slots = {};
  let currentTop = 80;
  const GAP = 8;
  const PANEL_ESTIMATE = 120;

  function getNextTop(panelId) {
    if (slots[panelId]) return slots[panelId];
    const top = currentTop;
    slots[panelId] = top;
    currentTop += PANEL_ESTIMATE + GAP;
    return top;
  }

  function releaseSlot(panelId) {
    delete slots[panelId];
  }

  function resetSlot(panelId, panelHeight) {
    if (!slots[panelId]) return;
    const oldTop = slots[panelId];
    const newTop = oldTop;
    slots[panelId] = newTop;
  }

  window.DSUI = window.DSUI || {};
  window.DSUI.position = {
    getNextTop: getNextTop,
    releaseSlot: releaseSlot,
    resetSlot: resetSlot,
  };
})();
