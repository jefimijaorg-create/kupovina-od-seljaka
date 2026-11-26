/*
 * NARUČI DOMAĆE — PROCUREMENT MANAGEMENT PANEL
 * Version: 1.6.1
 * Updated: 2026-11-18
 * Description: Coordinates procurement workflow and delegates pure demand and allocation calculations to a dedicated module.
 * Scope: Existing ADMIN Workspace + existing Supabase client; no parallel data store.
 */
import { renderProcurementRequestBasket } from './procurement-request-basket.js';
import { loadProcurementData } from './data/admin-repository.js';
import { buildProcurementDemands, sumAllocatedPackages, calculateRemainingPackages } from './procurement/procurement-calculations.js';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const num = (value) => { const n = Number(value); return Number.isFinite(n) ? n : 0; };
const fmt = (value) => num(value).toLocaleString('sr-RS', { maximumFractionDigits: 3 });
const fmtDateTime = (value) => value ? new Date(value).toLocaleString('sr-RS', { dateStyle: 'short', timeStyle: 'short' }) : 'није евидентирано';
async function copyText(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const field = document.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.className = 'nd-copy-fallback-field';
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
    allocations: [], demands: [], tab: 'products', selectedFarmId: 'all', selectedProductId: null,
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
    return sumAllocatedPackages({ allocations: state.allocations, productId, variantId });
  }
  function remaining(productId, variantId, excludingFarmId = null) {
    return calculateRemainingPackages({ demand: demandFor(productId, variantId), allocations: state.allocations, excludingFarmId });
  }
  function formatVariant(demand) {
    const variant = variantFor(demand.variantId);
    return variant?.name || variant?.size_label || 'Варијанта није доступна';
  }
  function messageForFarm(farmId) {
    const farm = farmFor(farmId);
    const rows = state.allocations.filter((row) =>
      String(row.gazdinstvo_id) === String(farmId) && num(row.broj_pakovanja) > 0);
    const lines = rows.map((row) => {
      const product = productFor(row.product_id);
      const variant = variantFor(row.variant_id);
      const demand = demandFor(row.product_id, row.variant_id);
      const count = num(row.broj_pakovanja);
      const packageSize = num(demand?.packageSize);
      const packageUnit = demand?.packageUnit || variant?.package_unit || '';
      const quantity = packageSize > 0
        ? fmt(count) + ' пак. × ' + fmt(packageSize) + ' ' + packageUnit + ' = ' + fmt(count * packageSize) + ' ' + packageUnit
        : fmt(count) + ' паковања';
      return '- ' + (product?.name || 'Назив производа није доступан') + ' — ' +
        (variant?.name || variant?.size_label || 'Варијанта') + ': ' + quantity;
    });
    return 'Поштовани' + (farm?.name ? ' ' + farm.name : '') + ',\n\n' +
      'Молимо вас да потврдите доступност следећих производа за туру #' + tourId + ':\n' +
      lines.join('\n') + '\n\nМолимо да нам јавите колико паковања можете да обезбедите.\nХвала!';
  }

  async function load() {
    const token = ++state.token;
    state.notice = '';
    const data = await loadProcurementData({ client, tourId });
    Object.assign(state, {
      tour: data.tour,
      items: data.items,
      products: data.products,
      variants: data.variants,
      allocations: data.allocations,
      offers: data.offers,
      farms: data.farms,
      invalidSourceRows: data.invalidSourceRows
    });

    state.demands = buildProcurementDemands({ items: state.items, products: state.products, variants: state.variants });

    const relevantOffers = data.relevantOffers;

    if (token !== state.token || state.disposed) return;
    const offeredFarmIds = uniq(relevantOffers.map((offer) => offer.gazdinstvo_id));
    state.selectedFarmId = state.selectedFarmId === 'all' || offeredFarmIds.some((id) => String(id) === String(state.selectedFarmId))
      ? state.selectedFarmId : (offeredFarmIds[0] ?? 'all');
    render();
  }

  function renderProducts() {
    if (!state.demands.length) return '<div class="nd-proc-empty">За ову туру нису пронађене ставке са product_id и variant_id.</div>' +
      (state.invalidSourceRows ? '<div class="nd-proc-warning">' + fmt(state.invalidSourceRows) + ' ставки нема product_id или variant_id и зато није укључено у набавку.</div>' : '');
    const groups = new Map();
    const visibleDemands = state.selectedFarmId === 'all' ? state.demands : state.demands.filter((demand) =>
      offersFor(demand.productId, demand.variantId).some((offer) => String(offer.gazdinstvo_id) === String(state.selectedFarmId)));
    for (const demand of visibleDemands) {
      const key = String(demand.productId);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(demand);
    }
    const offeredFarmIds = uniq(state.offers.filter((offer) => state.demands.some((demand) => String(demand.productId) === String(offer.product_id) && String(demand.variantId) === String(offer.variant_id))).map((offer) => offer.gazdinstvo_id));
    const farmOptions = '<option value="all" ' + (state.selectedFarmId === 'all' ? 'selected' : '') + '>Сва газдинства · сви производи</option>' + offeredFarmIds.map((id) => '<option value="' + esc(id) + '" ' + (String(id) === String(state.selectedFarmId) ? 'selected' : '') + '>' + esc(farmFor(id)?.name || 'Газдинство #' + id) + '</option>').join('');
    let html = '<div class="nd-proc-form-head nd-proc-main-farm-filter"><label for="ndProcMainFarmFilter">Приказ набавке по газдинству</label><select id="ndProcMainFarmFilter" data-main-farm-filter>' + farmOptions + '</select><small>Изабери „Сва газдинства“ за комплетно требовање или конкретно газдинство за његове производе и доделу.</small></div>' +
      (state.invalidSourceRows ? '<div class="nd-proc-warning">' + fmt(state.invalidSourceRows) + ' ставки нема product_id или variant_id и зато није укључено у набавку.</div>' : '');
    for (const [productId, demands] of groups) {
      const product = productFor(productId);
      const productName = product?.name || 'Назив производа није доступан у products.name';
      html += '<article class="nd-proc-card nd-proc-product-group" data-open-product="' + esc(productId) + '" role="button" tabindex="0" aria-label="Отвори расподелу за ' + esc(productName) + '">' +
        '<header class="nd-proc-product-heading"><strong>' + esc(productName) + '</strong>' +
        '<small>' + fmt(demands.length) + (demands.length === 1 ? ' варијанта' : ' варијанте') + ' · отвори за доделу</small></header>';
      html += demands.map((demand) => {
        const variantRows = allocationsFor(demand.productId, demand.variantId);
        const totalActivated = variantRows.reduce((sum, row) => sum + num(row.broj_pakovanja), 0);
        const totalOrdered = variantRows.reduce((sum, row) => sum + num(row.naruceno_pakovanja), 0);
        const remainingToOrder = Math.max(0, demand.packages - totalOrdered);
        const farmBreakdown = variantRows
          .filter((row) => num(row.broj_pakovanja) > 0 || num(row.naruceno_pakovanja) > 0)
          .map((row) => {
            const farm = farmFor(row.gazdinstvo_id);
            const activated = num(row.broj_pakovanja);
            const ordered = num(row.naruceno_pakovanja);
            return '<div class="nd-proc-track-row"><div class="nd-proc-track-title"><strong>' +
              esc(farm?.name || 'Газдинство #' + row.gazdinstvo_id) + '</strong></div>' +
              '<div class="nd-proc-track-meta"><span>Активирано: <b>' + fmt(activated) + '</b> пак.</span>' +
              '<span>Наручено: <b>' + fmt(ordered) + '</b> пак.</span>' +
              '<span>Преостало код газдинства: <b>' + fmt(Math.max(0, activated - ordered)) + '</b> пак.</span></div></div>';
          }).join('');
        const suppliers = offersFor(demand.productId, demand.variantId)
          .map((offer) => farmFor(offer.gazdinstvo_id)?.name).filter(Boolean);
        return '<section class="nd-proc-variant-block">' +
          '<div class="nd-proc-card-head"><div><strong>' + esc(formatVariant(demand)) + '</strong></div>' +
          '<span class="nd-proc-pill ' + (remainingToOrder === 0 ? 'is-done' : 'is-open') + '">' +
          (remainingToOrder === 0 ? 'Све наручено' : 'За наручивање ' + fmt(remainingToOrder)) + '</span></div>' +
          '<div class="nd-proc-metrics"><span><b>' + fmt(demand.packages) + '</b><small>Потребно</small></span>' +
          '<span><b>' + fmt(totalActivated) + '</b><small>Активирано</small></span>' +
          '<span><b>' + fmt(totalOrdered) + '</b><small>Наручено</small></span>' +
          '<span><b>' + fmt(remainingToOrder) + '</b><small>Преостало</small></span></div>' +
          '<div class="nd-proc-subline">Укупна количина: ' + fmt(demand.totalQuantity) + ' ' + esc(demand.packageUnit || '') + '</div>' +
          '<div class="nd-proc-farm-lines"><small>Евиденција по газдинствима</small>' +
          (farmBreakdown || '<div class="nd-proc-empty">Још није активирано ниједно газдинство за ову варијанту.</div>') +
          '</div>' +
          (demand.valid ? '' : '<div class="nd-proc-warning">Недостаје исправан package_count, package_size или package_unit. Расподела за ову варијанту је блокирана.</div>') +
          '<div class="nd-proc-suppliers"><small>Активне понуде за ову варијанту</small>' +
          (suppliers.length ? suppliers.map((name) => '<span>' + esc(name) + '</span>').join('') : '<em>Нема активних понуда.</em>') +
          '</div></section>';
      }).join('');
      html += '</article>';
    }
    return html;
  }

  function renderAllocation(productId = null) {
    const demands = productId === null ? state.demands : state.demands.filter((demand) => String(demand.productId) === String(productId));
    const offeredFarmIds = uniq(state.offers.filter((offer) => demands.some((demand) =>
      String(demand.productId) === String(offer.product_id) && String(demand.variantId) === String(offer.variant_id)))
      .map((offer) => offer.gazdinstvo_id));
    if (!offeredFarmIds.length) return '<div class="nd-proc-empty">Нема активних понуда које одговарају производима и варијантама ове туре.</div>';
    const farm = farmFor(state.selectedFarmId);
    const eligible = demands.filter((demand) => demand.valid &&
      offersFor(demand.productId, demand.variantId).some((offer) => String(offer.gazdinstvo_id) === String(state.selectedFarmId)));
    let html = '<div class="nd-proc-form-head"><label for="ndProcFarmSelect">Додели овај производ газдинству</label>' +
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
      const uncovered = Math.max(0, demand.packages - otherAssigned - current);
      const max = Math.max(0, demand.packages - otherAssigned);
      const draftKey = keyOf(demand.productId, demand.variantId);
      const draft = state.allocationDraft[draftKey];
      return '<article class="nd-proc-card nd-proc-allocation-card"><div class="nd-proc-card-head"><div><strong>' +
        esc(product?.name || 'Назив производа није доступан') + '</strong><small>' + esc(formatVariant(demand)) + '</small></div>' +
        '<span class="nd-proc-pill is-open">Највише укупно за ово газдинство: ' + fmt(max) + '</span></div>' +
        '<div class="nd-proc-allocation-recap" aria-label="Рекапитулација расподеле по варијанти">' +
        '<span><b>' + fmt(demand.packages) + '</b><small>Укупно потребно за туру</small></span>' +
        '<span><b>' + fmt(otherAssigned) + '</b><small>Додељено другим газдинствима</small></span>' +
        '<span><b>' + fmt(current) + '</b><small>Тренутно додељено овом газдинству</small></span>' +
        '<span><b>' + fmt(uncovered) + '</b><small>Преостало непокривено за туру</small></span></div>' +
        '<div class="nd-proc-input-row"><label>Колико паковања додељујеш овом газдинству?</label><input type="number" min="0" max="' + max + '" step="1" inputmode="numeric" data-allocation-count="' + esc(draftKey) +
        '" value="' + esc(draft ?? current) + '" aria-label="Укупна додељена паковања за ' + esc(product?.name || 'производ') + '"></div>' +
        '<small class="nd-proc-subline">Унеси коначну укупну количину, не количину коју додајеш. Тренутно сачувано: ' + fmt(current) +
        ' паковања. Промена се примењује тек након чувања.</small></article>';
    }).join('');
    html += '<button type="button" class="nd-proc-primary" data-action="save-allocation" ' + (state.busy ? 'disabled' : '') + '>' + (state.busy ? 'Чувам…' : 'Сачувај расподелу овог газдинства') + '</button>';
    return html;
  }

  function renderProductAllocationModal() {
    const product = productFor(state.selectedProductId);
    if (!product) return '';
    const productDemands = state.demands.filter((demand) => String(demand.productId) === String(state.selectedProductId));
    const needed = productDemands.reduce((sum, demand) => sum + demand.packages, 0);
    const allocated = productDemands.reduce((sum, demand) => sum + assigned(demand.productId, demand.variantId), 0);
    const left = Math.max(0, needed - allocated);
    return '<div class="nd-proc-product-modal-backdrop" data-product-modal-backdrop>' +
      '<section class="nd-proc-product-modal" role="dialog" aria-modal="true" aria-labelledby="ndProcProductModalTitle">' +
      '<header class="nd-proc-product-modal-head"><div><small>РАСПОДЕЛА ПО ГАЗДИНСТВИМА</small>' +
      '<h2 id="ndProcProductModalTitle">' + esc(product.name || 'Производ') + '</h2>' +
      '<p>Изабрано газдинство: расподели овом добављачу само варијанте које нуди. За сваку ставку унеси број паковања, па сачувај.</p></div>' +
      '<button type="button" class="nd-proc-modal-close" data-action="close-product-modal" aria-label="Затвори форму">×</button></header>' +
      '<div class="nd-proc-modal-summary"><span><b>' + fmt(needed) + '</b><small>Потребно паковања</small></span>' +
      '<span><b>' + fmt(allocated) + '</b><small>Распоређено</small></span>' +
      '<span><b>' + fmt(left) + '</b><small>Преостало</small></span></div>' +
      '<div class="nd-proc-modal-body">' + renderAllocation(state.selectedProductId) + '</div>' +
      '</section></div>';
  }

  function openProductAllocation(productId) {
    const productDemands = state.demands.filter((demand) => String(demand.productId) === String(productId));
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
    return renderProcurementRequestBasket({
      allocations: state.allocations,
      farms: state.farms,
      products: state.products,
      variants: state.variants,
      demands: state.demands,
      tourId,
      esc,
      fmt,
      fmtDateTime,
      busy: state.busy
    });
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
    const tabs = [['products', 'По производима'], ['farms', 'По газдинствима'], ['viber', 'Viber комуникација']];
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
    if (event.target.matches('[data-main-farm-filter]')) {
      state.selectedFarmId = event.target.value;
      state.allocationDraft = {};
      render();
      return;
    }
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
    if (target.matches('[data-product-modal-backdrop]')) { state.selectedProductId = null; render(); return; }
    const productCard = target.closest('[data-open-product]');
    if (productCard) {
      state.diagnostic.clickSeen = true;
      state.diagnostic.tapToken += 1;
      state.diagnostic.click = 'ADMIN је примио клик за производ ID ' + productCard.dataset.openProduct + '.';
      state.diagnostic.error = '';
      openProductAllocation(productCard.dataset.openProduct);
      return;
    }
    const tab = target.closest('[data-tab]');
    if (tab) { state.tab = tab.dataset.tab; state.notice = ''; render(); return; }
    const button = target.closest('[data-action]');
    if (!button || state.busy) return;
    const action = button.dataset.action;
    if (action === 'close-product-modal') { state.selectedProductId = null; render(); return; }
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
    if (event.key === 'Escape' && state.selectedProductId !== null) { state.selectedProductId = null; render(); return; }
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
