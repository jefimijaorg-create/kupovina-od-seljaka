/*
 * NARUČI DOMAĆE — PROCUREMENT REQUEST BASKET
 * Version: 1.0.2
 * Updated: 2026-11-26
 * Description: Builds the tour-wide producer master list and isolated per-farm Viber specifications.
 * Scope: Read-only presentation over existing procurement allocations; no database schema changes.
 */

export function renderProcurementRequestBasket({
  allocations = [], farms = [], products = [], variants = [], demands = [],
  tourId, tourDate = null, esc, fmt, fmtDateTime, busy = false
}) {
  const num = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const farmFor = (id) => farms.find((farm) => String(farm.id) === String(id));
  const productFor = (id) => products.find((product) => String(product.id) === String(id));
  const variantFor = (id) => variants.find((variant) => String(variant.id) === String(id));
  const demandFor = (row) => demands.find((item) =>
    String(item.productId) === String(row.product_id) &&
    String(item.variantId) === String(row.variant_id)
  );
  const rows = allocations.filter((row) => num(row.broj_pakovanja) > 0);
  const farmIds = [...new Set(rows.map((row) => String(row.gazdinstvo_id)))];
  if (!farmIds.length) {
    return '<div class="nd-proc-empty">Корпа за захтеве је празна. Прво расподели производе и варијанте газдинствима у овој тури.</div>';
  }

  const totalPackages = rows.reduce((sum, row) => sum + num(row.broj_pakovanja), 0);
  const totalLines = rows.length;
  const sentFarms = farmIds.filter((farmId) => rows.filter((row) =>
    String(row.gazdinstvo_id) === farmId).every((row) => row.viber_status === 'sent' || row.viber_status === 'replied')).length;

  const cards = farmIds.map((farmId) => {
    const farmRows = rows.filter((row) => String(row.gazdinstvo_id) === farmId);
    const farm = farmFor(farmId);
    const statuses = new Set(farmRows.map((row) => row.viber_status || 'not_sent'));
    const status = statuses.size > 1 ? 'Различити статуси по ставкама' :
      farmRows[0]?.viber_status === 'replied' ? 'Одговор примљен' :
      farmRows[0]?.viber_status === 'sent' ? 'Послато' : 'Није послато';
    const statusClass = statuses.has('replied') ? 'is-done' : statuses.has('sent') ? 'is-open' : '';
    const latestSent = farmRows.map((row) => row.viber_poslato_at).filter(Boolean).sort().at(-1);
    const latestReply = farmRows.map((row) => row.potvrdjeno_at).filter(Boolean).sort().at(-1);
    const messageLines = farmRows.map((row) => {
      const product = productFor(row.product_id);
      const variant = variantFor(row.variant_id);
      const demand = demandFor(row);
      const count = num(row.broj_pakovanja);
      const packageSize = num(demand?.packageSize);
      const packageUnit = demand?.packageUnit || variant?.package_unit || '';
      const totalQuantity = packageSize > 0 ? count * packageSize : null;
      const packageLabel = variant?.name || variant?.size_label || 'Варијанта';
      const quantityLabel = totalQuantity === null
        ? fmt(count) + ' паковања'
        : fmt(count) + ' пак. × ' + fmt(packageSize) + ' ' + packageUnit + ' = ' + fmt(totalQuantity) + ' ' + packageUnit;
      return {
        productName: product?.name || 'Назив производа није доступан',
        variantName: packageLabel,
        quantityLabel,
        message: '- ' + (product?.name || 'Назив производа није доступан') + ' — ' +
          packageLabel + ': ' + quantityLabel
      };
    });
    const deliveryDate = tourDate ? new Date(tourDate + 'T12:00:00').toLocaleDateString('sr-RS') : '';
    const message = '**НАРУЧИ ДОМАЋЕ — Требовање за туру #' + tourId + '**' +\n      (deliveryDate ? '\nДатум испоруке: ' + deliveryDate : '') +\n      '\n\nПоздрав, ' + (farm?.name || 'газдинство') + '!\n\nТребујемо следеће:\n\n' +\n      messageLines.map((line, index) => (index + 1) + '. **' + line.productName + '**\n   • ' + line.variantName + ': **' + line.quantityLabel + '**').join('\n\n') +\n      '\n\nМолимо вас потврдите шта можете да припремите. Хвала!';
    const phone = String(farm?.phone || '').replace(/[^\d+]/g, '');
    const itemsHtml = messageLines.map((line) =>
      '<li>' + esc(line.productName) + ' · ' + esc(line.variantName) +
      ': <strong>' + esc(line.quantityLabel) + '</strong></li>'
    ).join('');
    return '<section class="nd-proc-farm-record nd-proc-viber-record">' +
      '<header><div><strong>' + esc(farm?.name || 'Газдинство #' + farmId) +
      '</strong><small>' + esc(farm?.phone || 'Телефон није наведен') +
      '</small></div><span class="nd-proc-pill ' + statusClass + '">' + status + '</span></header>' +
      '<ul class="nd-proc-viber-lines">' + itemsHtml + '</ul>' +
      '<div class="nd-proc-track-meta"><span>Укупно: ' + fmt(farmRows.reduce((sum, row) => sum + num(row.broj_pakovanja), 0)) +
      ' паковања · ' + farmRows.length + ' ставки</span><span>Слање: ' + esc(fmtDateTime(latestSent)) +
      ' · Одговор: ' + esc(fmtDateTime(latestReply)) + '</span></div>' +
      '<div class="nd-proc-message"><label>Збирна Viber порука — само за ово газдинство</label>' +
      '<textarea readonly rows="6">' + esc(message) + '</textarea><div class="nd-proc-actions">' +
      '<button type="button" class="nd-proc-secondary" data-action="copy-message" data-farm-id="' + esc(farmId) + '" ' + (busy ? 'disabled' : '') + '>Копирај Viber поруку</button>' +
      (phone ? '<button type="button" class="nd-proc-secondary" data-action="open-viber" data-farm-id="' + esc(farmId) + '" ' + (busy ? 'disabled' : '') + '>Отвори Viber</button>' : '') +
      '<button type="button" class="nd-proc-secondary" data-action="mark-sent" data-farm-id="' + esc(farmId) + '" ' + (busy ? 'disabled' : '') + '>Потврди слање</button>' +
      '<button type="button" class="nd-proc-secondary" data-action="mark-replied" data-farm-id="' + esc(farmId) + '" ' + (busy ? 'disabled' : '') + '>Евидентирај одговор</button></div>' +
      '<small>Слање се обавља ручно у Viber апликацији. Копирање или отварање разговора не мења статус.</small></div></section>';
  }).join('');

  return '<section class="nd-proc-request-basket">' +
    '<div class="nd-proc-form-head"><div><strong>Корпа захтева · цела тура #' + esc(tourId) + '</strong>' +
    '<small>Систем аутоматски групише расподеле по газдинству.</small></div></div>' +
    '<div class="nd-proc-metrics">' +
    '<span><b>' + fmt(farmIds.length) + '</b><small>Ангажована газдинства</small></span>' +
    '<span><b>' + fmt(totalLines) + '</b><small>Ставке спецификације</small></span>' +
    '<span><b>' + fmt(totalPackages) + '</b><small>Укупно паковања</small></span>' +
    '<span><b>' + fmt(sentFarms) + '/' + fmt(farmIds.length) + '</b><small>Газдинства са евидентираним слањем</small></span>' +
    '</div>' +
    '<div class="nd-proc-notice" role="status">Мастер списак обухвата сва газдинства. Свака порука испод садржи искључиво задужења одговарајућег газдинства.</div>' +
    cards +
    '<div class="nd-proc-warning">Viber Business API није повезан. Није могуће аутоматски послати све поруке једним кликом. Овде су припремљене све персонализоване поруке; сваку отвараш и шаљеш кроз Viber, а затим ручно потврђујеш слање.</div>' +
    '</section>';
}
