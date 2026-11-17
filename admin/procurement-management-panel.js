/*
 * NARUČI DOMAĆE — PROCUREMENT MANAGEMENT PANEL
 * Version: 1.0.0
 * Updated: 2026-11-17
 * Description: Product/variant procurement allocation by farm, independent farm records,
 *              Viber message preparation and package order/confirmation/pickup tracking.
 * Scope: Existing ADMIN Workspace + existing Supabase client; no parallel data store.
 */
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const num = (value) => { const n = Number(value); return Number.isFinite(n) ? n : 0; };
const fmt = (value) => num(value).toLocaleString('sr-RS', { maximumFractionDigits: 3 });
const uniq = (values) => [...new Set(values.filter((value) => value !== null && value !== undefined && value !== ''))];
const unwrap = (result, label) => { if (result.error) throw new Error(label + ': ' + result.error.message); return result.data || []; };
const keyOf = (productId, variantId) => String(productId) + '::' + String(variantId);
const allocationKey = (farmId, productId, variantId) => String(farmId) + '::' + keyOf(productId, variantId);

export async function mountProcurementManagement({ root, core, tourId, onBack }) {
  if (!root || !core || core.authenticated !== true || !core.client || !tourId) {
    throw new Error('Недостаје потврђено ADMIN језгро или ID туре.');
  }
  const role = core.getState()?.role;
  if (!['admin', 'super_admin'].includes(role)) {
    throw new Error('Ваша ADMIN улога нема дозволу за управљање набавком. RLS правила нису заобиђена.');
  }

  const client = core.client;
  const state = {
    tour: null, items: [], products: [], variants: [], offers: [], farms: [],
    allocations: [], demands: [], tab: 'products', selectedFarmId: '',
    allocationDraft: {}, trackingDraft: {}, busy: false, disposed: false, token: 0,
    notice: '', noticeType: 'success'
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
      const count = Number(row.package_count);
      const size = Number(row.package_size);
      if (!Number.isFinite(count) || count < 0 || !Number.isFinite(size) || size <= 0 || !row.package_unit) {
        demand.valid = false;
      } else {
        demand.packages += count;
        demand.totalQuantity += count * size;
      }
      if (String(demand.packageSize) !== String(row.package_size) ||
          String(demand.packageUnit) !== String(row.package_unit)) demand.valid = false;
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
    if (!state.demands.length) return '<div class="nd-proc-empty">За ову туру нису пронађене ставке са product_id и variant_id.</div>';
    return state.demands.map((demand) => {
      const product = productFor(demand.productId);
      const productName = product?.name || 'Назив производа није доступан у products.name';
      const totalAssigned = assigned(demand.productId, demand.variantId);
      const left = remaining(demand.productId, demand.variantId);
      const suppliers = offersFor(demand.productId, demand.variantId)
        .map((offer) => farmFor(offer.gazdinstvo_id)?.name).filter(Boolean);
      return '<article class="nd-proc-card">' +
        '<div class="nd-proc-card-head"><div><strong>' + esc(productName) + '</strong><small>' + esc(formatVariant(demand)) + '</small></div>' +
        '<span class="nd-proc-pill ' + (left === 0 ? 'is-done' : 'is-open') + '">' + (left === 0 ? 'Распоређено' : 'Преостало ' + fmt(left)) + '</span></div>' +
        '<div class="nd-proc-metrics"><span><b>' + fmt(demand.packages) + '</b><small>Потребно паковања</small></span>' +
        '<span><b>' + fmt(totalAssigned) + '</b><small>Распоређено</small></span><span><b>' + fmt(left) + '</b><small>Преостало</small></span></div>' +
        '<div class="nd-proc-subline">Укупна количина: ' + fmt(demand.totalQuantity) + ' ' + esc(demand.packageUnit || '') + '</div>' +
        (demand.valid ? '' : '<div class="nd-proc-warning">Недостаје исправан package_count, package_size или package_unit. Расподела за ову варијанту је блокирана.</div>') +
        '<div class="nd-proc-suppliers"><small>Активне понуде за ову варијанту</small>' +
        (suppliers.length ? suppliers.map((name) => '<span>' + esc(name) + '</span>').join('') : '<em>Нема активних понуда.</em>') + '</div></article>';
    }).join('');
  }

  function renderAllocation() {
    const offeredFarmIds = uniq(state.offers.filter((offer) => state.demands.some((demand) =>
      String(demand.productId) === String(offer.product_id) && String(demand.variantId) === String(offer.variant_id)))
      .map((offer) => offer.gazdinstvo_id));
    if (!offeredFarmIds.length) return '<div class="nd-proc-empty">Нема активних понуда које одговарају производима и варијантама ове туре.</div>';
    const farm = farmFor(state.selectedFarmId);
    const eligible = state.demands.filter((demand) => demand.valid &&
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
      const max = remaining(demand.productId, demand.variantId, state.selectedFarmId);
      const draftKey = keyOf(demand.productId, demand.variantId);
      const draft = state.allocationDraft[draftKey];
      return '<article class="nd-proc-card"><div class="nd-proc-card-head"><div><strong>' +
        esc(product?.name || 'Назив производа није доступан') + '</strong><small>' + esc(formatVariant(demand)) + '</small></div>' +
        '<span class="nd-proc-pill is-open">Преостало за ово газдинство ' + fmt(max) + '</span></div>' +
        '<div class="nd-proc-input-row"><label>Број паковања</label><input type="number" min="' + (existing ? '1' : '0') + '" max="' + max + '" step="1" inputmode="numeric" data-allocation-count="' + esc(draftKey) +
        '" value="' + esc(draft ?? current) + '" aria-label="Број паковања за ' + esc(product?.name || 'производ') + '"></div>' +
        (existing ? '<small class="nd-proc-subline">Већ сачувано: ' + fmt(current) + ' паковања</small>' : '') + '</article>';
    }).join('');
    html += '<button type="button" class="nd-proc-primary" data-action="save-allocation">Сачувај расподелу овог газдинства</button>';
    return html;
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
      const status = rows.some((row) => row.viber_status === 'replied') ? 'Одговор примљен' :
        rows.some((row) => row.viber_status === 'sent') ? 'Послато' : 'Није послато';
      let html = '<section class="nd-proc-farm-record"><header><div><strong>' + esc(farm?.name || 'Газдинство #' + farmId) +
        '</strong><small>' + esc(farm?.phone || 'Телефон није наведен') + '</small></div><span class="nd-proc-pill">' + status + '</span></header>';
      html += '<div class="nd-proc-metrics"><span><b>' + fmt(total) + '</b><small>Додељено</small></span><span><b>' + fmt(ordered) +
        '</b><small>Наручено</small></span><span><b>' + fmt(confirmed) + '</b><small>Потврђено</small></span><span><b>' + fmt(collected) + '</b><small>Преузето</small></span></div>';
      html += '<div class="nd-proc-farm-lines">' + rows.map((row) => {
        const product = productFor(row.product_id), variant = variantFor(row.variant_id);
        const draft = state.trackingDraft[row.id] || {};
        return '<article class="nd-proc-track-row"><div class="nd-proc-track-title"><strong>' + esc(product?.name || 'Назив производа није доступан') +
          '</strong><small>' + esc(variant?.name || variant?.size_label || 'Варијанта није доступна') + '</small></div>' +
          '<div class="nd-proc-track-grid">' +
          trackingInput(row, draft, 'naruceno_pakovanja', 'Наручено') +
          trackingInput(row, draft, 'potvrdjeno_pakovanja', 'Потврђено') +
          trackingInput(row, draft, 'preuzeto_pakovanja', 'Преузето') + '</div>' +
          '<div class="nd-proc-track-meta"><span>Додељено: ' + fmt(row.broj_pakovanja) + '</span>' +
          '<span>Viber: ' + esc(row.viber_status === 'replied' ? 'Одговор примљен' : row.viber_status === 'sent' ? 'Послато' : 'Није послато') + '</span></div>' +
          '<button type="button" class="nd-proc-secondary" data-action="save-tracking" data-row-id="' + esc(row.id) + '">Сачувај количине</button></article>';
      }).join('') + '</div>';
      html += '<div class="nd-proc-message"><label>Viber порука за ово газдинство</label><textarea readonly rows="5">' + esc(messageForFarm(farmId)) + '</textarea>' +
        '<div class="nd-proc-actions"><button type="button" class="nd-proc-secondary" data-action="copy-message" data-farm-id="' + esc(farmId) + '">Копирај поруку</button>' +
        (farm?.phone ? '<button type="button" class="nd-proc-secondary" data-action="open-viber" data-farm-id="' + esc(farmId) + '">Отвори Viber</button>' : '') +
        '<button type="button" class="nd-proc-secondary" data-action="mark-sent" data-farm-id="' + esc(farmId) + '">Потврди слање</button>' +
        '<button type="button" class="nd-proc-secondary" data-action="mark-replied" data-farm-id="' + esc(farmId) + '">Евидентирај одговор</button></div>' +
        '<small>Копирање или отварање Viber-а не мења статус слања. Статус се мења само ручном потврдом.</small></div></section>';
      return html;
    }).join('');
  }

  function trackingInput(row, draft, field, label) {
    const value = draft[field] ?? row[field] ?? 0;
    return '<label>' + label + '<input type="number" min="0" max="' + esc(row.broj_pakovanja) +
      '" step="1" inputmode="numeric" data-tracking-input data-row-id="' + esc(row.id) + '" data-field="' + field +
      '" value="' + esc(value) + '"></label>';
  }

  function render() {
    if (state.disposed) return;
    const isProcessing = state.tour?.status === 'processing';
    const tabs = [['products', 'По производима'], ['allocation', 'Расподела'], ['farms', 'По газдинствима']];
    let body = state.tab === 'products' ? renderProducts() : state.tab === 'allocation' ? renderAllocation() : renderFarmRecords();
    shell.innerHTML = '<header class="nd-proc-head"><div><small>УПРАВЉАЊЕ НАБАВКОМ · ТУРА #' + esc(tourId) +
      '</small><h1>' + esc(state.tour?.naziv || 'Тура #' + tourId) + '</h1><p>' +
      esc(String(state.tour?.status || '').toUpperCase()) + ' · Сви подаци из постојеће Supabase базе</p></div>' +
      '<button type="button" class="nd-proc-secondary" data-action="back">← Назад</button></header>' +
      '<nav class="nd-proc-tabs" aria-label="Преглед набавке">' + tabs.map(([id, label]) =>
        '<button type="button" data-tab="' + id + '" aria-selected="' + (state.tab === id) + '">' + label + '</button>').join('') + '</nav>' +
      (isProcessing ? '' : '<div class="nd-proc-warning">Тура није у статусу processing. Набавка је доступна само за читање; база ће одбити сваки покушај измене.</div>') +
      (state.notice ? '<div class="nd-proc-notice ' + (state.noticeType === 'error' ? 'is-error' : '') + '">' + esc(state.notice) + '</div>' : '') +
      '<section class="nd-proc-content">' + body + '</section>' +
      '<footer class="nd-proc-foot"><span>Постојећи Supabase клијент · RLS активан</span><button type="button" class="nd-proc-secondary" data-action="refresh">Освежи</button></footer>';
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
        if (existing && count === 0) throw new Error('Постојећу расподелу није могуће обрисати овим пољем. Унеси количину већу од нуле.');
        if (existing && count < Math.max(num(existing.naruceno_pakovanja), num(existing.potvrdjeno_pakovanja), num(existing.preuzeto_pakovanja))) {
          throw new Error('Нова расподела не може бити мања од већ наручене, потврђене или преузете количине.');
        }
        const offer = offersFor(demand.productId, demand.variantId).find((item) => String(item.gazdinstvo_id) === String(farmId));
        if (!offer) throw new Error('Активна понуда више није доступна. Освежи податке.');
        changes.push({ demand, count, existing, offer });
      }
      if (!changes.length) throw new Error('Нема измењених количина за чување.');
      for (const change of changes) {
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
      }
      state.allocationDraft = {};
      await load();
      setNotice('Расподела је сачувана и поново прочитана из базе.');
    } catch (error) {
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
    if (ordered > assignedCount || confirmed > ordered || collected > confirmed) {
      return setNotice('Услови нису испуњени: наручено ≤ додељено, потврђено ≤ наручено, преузето ≤ потврђено.', 'error');
    }
    state.busy = true;
    render();
    try {
      const patch = {
        naruceno_pakovanja: ordered, naruceno: ordered > 0,
        potvrdjeno_pakovanja: confirmed, preuzeto_pakovanja: collected,
        updated_at: new Date().toISOString()
      };
      if (confirmed !== num(row.potvrdjeno_pakovanja)) patch.potvrdjeno_at = confirmed > 0 ? new Date().toISOString() : null;
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
    try {
      for (const row of rows) {
        const patch = { viber_status: status, updated_at: new Date().toISOString() };
        if (status === 'sent' && !row.viber_poslato_at) patch.viber_poslato_at = new Date().toISOString();
        const result = await client.from('tura_nabavka_dodele').update(patch).eq('id', row.id)
          .select('id,viber_status,viber_poslato_at').maybeSingle();
        if (result.error) throw new Error(result.error.message);
        if (!result.data || result.data.viber_status !== status) throw new Error('База није потврдила Viber статус.');
      }
      await load();
      setNotice(status === 'sent' ? 'Ручно је потврђено слање Viber поруке за ово газдинство.' : 'Одговор газдинства је евидентиран.');
    } catch (error) {
      setNotice('Viber статус није у потпуности сачуван: ' + (error.message || String(error)), 'error');
    } finally {
      state.busy = false;
      render();
    }
  }

  async function copyMessage(farmId) {
    try {
      await navigator.clipboard.writeText(messageForFarm(farmId));
      setNotice('Viber порука је копирана. Статус слања није промењен.');
    } catch (error) {
      setNotice('Копирање није успело. Можеш ручно да означиш текст поруке.', 'error');
    }
  }

  async function openViber(farmId) {
    const farm = farmFor(farmId);
    const phone = String(farm?.phone || '').replace(/[^\d+]/g, '');
    if (!phone) return setNotice('За ово газдинство није наведен број телефона. Поруку можеш копирати.', 'error');
    try { await navigator.clipboard.writeText(messageForFarm(farmId)); } catch (_) {}
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
  shell.addEventListener('click', async (event) => {
    const tab = event.target.closest('[data-tab]');
    if (tab) { state.tab = tab.dataset.tab; state.notice = ''; render(); return; }
    const button = event.target.closest('[data-action]');
    if (!button || state.busy) return;
    const action = button.dataset.action;
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
  });

  try { await load(); } catch (error) {
    shell.innerHTML = '<div class="nd-proc-error"><strong>Набавка није учитана</strong><p>' + esc(error.message || String(error)) +
      '</p><button type="button" data-action="back">Назад</button></div>';
  }

  return {
    destroy() { state.disposed = true; state.token += 1; shell.removeEventListener('input', handleInput); root.replaceChildren(); }
  };
}
