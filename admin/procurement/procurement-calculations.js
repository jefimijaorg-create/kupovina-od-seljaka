/*
 * NARUČI DOMAĆE — PROCUREMENT CALCULATIONS
 * Version: 1.0.0
 * Updated: 2026-11-18
 * Description: Pure procurement demand aggregation and allocation calculations; no UI, database access, or side effects.
 * Scope: Existing ADMIN Workspace only.
 */
const toNumber = (value) => { const number = Number(value); return Number.isFinite(number) ? number : 0; };

export function buildProcurementDemands({ items = [], products = [], variants = [] } = {}) {
  const productById = new Map(products.map((product) => [String(product.id), product]));
  const variantById = new Map(variants.map((variant) => [String(variant.id), variant]));
  const demandMap = new Map();
  for (const row of items) {
    if (!row.product_id || !row.variant_id) continue;
    const key = String(row.product_id) + '::' + String(row.variant_id);
    if (!demandMap.has(key)) demandMap.set(key, {
      productId: row.product_id, variantId: row.variant_id, packages: 0,
      packageSize: row.package_size, packageUnit: row.package_unit,
      totalQuantity: 0, valid: true, sourceRows: 0
    });
    const demand = demandMap.get(key);
    const product = productById.get(String(row.product_id));
    const variant = variantById.get(String(row.variant_id));
    if (!product?.name || !variant || String(variant.product_id) !== String(row.product_id) || variant.is_active === false) demand.valid = false;
    const count = Number(row.package_count), size = Number(row.package_size);
    if (!Number.isInteger(count) || count < 0 || !Number.isFinite(size) || size <= 0 || !row.package_unit) demand.valid = false;
    else { demand.packages += count; demand.totalQuantity += count * size; }
    if (Number(demand.packageSize) !== size || demand.packageUnit !== row.package_unit) demand.valid = false;
    demand.sourceRows += 1;
  }
  return [...demandMap.values()].sort((a, b) => {
    const productA = productById.get(String(a.productId)), productB = productById.get(String(b.productId));
    const variantA = variantById.get(String(a.variantId)), variantB = variantById.get(String(b.variantId));
    const nameA = productA?.name || '', nameB = productB?.name || '';
    const labelA = variantA?.name || variantA?.size_label || 'Варијанта није доступна';
    const labelB = variantB?.name || variantB?.size_label || 'Варијанта није доступна';
    return nameA.localeCompare(nameB, 'sr') || labelA.localeCompare(labelB, 'sr');
  });
}

export function sumAllocatedPackages({ allocations = [], productId, variantId, excludingFarmId = null } = {}) {
  return allocations.filter((row) =>
    String(row.product_id) === String(productId) &&
    String(row.variant_id) === String(variantId) &&
    (excludingFarmId === null || String(row.gazdinstvo_id) !== String(excludingFarmId)))
    .reduce((sum, row) => sum + toNumber(row.broj_pakovanja), 0);
}

export function calculateRemainingPackages({ demand, allocations = [], excludingFarmId = null } = {}) {
  if (!demand) return 0;
  const allocated = sumAllocatedPackages({ allocations, productId: demand.productId, variantId: demand.variantId, excludingFarmId });
  return Math.max(0, demand.packages - allocated);
}
