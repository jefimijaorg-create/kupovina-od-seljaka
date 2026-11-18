/*
 * NARUČI DOMAĆE — PROCUREMENT CALCULATIONS
 * Version: 1.2.0
 * Updated: 2026-11-18
 * Description: Builds per-packaging totals from requested, confirmed and collected stages; legacy allocation counts remain technical-only.
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
    if (!demandMap.has(key)) {
      demandMap.set(key, {
        productId: row.product_id, variantId: row.variant_id, packages: 0,
        packageSize: null, packageUnit: null, totalQuantity: 0,
        valid: true, sourceRows: 0, invalidRows: 0
      });
    }

    const demand = demandMap.get(key);
    const product = productById.get(String(row.product_id));
    const variant = variantById.get(String(row.variant_id));
    if (!product?.name || !variant || String(variant.product_id) !== String(row.product_id) || variant.is_active === false) {
      demand.valid = false;
    }

    const count = Number(row.package_count);
    const size = Number(row.package_size);
    const unit = String(row.package_unit ?? '').trim();
    const validRow = Number.isInteger(count) && count >= 0 && Number.isFinite(size) && size > 0 && !!unit;
    demand.sourceRows += 1;

    if (!validRow) {
      demand.valid = false;
      demand.invalidRows += 1;
      continue;
    }

    if (demand.packageSize === null) {
      demand.packageSize = size;
      demand.packageUnit = unit;
    } else if (demand.packageSize !== size || demand.packageUnit !== unit) {
      demand.valid = false;
      demand.invalidRows += 1;
      continue;
    }

    demand.packages += count;
    demand.totalQuantity += count * size;
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

export function buildProcurementPackagingSummary({ demands = [], allocations = [] } = {}) {
  const allocationMap = new Map();
  for (const row of allocations) {
    const key = String(row.product_id) + '::' + String(row.variant_id);
    if (!allocationMap.has(key)) allocationMap.set(key, []);
    allocationMap.get(key).push(row);
  }

  const groups = new Map();
  for (const demand of demands) {
    if (!demand?.valid) continue;
    const size = Number(demand.packageSize);
    const unit = String(demand.packageUnit ?? '').trim();
    if (!Number.isFinite(size) || size <= 0 || !unit) continue;

    const groupKey = JSON.stringify([String(demand.productId), size, unit]);
    if (!groups.has(groupKey)) {
      groups.set(groupKey, {
        productId: demand.productId, packageSize: size, packageUnit: unit,
        neededPackages: 0, totalQuantity: 0, assignedPackages: 0, orderedPackages: 0,
        sentPackages: 0, confirmedPackages: 0, collectedPackages: 0,
        remainingPackages: 0, overRequestedPackages: 0,
        statusMismatchRows: 0, variants: []
      });
    }

    const rows = allocationMap.get(String(demand.productId) + '::' + String(demand.variantId)) || [];
    const assigned = rows.reduce((sum, row) => sum + toNumber(row.broj_pakovanja), 0);
    const ordered = rows.reduce((sum, row) => sum + toNumber(row.naruceno_pakovanja), 0);
    const sent = rows.reduce((sum, row) => {
      return sum + (row.viber_status === 'sent' || row.viber_status === 'replied'
        ? toNumber(row.naruceno_pakovanja) : 0);
    }, 0);
    const confirmed = rows.reduce((sum, row) => sum + toNumber(row.potvrdjeno_pakovanja), 0);
    const collected = rows.reduce((sum, row) => sum + toNumber(row.preuzeto_pakovanja), 0);
    const statusMismatchRows = rows.filter((row) => {
      const hasSentStatus = row.viber_status === 'sent' || row.viber_status === 'replied';
      return hasSentStatus ? toNumber(row.naruceno_pakovanja) !== toNumber(row.broj_pakovanja) : toNumber(row.naruceno_pakovanja) > 0;
    }).length;
    const remaining = Math.max(0, demand.packages - ordered);
    const overRequested = Math.max(0, ordered - demand.packages);

    const group = groups.get(groupKey);
    group.neededPackages += demand.packages;
    group.totalQuantity += demand.packages * size;
    group.assignedPackages += assigned;
    group.orderedPackages += ordered;
    group.sentPackages += sent;
    group.confirmedPackages += confirmed;
    group.collectedPackages += collected;
    group.remainingPackages += remaining;
    group.overRequestedPackages += overRequested;
    group.statusMismatchRows += statusMismatchRows;
    group.variants.push({
      productId: demand.productId, variantId: demand.variantId,
      packageSize: size, packageUnit: unit, neededPackages: demand.packages,
      totalQuantity: demand.packages * size, assignedPackages: assigned, orderedPackages: ordered,
      sentPackages: sent,
      confirmedPackages: confirmed, collectedPackages: collected,
      remainingPackages: remaining, overRequestedPackages: overRequested,
      statusMismatchRows
    });
  }

  return [...groups.values()].sort((a, b) =>
    String(a.productId).localeCompare(String(b.productId)) ||
    a.packageSize - b.packageSize ||
    a.packageUnit.localeCompare(b.packageUnit, 'sr'));
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
  const requested = allocations.filter((row) => String(row.product_id) === String(demand.productId) && String(row.variant_id) === String(demand.variantId) && (excludingFarmId === null || String(row.gazdinstvo_id) !== String(excludingFarmId))).reduce((sum, row) => sum + toNumber(row.naruceno_pakovanja), 0);
  return Math.max(0, demand.packages - requested);
}
