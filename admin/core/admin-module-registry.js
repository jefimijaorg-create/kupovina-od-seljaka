/*
 * NARUČI DOMAĆE — ADMIN MODULE REGISTRY
 * Version: 1.0.0
 * Updated: 2026-11-18
 * Description: Keeps Workspace module registration and discovery in one isolated ES6 component.
 */
export function createAdminModuleRegistry() {
  const modules = new Map();

  function register(id, definition) {
    if (!id || typeof id !== 'string' ||
        !definition || typeof definition !== 'object' || Array.isArray(definition)) {
      throw new TypeError('ADMIN модул мора имати назив и дефиницију.');
    }

    const module = Object.freeze({ id, ...definition });
    modules.set(id, module);
    return module;
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

  return Object.freeze({ register, getModule, listModules });
}
