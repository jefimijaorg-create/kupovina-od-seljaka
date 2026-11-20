/*
 * NARUČI DOMAĆE — GROUPED TOUR ORDERS
 * Version: 1.0.5
 * Updated: 2026-11-19
 * Description: Displays verified package and line prices plus buyer payable totals; retains compact cards and point quick actions.
 * Data source: Existing authenticated ADMIN Supabase client and existing order/item/product records.
 */
export function mountTourOrdersGroupedView({ root, client, orders, items, customers, points, products, canManage, onOpenOrder, onRefresh }) {
  if (!root || !client?.from || !Array.isArray(orders) || !Array.isArray(items)) {
    throw new TypeError('Недостају подаци или потврђени ADMIN Supabase клијент.');
  }

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt = value => Number.isFinite(Number(value)) ? Number(value).toLocaleString('sr-RS', { maximumFractionDigits: 3 }) : '—';
  const money = value => Number.isFinite(Number(value)) ? Number(value).toLocaleString('sr-RS', {minimumFractionDigits:2,maximumFractionDigits:2}) + ' дин.' : 'Цена није унета';
  const orderMap = new Map(orders.map(row => [String(row.id), row]));
  const customerMap = new Map((customers || []).map(row => [String(row.id), row]));
  const pointMap = new Map((points || []).map(row => [String(row.id), row]));
  const productMap = new Map((products || []).map(row => [String(row.id), row]));
  const linesByOrder = new Map();
  for (const line of items) {
    const key = String(line.porudzbina_id);
    if (!linesByOrder.has(key)) linesByOrder.set(key, []);
    linesByOrder.get(key).push(line);
  }

  const rootNode = document.createElement('div');
  rootNode.className = 'nd-grouped-orders';
  root.replaceChildren(rootNode);
  let busyOrderId = null;
  let feedback = '';
  let feedbackError = false;
  let draggingId = null;

  const orderCard = order => {
    const lines = linesByOrder.get(String(order.id)) || [];
    const lineHtml = lines.length ? lines.map(line => {
      const product = line.product_id ? productMap.get(String(line.product_id)) : null;
      const name = product?.name || (line.product_id ? 'Производ није пронађен у каталогу' : 'Неповезана ставка');
      const count = Number(line.package_count), size = Number(line.package_size);
      const qty = line.package_count !== null && line.package_count !== undefined && line.package_size !== null && line.package_size !== undefined && Number.isFinite(count) && Number.isFinite(size) && line.package_unit
        ? fmt(count) + ' пак. × ' + fmt(size) + ' = ' + fmt(count * size) + ' ' + esc(line.package_unit)
        : 'Амбалажа није потпуна';
      const unitPrice = line.unit_price == null ? null : Number(line.unit_price);
      const lineTotal = line.cena_stavke == null ? null : Number(line.cena_stavke);
      const priceHtml = unitPrice !== null && Number.isFinite(unitPrice) && lineTotal !== null && Number.isFinite(lineTotal)
        ? '<small class="nd-go-price">' + money(unitPrice) + ' / паковању · за ставку: ' + money(lineTotal) + '</small>'
        : '<small class="nd-go-price">Цена није евидентирана</small>';
      return '<div class="nd-go-line"><span>' + esc(name) + '<br><small>' + qty + '</small>' + priceHtml + '</span></div>';
    }).join('') : '<div class="nd-go-empty">Нема ставки у корпи.</div>';
    return '<article class="nd-go-order-card" data-order-card="' + esc(order.id) + '">' +
      '<div class="nd-go-order"><button type="button" class="nd-go-drag" data-drag-order="' + esc(order.id) + '" ' + (busyOrderId !== null ? 'disabled' : '') + ' aria-label="Превуци поруџбину #' + esc(order.id) + '" title="Превуци поруџбину">⠿</button>' +
      '<div style="min-width:0;flex:1"><div class="nd-go-customer-top"><div class="nd-go-order-meta"><span>Поруџбина #' + esc(order.id) + '</span></div>' +
      (canManage ? '<button type="button" class="nd-go-quick-point" data-quick-point="' + esc(order.id) + '" ' + (busyOrderId !== null ? 'disabled' : '') + '>Промени пункт</button>' : '') + '</div>' +
      '<div class="nd-go-lines">' + lineHtml + '</div>' +
      '<div class="nd-go-order-meta">' + lines.length + ' ' + (lines.length === 1 ? 'производ' : 'производа') + '</div>' +
      '</div></div></article>';
  };

  const group = (pointId, rows, unassigned = false) => {
    const point = pointMap.get(String(pointId));
    const label = unassigned ? 'Поруџбине без пункта' : (point?.name || 'Пункт #' + pointId);
    const buyers = new Map();
    for (const order of rows) {
      const buyerKey = String(order.kupac_id ?? ('order-' + order.id));
      if (!buyers.has(buyerKey)) buyers.set(buyerKey, []);
      buyers.get(buyerKey).push(order);
    }
    const buyerHtml = [...buyers.entries()].map(([buyerId, buyerOrders]) => {
      const buyer = customerMap.get(buyerId) || {};
      const phone = buyerOrders[0]?.telefon || buyer.telefon || 'Телефон није наведен';
      const totalKnown = buyerOrders.every(order => order.ukupna_cena != null && Number.isFinite(Number(order.ukupna_cena)));
      const buyerTotal = buyerOrders.reduce((sum, order) => sum + (Number(order.ukupna_cena) || 0), 0);
      return '<section class="nd-go-buyer"><header class="nd-go-buyer-head"><div><div class="nd-go-customer-name">' + esc(String(buyer.ime_prezime || ('Купац · ' + buyerId)).replace(/\?/g, '').replace(/\s+/g, ' ').trim()) + '</div><span class="nd-go-phone">☎ ' + esc(phone) + '</span></div><span class="nd-go-count">' + buyerOrders.length + ' поруџбина</span></header>' + buyerOrders.map(orderCard).join('') + '<div class="nd-go-buyer-total"><span>УКУПНО ЗА НАПЛАТУ</span><strong>' + (totalKnown ? money(buyerTotal) : 'Није доступно') + '</strong></div></section>';
    }).join('');
    return '<section class="nd-go-point ' + (unassigned ? 'nd-go-unassigned' : '') + '" data-drop-point="' + (unassigned ? '' : esc(pointId)) + '">' +
      '<header class="nd-go-point-head"><h3>' + esc(label) + '</h3><span class="nd-go-count">' + rows.length + ' поруџбина</span></header>' +
      '<div class="nd-go-drop">' + (rows.length ? buyerHtml : '<div class="nd-go-empty">Нема поруџбина у овом пункту.</div>') + '</div></section>';
  };

  function render() {
    const assigned = new Map();
    const unassigned = [];
    for (const order of orders) {
      if (order.punkt_id === null || order.punkt_id === undefined || order.punkt_id === '') unassigned.push(order);
      else {
        const key = String(order.punkt_id);
        if (!assigned.has(key)) assigned.set(key, []);
        assigned.get(key).push(order);
      }
    }
    const orderedPointIds = [...(points || []).filter(p => assigned.has(String(p.id))).map(p => String(p.id)), ...[...assigned.keys()].filter(id => !(points || []).some(p => String(p.id) === id))];
    rootNode.innerHTML = '<div class="nd-go-intro"><div><h2>Поруџбине по пунктовима</h2><p>Прво пункт, затим купац · садржај корпе и телефон су одмах видљиви</p></div><span class="nd-go-count">' + orders.length + ' укупно</span></div>' +
      (feedback ? '<div class="nd-go-feedback ' + (feedbackError ? 'nd-go-error' : '') + '" role="status">' + esc(feedback) + '</div>' : '') +
      orderedPointIds.map(id => group(id, assigned.get(id))).join('') +
      group('', unassigned, true);
    rootNode.querySelectorAll('[data-quick-point]').forEach(button => button.addEventListener('click', () => openPointQuickAction(button.dataset.quickPoint)));

    rootNode.querySelectorAll('[data-drag-order]').forEach(handle => {
      handle.addEventListener('pointerdown', event => {
        if (!canManage || busyOrderId !== null) return;
        draggingId = handle.dataset.dragOrder;
        handle.closest('[data-order-card]')?.classList.add('nd-go-dragging');
        handle.setPointerCapture?.(event.pointerId);
        event.preventDefault();
      });
    });
    rootNode.querySelectorAll('[data-drop-point]').forEach(zone => {
      zone.addEventListener('pointerup', event => {
        if (!draggingId) return;
        const orderId = draggingId;
        draggingId = null;
        zone.classList.remove('nd-go-over');
        assignOrder(orderId, zone.dataset.dropPoint || '');
      });
      zone.addEventListener('pointerenter', () => { if (draggingId && zone.dataset.dropPoint) zone.classList.add('nd-go-over'); });
      zone.addEventListener('pointerleave', () => zone.classList.remove('nd-go-over'));
    });
    document.addEventListener('pointerup', finishDrag, { once: true });
  }

  function openPointQuickAction(orderId) {
    if (!canManage || busyOrderId !== null || !orderMap.has(String(orderId))) return;
    const order = orderMap.get(String(orderId));
    const options = '<option value="">Без пункта</option>' + (points || []).map(point => '<option value="' + esc(point.id) + '"' + (String(order.punkt_id || '') === String(point.id) ? ' selected' : '') + '>' + esc(point.name || ('Пункт ' + point.id)) + '</option>').join('');
    const layer = document.createElement('div');
    layer.className = 'nd-go-point-sheet';
    layer.innerHTML = '<div class="nd-go-point-backdrop" data-close-point></div><section class="nd-go-point-dialog" role="dialog" aria-modal="true" aria-labelledby="nd-go-point-title"><h3 id="nd-go-point-title">Додела пункта</h3><p>Поруџбина #' + esc(order.id) + '</p><label for="nd-go-point-choice">Изабери пункт</label><select id="nd-go-point-choice">' + options + '</select><div class="nd-go-point-actions"><button type="button" data-close-point>Откажи</button><button type="button" data-save-point>Сачувај пункт</button></div></section>';
    rootNode.append(layer);
    layer.querySelectorAll('[data-close-point]').forEach(button => button.addEventListener('click', () => layer.remove()));
    layer.querySelector('[data-save-point]').addEventListener('click', async () => {
      const save = layer.querySelector('[data-save-point]');
      save.disabled = true; save.textContent = 'Чувам…';
      await assignOrder(orderId, layer.querySelector('#nd-go-point-choice').value);
      layer.remove();
    });
    layer.querySelector('#nd-go-point-choice').focus();
  }

  function finishDrag(event) {
    if (!draggingId) return;
    const orderId = draggingId;
    draggingId = null;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-drop-point]');
    rootNode.querySelectorAll('.nd-go-over').forEach(node => node.classList.remove('nd-go-over'));
    if (target && target.dataset.dropPoint) assignOrder(orderId, target.dataset.dropPoint);
    else rootNode.querySelector('[data-order-card="' + CSS.escape(orderId) + '"]')?.classList.remove('nd-go-dragging');
  }

  async function assignOrder(orderId, pointValue) {
    if (!canManage || busyOrderId !== null) return;
    const order = orderMap.get(String(orderId));
    if (!order) { feedback = 'Поруџбина није пронађена у учитаним подацима.'; feedbackError = true; render(); return; }
    const nextPoint = pointValue ? Number(pointValue) : null;
    if (nextPoint !== null && !pointMap.has(String(nextPoint))) {
      feedback = 'Изабрани пункт није пронађен.'; feedbackError = true; render(); return;
    }
    if (String(order.punkt_id || '') === String(nextPoint || '')) return;
    busyOrderId = String(orderId);
    feedback = 'Чувам доделу пункта за поруџбину #' + orderId + '…';
    feedbackError = false;
    render();
    try {
      const { data, error } = await client.from('porudzbine').update({ punkt_id: nextPoint }).eq('id', order.id).select('id,punkt_id');
      if (error) throw error;
      const saved = Array.isArray(data) ? data.find(row => String(row.id) === String(order.id)) : null;
      if (!saved || String(saved.punkt_id || '') !== String(nextPoint || '')) throw new Error('База није потврдила доделу пункта.');
      order.punkt_id = saved.punkt_id;
      feedback = 'Поруџбина #' + orderId + ' је сачувана у пункту ' + (nextPoint === null ? '„без пункта“' : '„' + (pointMap.get(String(nextPoint))?.name || ('#' + nextPoint)) + '“') + '.';
      feedbackError = false;
      busyOrderId = null;
    } catch (error) {
      busyOrderId = null;
      feedback = 'Додела није потврђена: ' + (error.message || String(error));
      feedbackError = true;
      render();
      return;
    }
    if (typeof onRefresh === 'function') {
      try { await onRefresh(); }
      catch (error) {
        feedback = 'Пункт је сачуван у бази, али освежавање приказа није успело: ' + (error.message || String(error));
        feedbackError = true;
        render();
      }
    } else render();
  }

  render();
  return { destroy() { root.replaceChildren(); style.remove(); } };
}
