/*
 * NARUČI DOMAĆE — ADMIN CONTEXT
 * Version: 1.0.0
 * Updated: 2026-11-18
 * Description: Validates and exposes the existing authenticated Workspace context without creating another Supabase client.
 */
export function createAdminContext(existingCore) {
  if (!existingCore || existingCore.authenticated !== true ||
      !existingCore.client || typeof existingCore.client.from !== 'function' ||
      typeof existingCore.getState !== 'function' ||
      typeof existingCore.api !== 'function') {
    throw new Error('ADMIN језгро није потврдило приступ или није проследило постојећи Supabase контекст.');
  }

  return Object.freeze({
    authenticated: true,
    client: existingCore.client,
    getState: () => existingCore.getState(),
    api: (rpcName, options = {}) => existingCore.api(rpcName, options || {})
  });
}
