(function () {
  'use strict';
  if (window.__DSUIPosLoaded) return;
  window.__DSUIPosLoaded = true;

  var registry = [];
  var BASE_TOP = 80;
  var GAP = 8;
  var ESTIMATE = 120;

  function recalculateAll() {
    var top = BASE_TOP;
    for (var i = 0; i < registry.length; i++) {
      var r = registry[i];
      r.top = top;
      if (r.el) {
        r.el.style.top = top + 'px';
        top += (r.el.offsetHeight || ESTIMATE) + GAP;
      } else {
        top += ESTIMATE + GAP;
      }
    }
  }

  function getNextTop(panelId) {
    for (var i = 0; i < registry.length; i++) {
      if (registry[i].id === panelId) return registry[i].top;
    }
    var top = BASE_TOP;
    for (var i = 0; i < registry.length; i++) {
      var r = registry[i];
      top += (r.el && r.el.offsetHeight > 0 ? r.el.offsetHeight : ESTIMATE) + GAP;
    }
    registry.push({ id: panelId, top: top, el: null });
    return top;
  }

  function setPanelEl(panelId, el) {
    for (var i = 0; i < registry.length; i++) {
      if (registry[i].id === panelId) {
        registry[i].el = el;
        recalculateAll();
        return;
      }
    }
    var top = BASE_TOP;
    for (var i = 0; i < registry.length; i++) {
      var r = registry[i];
      top += (r.el && r.el.offsetHeight > 0 ? r.el.offsetHeight : ESTIMATE) + GAP;
    }
    registry.push({ id: panelId, top: top, el: el });
    el.style.top = top + 'px';
  }

  function releaseSlot(panelId) {
    for (var i = 0; i < registry.length; i++) {
      if (registry[i].id === panelId) {
        registry.splice(i, 1);
        recalculateAll();
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
