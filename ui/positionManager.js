(function () {
  'use strict';
  if (window.__DSUIPosLoaded) return;
  window.__DSUIPosLoaded = true;

  function getContainer() {
    var c = document.getElementById('ds-panel-container');
    if (c) return c;
    c = document.createElement('div');
    c.id = 'ds-panel-container';
    c.style.cssText = 'position:fixed;top:80px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:8px;align-items:flex-end;';
    document.body.appendChild(c);
    return c;
  }

  function appendPanel(el) {
    var c = getContainer();
    el.style.position = 'relative';
    el.style.top = 'auto';
    el.style.right = 'auto';
    el.style.left = 'auto';
    el.style.bottom = 'auto';
    c.appendChild(el);
  }

  function getNextTop() {
    var top = 80;
    var c = document.getElementById('ds-panel-container');
    if (c) {
      var children = c.children;
      for (var i = 0; i < children.length; i++) {
        top += (children[i].offsetHeight || 120) + 8;
      }
    }
    return top;
  }

  window.DSUI = window.DSUI || {};
  window.DSUI.position = {
    appendPanel: appendPanel,
    getNextTop: getNextTop,
  };
})();
