/*
 * NARUČI DOMAĆE — ADMIN CENTRAL BOOTSTRAP
 * Verzija: V1.1.0
 * Updated: 2026-11-18
 * Description: Loads the modular ES6 ADMIN runtime and preserves the existing window.NDAdmin integration point.
 */
(function (window, document) {
  'use strict';

  const VERSION = 'V1.1.0';
  const ready = import('./core/admin-runtime.js?v=1.0.0')
    .then(({ createAdminRuntime }) => {
      const runtime = createAdminRuntime({ window, document, version: VERSION });
      window.NDAdmin = runtime;
      return runtime;
    });

  window.NDAdmin = Object.freeze({
    version: VERSION,
    ready
  });
})(window, document);
