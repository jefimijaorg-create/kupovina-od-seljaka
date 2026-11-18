/*
 * NARUČI DOMAĆE — PROCUREMENT MANAGEMENT PANEL
 * Version: 1.3.0
 * Updated: 2026-11-18
 * Description: Adds packaging-first procurement overview with four-stage farm tracking.
 * Scope: Existing ADMIN Workspace + existing Supabase client; no parallel data store.
 */
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const num = (value) => { const n = Number(value); return Number.isFinite(n) ? n : 0; };
const fmt = (value) => num(value).toLocaleString('sr-RS', { maximumFractionDigits: 3 });
const fmtDateTime = (value) => value ? new Date(value).toLocaleString('sr-RS', { dateStyle: 'short', timeStyle: 'short' }) : 'није евидентирано';
async function copyText(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const field = document.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.style.position = 'fixed';
  field.style.opacity = '0';
  document.body.appendChild(field);
  field.select();
  const copied = document.execCommand('copy');
  field.remove();
  if (!copied) throw new Error('Clipboard API није доступан.');
}
const uniq = (values) => [...new Set(values.filter((value) => value !== null && value !== undefined && value !== ''))];
const unwrap = (result, label) => { if (result.error) throw new Error(label + ': ' + result.error.message); return result.data || []; };
const keyOf = (productId, variantId) => String(productId) + '::' + String(variantId);

export async function mountProcurementManagement({ root, core, tourId, onBack, initialProductId = null }) {
  const adminCore = window.NDAdmin?.getContext?.() || core;
  if (!root || !adminCore || adminCore.authenticated !== true || !adminCore.client || !tourId) {
    throw new Error('Недостаје потврђено NDAdmin језгро или ID туре.');
  }
  const role = adminCore.getState()?.role;
  if (!['admin', 'super_admin'].includes(role)) {
    throw new Error('Ваша ADMIN улога нема дозволу за управљање набавком. RLS правила нису заобиђена.');
  }

  const client = adminCore.client;
  const state = {
    tour: null, items: [], invalidSourceRows: 0, products: [], variants: [], offers: [], farms: [],
    allocations: [], demands: [], tab: 'products', selectedFarmId: '', selectedProductId: null, selectedVariantId: null,
    allocationDraft: {}, trackingDraft: {}, busy: false, disposed: false, token: 0,
    notice: '', noticeType: 'success',
    diagnostic: {
      tapToken: 0, clickSeen: false,
      pointer: 'Чека се додир на картици производа.',
      click: 'Клик још није регистрован.',
      modal: 'Прозор још није отворен.',
      error: ''
    }
  };

  root.innerHTML = '<section class="nd-procurement"><div class="nd-proc-loading">Учитавам потребе, активне понуде и набавну евиденцију…</div></section>';
  const shell = root.querySelector('.nd-procurement');

  function demandFor(productId, variantId) {
    return state.demands.find((item) => keyOf(item.productId, item.variantId) === keyOf(productId, variantId));
  }
  function farmFor(id) { return state.farms.find((farm) => String(farm.id) === String(id)); }
  function productFor(id) { return state.products.find((product) => String(product.id) === String(id)); }
  function variantFor(id) { return state.variants.find((variant) => String(variant.id) === String(id)); }
  function offersFor(productId, variantId) {
    return state.offers.filter((offer) => String(offer.product_id) === String(productId) &&
      String(offer.variant_id) === String(variantId) && offer.is_active === true);
  }
  function allocationsFor(productId, variantId) {
    return state.allocations.filter((row) => String(row.product_id) === String(productId) &&
      String(row.variant_id) === String(variantId));
  }
  function rowFor(farmId, productId, variantId) {
    return state.allocations.find((row) => String(row.gazdinstvo_id) === String(farmId) &&
      String(row.product_id) === String(productId) && String(row.variant_id) === String(variantId));
  }
  function assigned(productId, variantId) {
    return allocationsFor(productId, variantId).reduce((sum, row) => sum + num(row.broj_pakovanja), 0);
  }
  function remaining(productId, variantId, excludingFarmId = null) {
    const demand = demandFor(productId, variantId);
    if (!demand) return 0;
    const otherAssigned = allocationsFor(productId, variantId)
      .filter((row) => excludingFarmId === null || String(row.gazdinstvo_id) !== String(excludingFarmId))
      .reduce((sum, row) => sum + num(row.broj_pakovanja), 0);
    return Math.max(0, demand.packages - otherAssigned);
  }
  function formatVariant(demand) {
    const variant = variantFor(demand.variantId);
    return variant?.name || variant?.size_label || 'Варијанта није доступна';
  }
  function messageForFarm(farmId) {
    const farm = farmFor(farmId);
    const rows = state.allocations.filter((row) => String(row.gazdinstvo_id) === String(farmId) && num(row.broj_pakovanja) > 0);
    const lines = rows.map((row) => {
      const product = productFor(row.product_id);
      const variant = variantFor(row.variant_id);
      return '- ' + (product?.name || 'Назив производа није доступан') + ' — ' +
        (variant?.name || variant?.size_label || 'Варијанта') + ': ' + fmt(row.broj_pakovanja) + ' паковања';
    });
    return 'Поштовани' + (farm?.name ? ' ' + farm.name : '') + ',\n\n' +
      'Молимо вас да потврдите доступност следећих производа за туру #' + tourId + ':\n' +
      lines.join('\n') + '\n\nМолимо да нам јавите колико паковања можете да обезбедите.\nХвала!';
  }

  async function load() {
    const token = ++state.token;
    state.notice = '';
    const tourResult = await client.from('ture').select('id,naziv,status,datum').eq('id', tourId).maybeSingle();
    if (tourResult.error) throw new Error('Тура: ' + tourResult.error.message);
    if (!tourResult.data) throw new Error('Тура није пронађена или немате дозволу за читање.');
    state.tour = tourResult.data;

    const itemResult = await client.from('stavke_porudzbine')
      .select('id,product_id,variant_id,package_count,package_size,package_unit')
      .eq('tura_id', tourId);
    state.items = unwrap(itemResult, 'Ставке поруџбина');

    state.invalidSourceRows = state.items.filter((row) => !row.product_id || !row.variant_id).length;
    const productIds = uniq(state.items.map((row) => row.product_id));
    const variantIds = uniq(state.items.map((row) => row.variant_id));
    const [productsResult, variantsResult, allocationsResult] = await Promise.all([
      productIds.length ? client.from('products').select('id,name').in('id', productIds) : Promise.resolve({ data: [], error: null }),
      variantIds.length ? client.from('product_variants').select('id,product_id,name,size_label,unit,package_value,package_unit,is_active').in('id', variantIds) : Promise.resolve({ data: [], error: null }),
      client.from('tura_nabavka_dodele')
        .select('id,tura_id,product_id,variant_id,gazdinstvo_id,broj_pakovanja,nabavna_cena,naruceno,naruceno_pakovanja,potvrdjeno_pakovanja,preuzeto_pakovanja,viber_status,viber_poslato_at,potvrdjeno_at,updated_at')
        .eq('tura_id', tourId).order('id', { ascending: true })
    ]);
    state.products = unwrap(productsResult, 'Производи');
    state.variants = unwrap(variantsResult, 'Варијанте');
    state.allocations = unwrap(allocationsResult, 'Набавне расподеле');

    const demandMap = new Map();
    for (const row of state.items) {
      if (!row.product_id || !row.variant_id) continue;
      const key = keyOf(row.product_id, row.variant_id);
      if (!demandMap.has(key)) {
        demandMap.set(key, {
          productId: row.product_id, variantId: row.variant_id, packages: 0,
          packageSize: row.package_size, packageUnit: row.package_unit,
          totalQuantity: 0, valid: true, sourceRows: 0
        });
      }
      const demand = demandMap.get(key);
      const variant = variantFor(row.variant_id);
      if (!productFor(row.product_id)?.name || !variant || String(variant.product_id) !== String(row.product_id) || variant.is_active === false) demand.valid = false;
      const count = Number(row.package_count);
      const size = Number(row.package_size);
      if (!Number.isInteger(count) || count < 0 || !Number.isFinite(size) || size <= 0 || !row.package_unit) {
        demand.valid = false;
      } else {
        demand.packages += count;
        demand.totalQuantity += count * size;
      }
      if (Number(demand.packageSize) !== size || demand.packageUnit !== row.package_unit) demand.valid = false;
      demand.sourceRows += 1;
    }
    state.demands = [...demandMap.values()].sort((a, b) => {
      const an = productFor(a.productId)?.name || '';
      const bn = productFor(b.productId)?.name || '';
      return an.localeCompare(bn, 'sr') || formatVariant(a).localeCompare(formatVariant(b), 'sr');
    });

    const offerProductIds = uniq(state.demands.map((demand) => demand.productId));
    const offerResult = offerProductIds.length
      ? await client.from('product_offers').select('id,gazdinstvo_id,product_id,variant_id,purchase_price,is_active')
        .in('product_id', offerProductIds).eq('is_active', true)
      : { data: [], error: null };
    state.offers = unwrap(offerResult, 'Активне понуде');
    const relevantOffers = state.offers.filter((offer) =>
      state.demands.some((demand) => String(demand.productId) === String(offer.product_id) &&
        String(demand.variantId) === String(offer.variant_id)));
    const farmIds = uniq([...relevantOffers.map((offer) => offer.gazdinstvo_id), ...state.allocations.map((row) => row.gazdinstvo_id)]);
    const farmResult = farmIds.length
      ? await client.from('gazdinstva').select('id,name,phone').in('id', farmIds).order('name', { ascending: true })
      : { data: [], error: null };
    state.farms = unwrap(farmResult, 'Газдинства');

    if (token !== state.token || state.disposed) return;
    const offeredFarmIds = uniq(relevantOffers.map((offer) => offer.gazdinstvo_id));
    state.selectedFarmId = offeredFarmIds.some((id) => String(id) === String(state.selectedFarmId))
      ? state.selectedFarmId : (offeredFarmIds[0] ?? '');
    render();
  }

  function renderProducts() {
    if (!state.demands.length) return '<div class="nd-proc-empty">За ову туру нису пронађене ставке са product_id и variant_id.</div>' +
      (state.invalidSourceRows ? '<div class="nd-proc-warning">' + fmt(state.invalidSourceRows) + ' ставки нема product_id или variant_id и зато није укључено у набавку.</div>' : '');
    const groups = new Map();
    for (const demand of state.demands) {
      const product = productFor(demand.productId);
      const packageKey = String(demand.productId) + '|' + String(demand.packageSize ?? '') + '|' + String(demand.packageUnit ?? '');
      if (!groups.has(packageKey)) groups.set(packageKey, { productName: product?.name || 'Производ није доступан', packageSize: demand.packageSize, packageUnit: demand.packageUnit, demands: [] });
      groups.get(packageKey).demands.push(demand);
    }
    let html = '<div class="nd-proc-table-intro"><strong>Преглед набавке по производу и амбалажи</strong><span>Количине су исказане у паковањима. „Послато“ се рачуна тек када је Viber слање ручно потврђено за газдинство.</span></div>';
    if (state.invalidSourceRows) html += '<div class="nd-proc-warning">' + fmt(state.invalidSourceRows) + ' ставки нема product_id или variant_id и зато није укључено у набавку.</div>';
    for (const group of groups.values()) {
      const totals = group.demands.reduce((acc, demand) => {
        const rows = allocationsFor(demand.productId, demand.variantId);
        acc.needed += demand.packages;
        acc.assigned += rows.reduce((sum, row) => sum + num(row.broj_pakovanja), 0);
        acc.sent += rows.filter((row) => row.viber_status === 'sent' || row.viber_status === 'replied')
          .reduce((sum, row) => sum + num(row.broj_pakovanja), 0);
        acc.confirmed += rows.reduce((sum, row) => sum + num(row.potvrdjeno_pakovanja), 0);
        acc.collected += rows.reduce((sum, row) => sum + num(row.preuzeto_pakovanja), 0);
        return acc;
      }, { needed: 0, assigned: 0, sent: 0, confirmed: 0, collected: 0 });
      const unassigned = Math.max(0, totals.needed - totals.assigned);
      const rows = group.demands.map((demand) => {
        const allocationRows = allocationsFor(demand.productId, demand.variantId);
        const totalAssigned = allocationRows.reduce((sum, row) => sum + num(row.broj_pakovanja), 0);
        const totalSent = allocationRows.filter((row) => row.viber_status === 'sent' || row.viber_status === 'replied')
          .reduce((sum, row) => sum + num(row.broj_pakovanja), 0);
        const totalConfirmed = allocationRows.reduce((sum, row) => sum + num(row.potvrdjeno_pakovanja), 0);
        const totalCollected = allocationRows.reduce((sum, row) => sum + num(row.preuzeto_pakovanja), 0);
        const totalUnassigned = Math.max(0, demand.packages - totalAssigned);
        return '<tr>' +
          '<td><strong>' + esc(formatVariant(demand)) + '</strong><small>' + esc(demand.packageSize) + ' ' + esc(demand.packageUnit || '') + '</small></td>' +
          '<td class="nd-proc-number">' + fmt(demand.packages) + '</td>' +
          '<td class="nd-proc-stage"><b>' + fmt(totalAssigned) + '</b><small>Додељено</small></td>' +
          '<td class="nd-proc-stage"><b>' + fmt(totalUnassigned) + '</b><small>Нераспоређено</small></td>' +
          '<td class="nd-proc-stage"><b>' + fmt(totalSent) + '</b><small>Послато</small></td>' +
          '<td class="nd-proc-stage"><b>' + fmt(totalConfirmed) + '</b><small>Потврђено</small></td>' +
          '<td class="nd-proc-stage"><b>' + fmt(totalCollected) + '</b><small>Преузето</small></td>' +
          '<td><button type="button" class="nd-proc-row-action" data-open-product="' + esc(demand.productId) + '" data-open-variant="' + esc(demand.variantId) + '">Газдинства <span aria-hidden="true">→</span></button></td>' +
          '</tr>';
      }).join('');
      const packageLabel = group.packageSize === null || group.packageSize === undefined || group.packageSize === ''
        ? 'Амбалажа није наведена' : 'Амбалажа ' + String(group.packageSize) + ' ' + String(group.packageUnit || '');
      html += '<section class="nd-proc-package-group"><header><div><strong>' + esc(group.productName) + ' · ' + esc(packageLabel) + '</strong><small>' +
        fmt(group.demands.length) + (group.demands.length === 1 ? ' варијанта' : ' варијанте') + '</small></div>' +
        '<div class="nd-proc-package-totals"><span>Потребно <b>' + fmt(totals.needed) + '</b></span><span>Додељено <b>' + fmt(totals.assigned) + '</b></span><span>Нераспоређено <b>' + fmt(unassigned) + '</b></span></div></header>' +
        '<div class="nd-proc-table-wrap"><table class="nd-proc-table"><thead><tr><th>Варијанта</th><th>Потребно</th><th>Додељено</th><th>Нераспоређено</th><th>Послато</th><th>Потврђено</th><th>Преузето</th><th>Детаљи</th></tr></thead><tbody>' + rows + '</tbody></table></div></section>';
    }
    return html;
  }

  function renderAllocation(productId = null) {
    const demands = (productId === null ? state.demands : state.demands.filter((demand) => String(demand.productId) === String(productId)))
      .filter((demand) => state.selectedVariantId === null || String(demand.variantId) === String(state.selectedVariantId));
    const offeredFarmIds = uniq(state.offers.filter((offer) => demands.some((demand) =>
      String(demand.productId) === String(offer.product_id) && String(demand.variantId) === String(offer.variant_id)))
      .map((offer) => offer.gazdinstvo_id));
    if (!offeredFarmIds.length) return '<div class="nd-proc-empty">Нема активних понуда које одговарају производима и варијантама ове туре.</div>';
    const farm = farmFor(state.selectedFarmId);
    const eligible = demands.filter((demand) => demand.valid &&
      offersFor(demand.productId, demand.variantId).some((offer) => String(offer.gazdinstvo_id) === String(state.selectedFarmId)));
    let html = '<div class="nd-proc-form-head"><label for="ndProcFarmSelect">Изабери газдинство</label>' +
      '<select id="ndProcFarmSelect" data-farm-select>' +
      offeredFarmIds.map((id) => '<option value="' + esc(id) + '" ' + (String(id) === String(state.selectedFarmId) ? 'selected' : '') + '>' +
        esc(farmFor(id)?.name || 'Газдинство #' + id) + '</option>').join('') + '</select></div>';
    html += '<div class="nd-proc-farm-summary"><strong>' + esc(farm?.name || 'Изабрано газдинство') + '</strong><span>' +
      esc(farm?.phone || 'Телефон није наведен') + '</span></div>';
    if (!eligible.length) return html + '<div class="nd-proc-empty">Ово газдинство нема активну понуду за варијанте које су потребне овој тури.</div>';
    html += eligible.map((demand) => {
      const product = productFor(demand.productId);
      const existing = rowFor(state.selectedFarmId, demand.productId, demand.variantId);
      const current = existing ? num(existing.broj_pakovanja) : 0;
      const otherAssigned = allocationsFor(demand.productId, demand.variantId)
        .filter((row) => String(row.gazdinstvo_id) !== String(state.selectedFarmId))
        .reduce((sum, row) => sum + num(row.broj_pakovanja), 0);
      const maxForFarm = Math.max(0, demand.packages - otherAssigned);
      const uncovered = Math.max(0, demand.packages - otherAssigned - current);
      const draftKey = keyOf(demand.productId, demand.variantId);
      const draft = state.allocationDraft[draftKey];
      return '<article class="nd-proc-card nd-proc-allocation-card"><div class="nd-proc-card-head"><div><strong>' +
        esc(product?.name || 'Назив производа није доступан') + '</strong><small>' + esc(formatVariant(demand)) + '</small></div>' +
        '<span class="nd-proc-pill ' + (uncovered === 0 ? 'is-done' : 'is-open') + '">Непокривено за туру ' + fmt(uncovered) + '</span></div>' +
        '<div class="nd-proc-allocation-recap" aria-label="Рекапитулација расподеле">' +
        '<span><b>' + fmt(demand.packages) + '</b><small>Укупно потребно за туру</small></span>' +
        '<span><b>' + fmt(otherAssigned) + '</b><small>Додељено другим газдинствима</small></span>' +
        '<span><b>' + fmt(current) + '</b><small>Додељено овом газдинству</small></span>' +
        '<span><b>' + fmt(uncovered) + '</b><small>Преостало непокривено</small></span></div>' +
        '<div class="nd-proc-input-row"><label>Укупно паковања за ово газдинство</label><input type="number" min="0" max="' + maxForFarm + '" step="1" inputmode="numeric" data-allocation-count="' + esc(draftKey) +
        '" value="' + esc(draft ?? current) + '" aria-label="Укупна додељена паковања за ' + esc(product?.name || 'производ') + '"></div>' +
        '<small class="nd-proc-subline">Унеси нову укупну количину, не додатну. Максимум за ово газдинство: ' + fmt(maxForFarm) + ' паковања.</small>' +
        (existing ? '<small class="nd-proc-subline">Тренутно сачувано у бази: ' + fmt(current) + ' паковања</small>' : '') + '</article>';
    }).join('');
    html += '<button type="button" class="nd-proc-primary" data-action="save-allocation" ' + (state.busy ? 'disabled' : '') + '>' + (state.busy ? 'Чувам…' : 'Сачувај расподелу овог газдинства') + '</button>';
    return html;
  }

  function renderVariantFarmBreakdown() {
    const rows = allocationsFor(state.selectedProductId, state.selectedVariantId)
      .slice().sort((a, b) => String(farmFor(a.gazdinstvo_id)?.name || '').localeCompare(String(farmFor(b.gazdinstvo_id)?.name || ''), 'sr'));
    if (!rows.length) return '<section class="nd-proc-variant-farms"><header><strong>Праћење по газдинствима</strong></header><div class="nd-proc-empty">За ову варијанту још није додељено ниједно паковање.</div></section>';
    const body = rows.map((row) => {
      const farm = farmFor(row.gazdinstvo_id);
      const sent = row.viber_status === 'sent' || row.viber_status === 'replied' ? num(row.broj_pakovanja) : 0;
      const draft = state.trackingDraft[row.id] || {};
      return '<article class="nd-proc-variant-farm"><header><strong>' + esc(farm?.name || 'Газдинство #' + row.gazdinstvo_id) + '</strong><span class="nd-proc-pill ' + (sent > 0 ? 'is-done' : 'is-open') + '">' + (sent > 0 ? 'Захтев послат' : 'Чека слање') + '</span></header>' +
        '<div class="nd-proc-variant-stages"><span><b>' + fmt(row.broj_pakovanja) + '</b><small>Додељено</small></span><span><b>' + fmt(sent) + '</b><small>Послато</small></span><span><b>' + fmt(row.potvrdjeno_pakovanja) + '</b><small>Потврђено</small></span><span><b>' + fmt(row.preuzeto_pakovanja) + '</b><small>Преузето</small></span></div>' +
        '<div class="nd-proc-track-grid">' + trackingInput(row, draft, 'naruceno_pakovanja', 'Наручено од газдинства') +
        trackingInput(row, draft, 'potvrdjeno_pakovanja', 'Потврђено') + trackingInput(row, draft, 'preuzeto_pakovanja', 'Преузето') + '</div>' +
        '<small class="nd-proc-track-hint">„Наручено од газдинства“ је постојећа међуевиденција коју систем користи за контролу да потврђена количина не буде већа од наручене.</small>' +
        '<button type="button" class="nd-proc-secondary" data-action="save-tracking" data-row-id="' + esc(row.id) + '" ' + (state.busy ? 'disabled' : '') + '>Сачувај евиденцију</button></article>';
    }).join('');
    return '<section class="nd-proc-variant-farms"><header><strong>Праћење по газдинствима</strong><small>Само овај производ и ова амбалажа</small></header>' + body + '</section>';
  }

  function renderProductAllocationModal() {
    const product = productFor(state.selectedProductId);
    if (!product) return '';
    const productDemands = state.demands.filter((demand) => String(demand.productId) === String(state.selectedProductId) && (state.selectedVariantId === null || String(demand.variantId) === String(state.selectedVariantId)));
    const needed = productDemands.reduce((sum, demand) => sum + demand.packages, 0);
    const allocated = productDemands.reduce((sum, demand) => sum + assigned(demand.productId, demand.variantId), 0);
    const left = Math.max(0, needed - allocated);
    return '<div class="nd-proc-product-modal-backdrop" data-product-modal-backdrop>' +
      '<section class="nd-proc-product-modal" role="dialog" aria-modal="true" aria-labelledby="ndProcProductModalTitle">' +
      '<header class="nd-proc-product-modal-head"><div><small>РАСПОДЕЛА ПО ГАЗДИНСТВИМА</small>' +
      '<h2 id="ndProcProductModalTitle">' + esc(product.name || 'Производ') + '</h2>' +
      '<p>' + (state.selectedVariantId !== null ? 'Изабери газдинство за ову варијанту амбалаже.' : 'Изабери газдинство и расподели паковања по варијантама овог производа.') + '</p></div>' +
      '<button type="button" class="nd-proc-modal-close" data-action="close-product-modal" aria-label="Затвори форму">×</button></header>' +
      '<div class="nd-proc-modal-summary"><span><b>' + fmt(needed) + '</b><small>Потребно паковања</small></span>' +
      '<span><b>' + fmt(allocated) + '</b><small>Распоређено</small></span>' +
      '<span><b>' + fmt(left) + '</b><small>Преостало</small></span></div>' +
      '<div class="nd-proc-modal-body">' + (state.selectedVariantId !== null ? renderVariantFarmBreakdown() : '') + renderAllocation(state.selectedProductId) + '</div>' +
      '</section></div>';
  }

  function openProductAllocation(productId, variantId = null) {
    const productDemands = state.demands.filter((demand) => String(demand.productId) === String(productId) && (variantId === null || String(demand.variantId) === String(variantId)));
    if (!productDemands.length || !productFor(productId)) {
      state.diagnostic.modal = 'Форма није направљена: производ није пронађен у учитаним подацима.';
      state.diagnostic.error = 'Недостаје производ или његове ставке у подацима ове туре.';
      render();
      return;
    }
    const farmIds = uniq(state.offers.filter((offer) => productDemands.some((demand) =>
      String(demand.productId) === String(offer.product_id) && String(demand.variantId) === String(offer.variant_id)))
      .map((offer) => offer.gazdinstvo_id));
    state.selectedProductId = String(productId);
    state.selectedVariantId = variantId === null ? null : String(variantId);
    if (!farmIds.some((id) => String(id) === String(state.selectedFarmId))) state.selectedFarmId = farmIds[0] ?? '';
    state.allocationDraft = {};
    state.notice = '';
    state.diagnostic.modal = 'Функција за отварање форме је позвана.';
    state.diagnostic.error = '';
    render();
    if (shell.querySelector('.nd-proc-product-modal')) {
      state.diagnostic.modal = 'ПРОЗОР ЈЕ УСПЕШНО ПРИКАЗАН.';
    } else {
      state.diagnostic.modal = 'Клик је примљен, али HTML прозора није приказан.';
      state.diagnostic.error = 'Провера није пронашла елемент прозора у ADMIN приказу.';
    }
    render();
  }

  function renderFarmRecords() {
    const farmIds = uniq(state.allocations.map((row) => row.gazdinstvo_id));
    if (!farmIds.length) return '<div class="nd-proc-empty">Још нема сачуваних расподела по газдинствима.</div>';
    return farmIds.map((farmId) => {
      const farm = farmFor(farmId);
      const rows = state.allocations.filter((row) => String(row.gazdinstvo_id) === String(farmId));
      const total = rows.reduce((sum, row) => sum + num(row.broj_pakovanja), 0);
      const ordered = rows.reduce((sum, row) => sum + num(row.naruceno_pakovanja), 0);
      const confirmed = rows.reduce((sum, row) => sum + num(row.potvrdjeno_pakovanja), 0);
      const collected = rows.reduce((sum, row) => sum + num(row.preuzeto_pakovanja), 0);
      let html = '<section class="nd-proc-farm-record"><header><div><strong>' + esc(farm?.name || 'Газдинство #' + farmId) +
        '</strong><small>' + esc(farm?.phone || 'Телефон није наведен') + '</small></div></header>';
      html += '<div class="nd-proc-metrics"><span><b>' + fmt(total) + '</b><small>Додељено</small></span><span><b>' + fmt(ordered) +
        '</b><small>Наручено</small></span><span><b>' + fmt(confirmed) + '</b><small>Потврђено</small></span><span><b>' + fmt(collected) + '</b><small>Преузето</small></span></div>';
      html += '<div class="nd-proc-farm-lines">' + rows.map((row) => {
        const product = productFor(row.product_id), variant = variantFor(row.variant_id);
        const draft = state.trackingDraft[row.id] || {};
        return '<article class="nd-proc-track-row"><div class="nd-proc-track-title"><strong>' + esc(product?.name || 'Назив производа није доступан') +
          '</strong><small>' + esc(variant?.name || variant?.size_label || 'Варијанта није доступна') + '</small></div>' +
          '<div class="nd-proc-track-meta"><span>Додељено: ' + fmt(row.broj_pakovanja) + '</span><span>Преостало за потврду: ' +
          fmt(Math.max(0, num(row.naruceno_pakovanja) - num(row.potvrdjeno_pakovanja))) + '</span></div>' +
          '<div class="nd-proc-track-grid">' +
          trackingInput(row, draft, 'naruceno_pakovanja', 'Наручено') +
          trackingInput(row, draft, 'potvrdjeno_pakovanja', 'Потврђено') +
          trackingInput(row, draft, 'preuzeto_pakovanja', 'Преузето') + '</div>' +
          (row.naruceno === true && num(row.naruceno_pakovanja) === 0 ? '<div class="nd-proc-warning">Стара евиденција: наручено је означено, али број паковања није сачуван. Унеси стварну количину.</div>' : '') +
          '<button type="button" class="nd-proc-secondary" data-action="save-tracking" data-row-id="' + esc(row.id) + '" ' + (state.busy ? 'disabled' : '') + '>' +
          (state.busy ? 'Чувам…' : 'Сачувај количине') + '</button></article>';
      }).join('') + '</div></section>';
      return html;
    }).join('');
  }

  function renderViberRecords() {
    const farmIds = uniq(state.allocations.map((row) => row.gazdinstvo_id));
    if (!farmIds.length) return '<div class="nd-proc-empty">Viber комуникација ће бити доступна након прве расподеле по газдинству.</div>';
    return farmIds.map((farmId) => {
      const farm = farmFor(farmId);
      const rows = state.allocations.filter((row) => String(row.gazdinstvo_id) === String(farmId));
      const statuses = new Set(rows.map((row) => row.viber_status || 'not_sent'));
      const status = statuses.size > 1 ? 'Различити статуси по ставкама' :
        rows[0]?.viber_status === 'replied' ? 'Одговор примљен' :
        rows[0]?.viber_status === 'sent' ? 'Послато' : 'Није послато';
      const statusClass = statuses.has('replied') ? 'is-done' : statuses.has('sent') ? 'is-open' : '';
      const latestSent = rows.map((row) => row.viber_poslato_at).filter(Boolean).sort().at(-1);
      const latestReply = rows.map((row) => row.potvrdjeno_at).filter(Boolean).sort().at(-1);
      const lines = rows.filter((row) => num(row.broj_pakovanja) > 0).map((row) => {
        const product = productFor(row.product_id), variant = variantFor(row.variant_id);
        return '<li>' + esc(product?.name || 'Назив производа није доступан') + ' · ' +
          esc(variant?.name || variant?.size_label || 'Варијанта') + ': <strong>' + fmt(row.broj_pakovanja) + ' пак.</strong></li>';
      }).join('');
      return '<section class="nd-proc-farm-record nd-proc-viber-record"><header><div><strong>' +
        esc(farm?.name || 'Газдинство #' + farmId) + '</strong><small>' + esc(farm?.phone || 'Телефон није наведен') +
        '</small></div><span class="nd-proc-pill ' + statusClass + '">' + status + '</span></header>' +
        '<ul class="nd-proc-viber-lines">' + lines + '</ul>' +
        '<div class="nd-proc-track-meta"><span>Слање: ' + esc(fmtDateTime(latestSent)) +
        '</span><span>Одговор: ' + esc(fmtDateTime(latestReply)) + '</span></div>' +
        '<div class="nd-proc-message"><label>Јединствена Viber порука за газдинство</label><textarea readonly rows="5">' +
        esc(messageForFarm(farmId)) + '</textarea><div class="nd-proc-actions">' +
        '<button type="button" class="nd-proc-secondary" data-action="copy-message" data-farm-id="' + esc(farmId) + '">Копирај поруку</button>' +
        (farm?.phone ? '<button type="button" class="nd-proc-secondary" data-action="open-viber" data-farm-id="' + esc(farmId) + '" ' +
          (state.busy ? 'disabled' : '') + '>Отвори Viber</button>' : '') +
        '<button type="button" class="nd-proc-secondary" data-action="mark-sent" data-farm-id="' + esc(farmId) + '" ' +
          (state.busy ? 'disabled' : '') + '>Потврди слање</button>' +
        '<button type="button" class="nd-proc-secondary" data-action="mark-replied" data-farm-id="' + esc(farmId) + '" ' +
          (state.busy ? 'disabled' : '') + '>Евидентирај одговор</button></div>' +
        '<small>Копирање или отварање Viber-а не мења статус. Статус се мења само ручном потврдом.</small></div></section>';
    }).join('');
  }

  function trackingInput(row, draft, field, label) {
    const value = draft[field] ?? row[field] ?? 0;
    const maxValue = field === 'naruceno_pakovanja' ? num(row.broj_pakovanja) : field === 'potvrdjeno_pakovanja' ? Math.min(num(row.broj_pakovanja), num(draft.naruceno_pakovanja ?? row.naruceno_pakovanja)) : Math.max(num(row.preuzeto_pakovanja), Math.min(num(row.broj_pakovanja), num(draft.potvrdjeno_pakovanja ?? row.potvrdjeno_pakovanja)));
    return '<label>' + label + '<input type="number" min="0" max="' + esc(maxValue) +
      '" step="1" inputmode="numeric" data-tracking-input data-row-id="' + esc(row.id) + '" data-field="' + field +
      '" value="' + esc(value) + '"></label>';
  }

  function renderDiagnostic() {
    return '<div class="nd-proc-notice" role="status" aria-live="polite">' +
      '<strong>Дијагностика отварања производа</strong>' +
      '<p>Модул набавке: учитан · Слушач додира: активан</p>' +
      '<p>' + esc(state.diagnostic.pointer) + '</p>' +
      '<p>' + esc(state.diagnostic.click) + '</p>' +
      '<p>' + esc(state.diagnostic.modal) + '</p>' +
      (state.diagnostic.error ? '<p class="is-error">' + esc(state.diagnostic.error) + '</p>' : '') +
      '</div>';
  }

  function render() {
    if (state.disposed) return;
    const isProcessing = state.tour?.status === 'processing';
    const tabs = [['products', 'Набавка'], ['farms', 'По газдинствима'], ['viber', 'Viber комуникација']];
    let body = state.tab === 'products' ? renderProducts() : state.tab === 'farms' ? renderFarmRecords() : renderViberRecords();
    shell.innerHTML = '<header class="nd-proc-head"><div><small>УПРАВЉАЊЕ НАБАВКОМ · ТУРА #' + esc(tourId) +
      '</small><h1>' + esc(state.tour?.naziv || 'Тура #' + tourId) + '</h1><p>' +
      esc(String(state.tour?.status || '').toUpperCase()) + ' · Сви подаци из постојеће Supabase базе</p></div>' +
      '<button type="button" class="nd-proc-secondary" data-action="back">← Назад</button></header>' +
      renderDiagnostic() +
      '<nav class="nd-proc-tabs" aria-label="Преглед набавке">' + tabs.map(([id, label]) =>
        '<button type="button" data-tab="' + id + '" aria-selected="' + (state.tab === id) + '">' + label + '</button>').join('') + '</nav>' +
      (isProcessing ? '' : '<div class="nd-proc-warning">Тура није у статусу processing. Набавка је доступна само за читање; база ће одбити сваки покушај измене.</div>') +
      (state.notice ? '<div class="nd-proc-notice ' + (state.noticeType === 'error' ? 'is-error' : '') + '">' + esc(state.notice) + '</div>' : '') +
      '<section class="nd-proc-content">' + body + '</section>' +
      '<footer class="nd-proc-foot"><span>Постојећи Supabase клијент · RLS активан</span><button type="button" class="nd-proc-secondary" data-action="refresh" ' + (state.busy ? 'disabled' : '') + '>Освежи</button></footer>' +
      (state.selectedProductId !== null ? renderProductAllocationModal() : '');
  }

  function setNotice(message, type = 'success') {
    state.notice = message;
    state.noticeType = type;
    render();
  }

  async function saveAllocation() {
    if (state.busy) return;
    if (state.tour?.status !== 'processing') return setNotice('Расподела је дозвољена само док је тура у статусу processing.', 'error');
    state.busy = true;
    render();
    let wrote = false;
    try {
      const farmId = state.selectedFarmId;
      const eligible = state.demands.filter((demand) => demand.valid &&
        offersFor(demand.productId, demand.variantId).some((offer) => String(offer.gazdinstvo_id) === String(farmId)));
      if (!farmId || !eligible.length) throw new Error('Изабрано газдинство нема активне понуде за потребне варијанте.');
      const changes = [];
      for (const demand of eligible) {
        const draftKey = keyOf(demand.productId, demand.variantId);
        const raw = state.allocationDraft[draftKey];
        if (raw === undefined) continue;
        const count = Number(raw);
        if (!Number.isInteger(count) || count < 0) throw new Error('Број паковања мора бити цео ненегативан број.');
        const max = remaining(demand.productId, demand.variantId, farmId);
        if (count > max) throw new Error('Расподела за ' + (productFor(demand.productId)?.name || 'производ') +
          ' прелази преосталу потребну количину (' + fmt(max) + ').');
        const existing = rowFor(farmId, demand.productId, demand.variantId);
        if (count === 0 && !existing) continue;
        if (existing && count === 0 && (num(existing.naruceno_pakovanja) > 0 || num(existing.potvrdjeno_pakovanja) > 0 || num(existing.preuzeto_pakovanja) > 0)) {
          throw new Error('Расподела са нарученим, потврђеним или преузетим паковањима не може бити обрисана.');
        }
        if (existing && existing.naruceno === true && num(existing.naruceno_pakovanja) === 0) {
          throw new Error('Стара евиденција означава да је наручено, али не садржи број паковања. Прво унеси стварну наручену количину у евиденцији газдинства.');
        }
        if (existing && count < Math.max(num(existing.naruceno_pakovanja), num(existing.potvrdjeno_pakovanja), num(existing.preuzeto_pakovanja))) {
          throw new Error('Нова расподела не може бити мања од већ наручене, потврђене или преузете количине.');
        }
        const offer = offersFor(demand.productId, demand.variantId).find((item) => String(item.gazdinstvo_id) === String(farmId));
        if (!offer) throw new Error('Активна понуда више није доступна. Освежи податке.');
        changes.push({ demand, count, existing, offer });
      }
      if (!changes.length) throw new Error('Нема измењених количина за чување.');
      const removals = changes.filter((change) => change.existing && change.count === 0);
      if (removals.length && !window.confirm('Да ли сигурно желиш да уклониш ' + removals.length + ' постојећих расподела?')) {
        throw new Error('Уклањање расподеле је отказано.');
      }
      for (const change of changes) {
        if (change.existing && change.count === 0) {
          const deleted = await client.from('tura_nabavka_dodele').delete().eq('id', change.existing.id).select('id').maybeSingle();
          if (deleted.error) throw new Error('Брисање расподеле није успело: ' + deleted.error.message);
          if (!deleted.data) throw new Error('База није потврдила уклањање расподеле.');
          wrote = true;
          continue;
        }
        const payload = { broj_pakovanja: change.count, nabavna_cena: num(change.offer.purchase_price), updated_at: new Date().toISOString() };
        const result = change.existing
          ? await client.from('tura_nabavka_dodele').update(payload).eq('id', change.existing.id).select('id,broj_pakovanja').maybeSingle()
          : await client.from('tura_nabavka_dodele').insert({
              tura_id: Number(tourId), product_id: change.demand.productId, variant_id: change.demand.variantId,
              gazdinstvo_id: Number(farmId), broj_pakovanja: change.count, nabavna_cena: num(change.offer.purchase_price),
              naruceno: false, naruceno_pakovanja: 0, potvrdjeno_pakovanja: 0, preuzeto_pakovanja: 0,
              viber_status: 'not_sent'
            }).select('id,broj_pakovanja').single();
        if (result.error) throw new Error('Чување расподеле није успело: ' + result.error.message);
        if (!result.data || num(result.data.broj_pakovanja) !== change.count) throw new Error('База није потврдила сачувану количину.');
        wrote = true;
      }
      state.allocationDraft = {};
      await load();
      setNotice('Расподела је сачувана и поново прочитана из базе.');
    } catch (error) {
      if (wrote) { try { await load(); } catch (_) {} }
      setNotice(error.message || String(error), 'error');
    } finally {
      state.busy = false;
      render();
    }
  }

  async function saveTracking(rowId) {
    if (state.busy) return;
    if (state.tour?.status !== 'processing') return setNotice('Евиденција се може мењати само док је тура у статусу processing.', 'error');
    const row = state.allocations.find((item) => String(item.id) === String(rowId));
    if (!row) return setNotice('Набавна ставка није пронађена. Освежи податке.', 'error');
    const draft = state.trackingDraft[rowId] || {};
    const ordered = Number(draft.naruceno_pakovanja ?? row.naruceno_pakovanja ?? 0);
    const confirmed = Number(draft.potvrdjeno_pakovanja ?? row.potvrdjeno_pakovanja ?? 0);
    const collected = Number(draft.preuzeto_pakovanja ?? row.preuzeto_pakovanja ?? 0);
    const assignedCount = num(row.broj_pakovanja);
    if (![ordered, confirmed, collected].every((value) => Number.isInteger(value) && value >= 0)) {
      return setNotice('Количине морају бити цели ненегативни бројеви.', 'error');
    }
    if (row.naruceno === true && num(row.naruceno_pakovanja) === 0 && ordered === 0) {
      return setNotice('Стара евиденција означава наруџбину, али број није сачуван. Унеси стварни број наручених паковања пре чувања.', 'error');
    }
    if (ordered > assignedCount || confirmed > ordered || (collected > confirmed && (collected !== num(row.preuzeto_pakovanja) || confirmed !== num(row.potvrdjeno_pakovanja)))) {
      return setNotice('Услови нису испуњени: наручено ≤ додељено, потврђено ≤ наручено, преузето ≤ потврђено.', 'error');
    }
    const demand = demandFor(row.product_id, row.variant_id);
    if (!demand) return setNotice('За ову ставку није пронађено требовање у поруџбинама.', 'error');
    const relatedRows = allocationsFor(row.product_id, row.variant_id);
    const totalConfirmed = relatedRows.reduce((sum, item) => sum + (String(item.id) === String(row.id) ? confirmed : num(item.potvrdjeno_pakovanja)), 0);
    const totalCollected = relatedRows.reduce((sum, item) => sum + (String(item.id) === String(row.id) ? collected : num(item.preuzeto_pakovanja)), 0);
    if (totalConfirmed > demand.packages || totalCollected > demand.packages || (totalCollected > totalConfirmed && (collected !== num(row.preuzeto_pakovanja) || confirmed !== num(row.potvrdjeno_pakovanja)))) {
      return setNotice('Потврђена и преузета количина за све добављаче заједно не смеју премашити требовање од ' + fmt(demand.packages) + ' паковања.', 'error');
    }
    state.busy = true;
    render();
    try {
      const patch = {
        naruceno_pakovanja: ordered, naruceno: ordered > 0,
        potvrdjeno_pakovanja: confirmed, preuzeto_pakovanja: collected,
        updated_at: new Date().toISOString()
      };
      if (confirmed !== num(row.potvrdjeno_pakovanja) || (confirmed > 0 && !row.potvrdjeno_at)) {
        patch.potvrdjeno_at = confirmed > 0 ? new Date().toISOString() : null;
      }
      const result = await client.from('tura_nabavka_dodele').update(patch).eq('id', row.id)
        .select('id,naruceno_pakovanja,potvrdjeno_pakovanja,preuzeto_pakovanja').maybeSingle();
      if (result.error) throw new Error(result.error.message);
      if (!result.data || num(result.data.naruceno_pakovanja) !== ordered ||
          num(result.data.potvrdjeno_pakovanja) !== confirmed || num(result.data.preuzeto_pakovanja) !== collected) {
        throw new Error('База није потврдила све количине.');
      }
      delete state.trackingDraft[rowId];
      await load();
      setNotice('Наручено, потврђено и преузето стање је сачувано и проверено.');
    } catch (error) {
      setNotice('Евиденција није сачувана: ' + (error.message || String(error)), 'error');
    } finally {
      state.busy = false;
      render();
    }
  }

  async function updateFarmViberStatus(farmId, status) {
    if (state.busy) return;
    if (state.tour?.status !== 'processing') return setNotice('Viber евиденција се мења само док је тура у статусу processing.', 'error');
    const rows = state.allocations.filter((row) => String(row.gazdinstvo_id) === String(farmId));
    if (!rows.length) return setNotice('Ово газдинство нема сачувану расподелу.', 'error');
    state.busy = true;
    render();
    let updated = 0;
    try {
      const now = new Date().toISOString();
      for (const row of rows) {
        const patch = { viber_status: status, updated_at: now };
        // Preserve the first recorded send time; only fill missing timestamps.
        if (status === 'sent' && !row.viber_poslato_at) patch.viber_poslato_at = now;
        let query = client.from('tura_nabavka_dodele').update(patch).eq('id', row.id);
        if (status === 'sent' && !row.viber_poslato_at) query = query.is('viber_poslato_at', null);
        const result = await query.select('id,viber_status,viber_poslato_at').maybeSingle();
        if (result.error) throw new Error(result.error.message);
        if (!result.data || result.data.viber_status !== status) {
          throw new Error('База није потврдила Viber статус за ставку ' + row.id + '.');
        }
        updated += 1;
      }
      await load();
      setNotice(status === 'sent' ? 'Ручно је потврђено слање Viber поруке за ово газдинство.' : 'Одговор газдинства је евидентиран.');
    } catch (error) {
      if (updated) { try { await load(); } catch (_) {} }
      setNotice('Viber статус није у потпуности сачуван: ' + (error.message || String(error)), 'error');
    } finally {
      state.busy = false;
      render();
    }
  }

  async function copyMessage(farmId) {
    try {
      await copyText(messageForFarm(farmId));
      setNotice('Viber порука је копирана. Статус слања није промењен.');
    } catch (error) {
      setNotice('Копирање није успело. Можеш ручно да означиш текст поруке.', 'error');
    }
  }

  async function openViber(farmId) {
    const farm = farmFor(farmId);
    const phone = String(farm?.phone || '').replace(/[^\d+]/g, '');
    if (!phone) return setNotice('За ово газдинство није наведен број телефона. Поруку можеш копирати.', 'error');
    try { await copyText(messageForFarm(farmId)); } catch (_) {}
    window.location.href = 'viber://chat?number=' + encodeURIComponent(phone);
    setNotice('Отворен је Viber разговор ако је апликација доступна. Слање није аутоматски евидентирано.');
  }

  function handleInput(event) {
    const target = event.target;
    if (target.matches('[data-allocation-count]')) state.allocationDraft[target.dataset.allocationCount] = target.value;
    if (target.matches('[data-tracking-input]')) {
      const rowId = target.dataset.rowId, field = target.dataset.field;
      state.trackingDraft[rowId] = { ...(state.trackingDraft[rowId] || {}), [field]: target.value };
    }
  }

  shell.addEventListener('input', handleInput);
  shell.addEventListener('change', (event) => {
    if (event.target.matches('[data-farm-select]')) {
      state.selectedFarmId = event.target.value;
      state.allocationDraft = {};
      render();
    }
  });
  function handleProductPointerDown(event) {
    const target = event.target instanceof Element ? event.target : event.target?.parentElement;
    const productCard = target?.closest('[data-open-product]');
    if (!productCard) return;
    state.diagnostic.pointer = 'Телефон је регистровао физички додир на картици производа.';
    state.diagnostic.clickSeen = false;
    const token = ++state.diagnostic.tapToken;
    setTimeout(() => {
      if (state.disposed || state.diagnostic.tapToken !== token || state.diagnostic.clickSeen) return;
      state.diagnostic.click = 'Додир је регистрован, али click догађај није стигао до ADMIN модула.';
      state.diagnostic.modal = 'Прозор није отворен јер клик није примљен.';
      state.diagnostic.error = 'Потребно је проверити шта прекида click догађај на страници.';
      render();
    }, 700);
  }

  async function handleClick(event) {
    const target = event.target instanceof Element ? event.target : event.target?.parentElement;
    if (!target) return;
    if (target.matches('[data-product-modal-backdrop]')) { state.selectedProductId = null; state.selectedVariantId = null; render(); return; }
    const productCard = target.closest('[data-open-product]');
    if (productCard) {
      state.diagnostic.clickSeen = true;
      state.diagnostic.tapToken += 1;
      state.diagnostic.click = 'ADMIN је примио клик за производ ID ' + productCard.dataset.openProduct + '.';
      state.diagnostic.error = '';
      openProductAllocation(productCard.dataset.openProduct, productCard.dataset.openVariant || null);
      return;
    }
    const tab = target.closest('[data-tab]');
    if (tab) { state.tab = tab.dataset.tab; state.notice = ''; render(); return; }
    const button = target.closest('[data-action]');
    if (!button || state.busy) return;
    const action = button.dataset.action;
    if (action === 'close-product-modal') { state.selectedProductId = null; state.selectedVariantId = null; render(); return; }
    if (action === 'back') return onBack?.();
    if (action === 'refresh') {
      button.disabled = true;
      try { await load(); } catch (error) { setNotice(error.message || String(error), 'error'); }
      return;
    }
    if (action === 'save-allocation') return saveAllocation();
    if (action === 'save-tracking') return saveTracking(button.dataset.rowId);
    if (action === 'copy-message') return copyMessage(button.dataset.farmId);
    if (action === 'open-viber') return openViber(button.dataset.farmId);
    if (action === 'mark-sent') return updateFarmViberStatus(button.dataset.farmId, 'sent');
    if (action === 'mark-replied') return updateFarmViberStatus(button.dataset.farmId, 'replied');
  }
  // Capture touch and click at the existing panel root; diagnostics distinguish pointer from click delivery.
  root.addEventListener('pointerdown', handleProductPointerDown, true);
  root.addEventListener('click', handleClick, true);

  function handleKeydown(event) {
    if (event.key === 'Escape' && state.selectedProductId !== null) { state.selectedProductId = null; state.selectedVariantId = null; render(); return; }
  }
  shell.addEventListener('keydown', handleKeydown);

  try {
    await load();
    if (initialProductId !== null && initialProductId !== undefined && initialProductId !== '') {
      openProductAllocation(String(initialProductId));
    }
  } catch (error) {
    state.diagnostic.error = 'Модул је покренут, али учитавање података није успело: ' + (error.message || String(error));
    shell.innerHTML = '<div class="nd-proc-error"><strong>Набавка није учитана</strong><p>' + esc(state.diagnostic.error) +
      '</p><button type="button" data-action="back">Назад</button></div>';
  }

  return {
    destroy() { state.disposed = true; state.token += 1; shell.removeEventListener('input', handleInput); shell.removeEventListener('keydown', handleKeydown); root.removeEventListener('pointerdown', handleProductPointerDown, true); root.removeEventListener('click', handleClick, true); root.replaceChildren(); }
  };
}
