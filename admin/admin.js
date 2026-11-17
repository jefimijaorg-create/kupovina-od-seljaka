/* NARUCI DOMACE · ADMIN CENTRAL RUNTIME
 * Verzija: V1.0.0
 * Primena: centralno povezivanje postojećih ADMIN podataka i funkcionalnih modula.
 * Ne pravi novu Supabase konekciju, ne kopira podatke i ne menja poslovnu logiku.
 */
(function (window, document) {
  'use strict';

  const VERSION = 'V1.0.0';
  const modules = new Map();
  let core = null;
  let started = false;

  function register(id, definition) {
    if (!id || typeof id !== 'string' || !definition || typeof definition !== 'object') {
      throw new TypeError('ADMIN модул мора имати назив и дефиницију.');
    }
    modules.set(id, Object.freeze({ id, ...definition }));
    return modules.get(id);
  }

  function getModule(id) {
    return modules.get(id) || null;
  }

  function listModules() {
    return Array.from(modules.values()).map((module) => ({
      id: module.id,
      title: module.title || module.id,
      version: module.version || null
    }));
  }

  function start(existingCore) {
    if (!existingCore || existingCore.authenticated !== true ||
        typeof existingCore.getState !== 'function' ||
        typeof existingCore.api !== 'function') {
      throw new Error('ADMIN језгро није потврдило приступ или није проследило постојеће податке.');
    }

    core = existingCore;
    started = true;

    register('tour-workspace', {
      title: 'Оперативни простор туре',
      version: 'existing-inline-core',
      getState: () => core.getState()
    });

    const productPanel = window.NDProductProcurementPanel;
    if (productPanel && typeof productPanel.open === 'function') {
      register('procurement-product-panel', {
        title: 'Product Panel',
        version: 'existing-module',
        open: (productId) => productPanel.open(productId),
        close: () => productPanel.close()
      });
    }

    document.documentElement.dataset.ndAdminVersion = VERSION;
    document.documentElement.dataset.ndAdminReady = 'true';

    document.dispatchEvent(new CustomEvent('nd:admin-ready', {
      detail: {
        version: VERSION,
        modules: listModules()
      }
    }));

    return true;
  }

  function getContext() {
    return started ? core : null;
  }

  function getState() {
    return started ? core.getState() : null;
  }

  function request(path, options) {
    if (!started) {
      return Promise.reject(new Error('ADMIN језгро још није покренуто.'));
    }
    return core.api(path, options || {});
  }

  function openModule(id, ...args) {
    const module = getModule(id);
    if (!module || typeof module.open !== 'function') {
      throw new Error('ADMIN модул није доступан: ' + id);
    }
    return module.open(...args);
  }

  window.NDAdmin = Object.freeze({
    version: VERSION,
    register,
    start,
    getContext,
    getState,
    getModule,
    listModules,
    request,
    openModule,
    isReady: () => started
  });
})(window, document);
