/*
 * NARUČI DOMAĆE — ADMIN RUNTIME
 * Version: 1.0.0
 * Updated: 2026-11-18
 * Description: Composes the authenticated Workspace context and module registry while preserving the NDAdmin public API.
 */
import { createAdminContext } from './admin-context.js';
import { createAdminModuleRegistry } from './admin-module-registry.js';

export function createAdminRuntime({ window, document, version = 'V1.1.0' }) {
  if (!window || !document) {
    throw new TypeError('ADMIN Runtime захтева постојећи browser контекст.');
  }

  const registry = createAdminModuleRegistry();
  let core = null;
  let started = false;

  function start(existingCore) {
    core = createAdminContext(existingCore);
    started = true;

    registry.register('tour-workspace', {
      title: 'Оперативни простор туре',
      version: 'existing-inline-core',
      getState: () => core.getState()
    });

    const productPanel = window.NDProductProcurementPanel;
    if (productPanel && typeof productPanel.open === 'function') {
      registry.register('procurement-product-panel', {
        title: 'Product Panel',
        version: 'existing-module',
        open: (productId) => productPanel.open(productId),
        close: () => productPanel.close()
      });
    }

    document.documentElement.dataset.ndAdminVersion = version;
    document.documentElement.dataset.ndAdminReady = 'true';

    document.dispatchEvent(new window.CustomEvent('nd:admin-ready', {
      detail: {
        version,
        modules: registry.listModules()
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
    const module = registry.getModule(id);
    if (!module || typeof module.open !== 'function') {
      throw new Error('ADMIN модул није доступан: ' + id);
    }
    return module.open(...args);
  }

  return Object.freeze({
    version,
    register: registry.register,
    start,
    getContext,
    getState,
    getModule: registry.getModule,
    listModules: registry.listModules,
    request,
    openModule,
    isReady: () => started
  });
}
