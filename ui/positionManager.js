(function () {
  'use strict';
  if (window.__DSUIPosLoaded) return;
  window.__DSUIPosLoaded = true;

  if (document.getElementById('ds-panel-container')) return;

  var c = document.createElement('div');
  c.id = 'ds-panel-container';
  c.style.cssText = 'position:fixed;top:80px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:8px;align-items:flex-end;';
  document.body.appendChild(c);

  window.DSUI = window.DSUI || {};
  window.DSUI.position = window.DSUI.position || {};
  window.DSUI.position.appendPanel = function (el) {
    el.style.position = 'relative';
    el.style.top = 'auto';
    el.style.right = 'auto';
    el.style.left = 'auto';
    el.style.bottom = 'auto';
    c.appendChild(el);
  };
})();
