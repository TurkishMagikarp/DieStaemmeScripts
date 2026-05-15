(function () {
  'use strict';
  if (window.__DSUIPosLoaded) return;
  window.__DSUIPosLoaded = true;

  var registry = [];
  var BASE_TOP = 80;
  var GAP = 8;
  var ESTIMATE = 120;

  function calcNextTop() {
    var top = BASE_TOP;
    for (var i = 0; i < registry.length; i++) {
      var r = registry[i];
      if (r.el && r.el.offsetHeight > 0) {
        top += r.el.offsetHeight + GAP;
      } else {
        top += ESTIMATE + GAP;
      }
    }
    return top;
  }

  function getNextTop(panelId) {
    for (var i = 0; i < registry.length; i++) {
      if (registry[i].id === panelId) return registry[i].top;
    }
    var top = calcNextTop();
    registry.push({ id: panelId, top: top, el: null });
    return top;
  }

  function setPanelEl(panelId, el) {
    for (var i = 0; i < registry.length; i++) {
      if (registry[i].id === panelId) {
        registry[i].el = el;
        return;
      }
    }
    var top = calcNextTop();
    registry.push({ id: panelId, top: top, el: el });
  }

  function releaseSlot(panelId) {
    for (var i = 0; i < registry.length; i++) {
      if (registry[i].id === panelId) {
        registry.splice(i, 1);
        return;
      }
    }
  }

  window.DSUI = window.DSUI || {};
  window.DSUI.position = {
    getNextTop: getNextTop,
    setPanelEl: setPanelEl,
    releaseSlot: releaseSlot,
  };
})();
