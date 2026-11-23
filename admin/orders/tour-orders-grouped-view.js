/*
 * NARUČI DOMAĆE — GROUPED TOUR ORDERS
 * Version: 1.1.0
 * Updated: 2026-11-23
 * Description: Buyer-integrated order cards, clickable product table rows and order-only operations.
 * Data source: Existing authenticated ADMIN Supabase client and existing order/item/product records.
 */
export function mountTourOrdersGroupedView({ root, client, orders, items, customers, points, products, canManage, onOpenOrder, onRefresh }) {
  if (!root || !client?.from || !Array.isArray(orders) || !Array.isArray(items)) {
    throw new TypeError('Недостају подаци или потврђени ADMIN Supabase клијент.');
  }

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt = value => Number.isFinite(Number(value)) ? Number(value).toLocaleString('sr-RS', { maximumFractionDigits: 3 }) : '—';
  const money = value => Number.isFinite(Number(value)) ? Number(value).toLocaleString('sr-RS', { maximumFractionDigits: 2 }) + ' дин.' : 'Цена није евидентирана';
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
  let busy = false;
  let feedback = '';
  let feedbackError = false;
  let expandedLineId = null;
  let editingLineId = null;
  let editingOrderId = null;
  let statusOrderId = null;

  const statusOptions = [
    ['nova','Нова — чека потврду'],
    ['primljeno','Нова — непрегледана'],
    ['primljena','Прегледана'],
    ['potvrdjena','Потврђена'],
    ['provera','Потребна провера'],
    ['scheduled','Заказана'],
    ['otkazana','Отказана']
  ];
  const statusLabel = value => statusOptions.find(row => row[0] === value)?.[1] || value || 'Статус није наведен';

  function linePresentation(line) {
    const product = line.product_id ? productMap.get(String(line.product_id)) : null;
    const name = product?.name || (line.product_id ? 'Производ није пронађен у каталогу' : 'Неповезана ставка');
    const count = Number(line.package_count);
    const size = Number(line.package_size);
    const packageOk = line.package_count !== null && line.package_count !== undefined &&
      line.package_size !== null && line.package_size !== undefined &&
      Number.isFinite(count) && Number.isFinite(size) && line.package_unit;
    const packageText = packageOk ? fmt(size) + ' ' + esc(line.package_unit) : 'Није унета';
    const totalQty = packageOk ? fmt(count * size) + ' ' + esc(line.package_unit) : '—';
    const unitPrice = line.unit_price == null || line.unit_price === '' ? null : Number(line.unit_price);
    const lineTotal = line.cena_stavke == null || line.cena_stavke === '' ? null : Number(line.cena_stavke);
    const productPrice = product?.price == null || product.price === '' ? null : Number(product.price);
    const displayTotal = Number.isFinite(lineTotal) ? lineTotal : null;
    return { name, packageText, count: Number.isFinite(count) ? count : null, totalQty, unitPrice: Number.isFinite(unitPrice) ? unitPrice : productPrice, lineTotal: displayTotal, packageOk, product };
  }

  function orderCard(order) {
    const lines = linesByOrder.get(String(order.id)) || [];
    const buyer = customerMap.get(String(order.kupac_id)) || {};
    const point = pointMap.get(String(order.punkt_id));
    const phone = order.telefon || buyer.telefon || 'Телефон није наведен';
    const lineRows = lines.length ? lines.map(line => {
      const p = linePresentation(line);
      const opened = expandedLineId === String(line.id);
      const editing = editingLineId === String(line.id);
      const detail = opened ? '<tr class="nd-go-detail-row"><td colspan="5"><div class="nd-go-detail">' +
        '<div class="nd-go-detail-grid"><span>Назив производа<strong>' + esc(p.name) + '</strong></span><span>Цена по паковању<strong>' + (p.unitPrice === null ? 'Није унета' : money(p.unitPrice)) + '</strong></span><span>Вредност ставке<strong>' + (p.lineTotal === null ? 'Није унета' : money(p.lineTotal)) + '</strong></span><span>Укупна количина<strong>' + esc(p.totalQty) + '</strong></span></div>' +
        (editing && canManage ? '<label class="nd-go-edit-count">Број паковања<input type="number" min="0" step="0.001" inputmode="decimal" data-line-count="' + esc(line.id) + '" value="' + esc(p.count ?? '') + '"></label><div class="nd-go-inline-actions"><button type="button" class="nd-go-action-primary" data-save-line="' + esc(line.id) + '">Сачувај ставку</button><button type="button" class="nd-go-action-secondary" data-cancel-line>Откажи</button></div>' : (canManage ? '<button type="button" class="nd-go-action-secondary" data-edit-line="' + esc(line.id) + '">Измени овај производ</button>' : '')) +
        '</div></td></tr>' : '';
      return '<tr class="nd-go-product-row' + (opened ? ' is-open' : '') + '" data-open-line="' + esc(line.id) + '" tabindex="0" role="button" aria-expanded="' + (opened ? 'true' : 'false') + '">' +
        '<td><strong>' + esc(p.name) + '</strong><small class="nd-go-mobile-price">' + (p.lineTotal === null ? 'Цена није унета' : money(p.lineTotal)) + '</small></td>' +
        '<td>' + p.packageText + '</td><td class="nd-go-num">' + (p.count === null ? '—' : fmt(p.count)) + '</td>' +
        '<td class="nd-go-num">' + esc(p.totalQty) + '</td><td class="nd-go-price-cell">' + (p.lineTotal === null ? 'Цена није унета' : money(p.lineTotal)) + '</td></tr>' + detail;
    }).join('') : '<tr><td colspan="5" class="nd-go-empty">Нема ставки у поруџбини.</td></tr>';

    const totalKnown = order.ukupna_cena !== null && order.ukupna_cena !== undefined && order.ukupna_cena !== '' && Number.isFinite(Number(order.ukupna_cena));
    const computedLines = lines.map(line => linePresentation(line).lineTotal);
    const fallbackTotalKnown = computedLines.length > 0 && computedLines.every(value => value !== null);
    const total = totalKnown ? money(order.ukupna_cena) : (fallbackTotalKnown ? money(computedLines.reduce((sum,value)=>sum+value,0)) : 'Није обрачунато');

    const editPanel = editingOrderId === String(order.id) ? '<div class="nd-go-order-editor">' +
      '<label>Телефон купца<input type="tel" inputmode="tel" data-order-phone="' + esc(order.id) + '" value="' + esc(order.telefon || buyer.telefon || '') + '"></label>' +
      '<label>Пункт преузимања<select data-order-point="' + esc(order.id) + '"><option value="">Без пункта</option>' + (points || []).map(item => '<option value="' + esc(item.id) + '"' + (String(order.punkt_id || '') === String(item.id) ? ' selected' : '') + '>' + esc(item.name || ('Пункт ' + item.id)) + '</option>').join('') + '</select></label>' +
      '<div class="nd-go-inline-actions"><button type="button" class="nd-go-action-primary" data-save-order="' + esc(order.id) + '">Сачувај измене</button><button type="button" class="nd-go-action-secondary" data-cancel-order>Откажи</button></div></div>' : '';

    const statusPanel = statusOrderId === String(order.id) ? '<div class="nd-go-status-editor"><label>Нови статус<select data-order-status="' + esc(order.id) + '">' + statusOptions.map(row => '<option value="' + row[0] + '"' + (String(order.status || 'nova') === row[0] ? ' selected' : '') + '>' + row[1] + '</option>').join('') + '</select></label><button type="button" class="nd-go-action-primary" data-save-status="' + esc(order.id) + '">Сачувај статус</button><button type="button" class="nd-go-action-secondary" data-cancel-status>Откажи</button></div>' : '';

    return '<article class="nd-go-order-card nd-go-order-flat" data-order-card="' + esc(order.id) + '">' +
      '<header class="nd-go-flat-head"><div class="nd-go-flat-identity"><strong>' + esc(buyer.ime_prezime || ('Купац · ' + (order.kupac_id ?? '—'))) + '</strong>' +
      '<span class="nd-go-contact"><a href="tel:' + esc(String(phone).replace(/[^+0-9]/g,'')) + '">☎ ' + esc(phone) + '</a><span>⌖ ' + esc(point?.name || 'Без пункта') + '</span></span>' +
      '<small>Поруџбина #' + esc(order.id) + '</small></div><span class="nd-go-status-badge">' + esc(statusLabel(order.status || 'nova')) + '</span>' +
      (canManage ? '<button type="button" class="nd-go-edit-order-top" data-edit-order="' + esc(order.id) + '">Измени</button>' : '') + '</header>' +
      editPanel +
      '<div class="nd-go-table-wrap"><table class="nd-go-table"><thead><tr><th>Производ</th><th>Амбалажа</th><th>Број паковања</th><th>Укупна количина</th><th>Цена</th></tr></thead><tbody>' + lineRows + '</tbody></table></div>' +
      '<div class="nd-go-buyer-total"><span>УКУПНО ЗА НАПЛАТУ</span><strong>' + total + '</strong></div>' +
      '<footer class="nd-go-order-actions">' +
      (canManage ? '<button type="button" class="nd-go-action-primary" data-edit-order="' + esc(order.id) + '">Измени поруџбину</button><button type="button" class="nd-go-action-secondary" data-change-status="' + esc(order.id) + '">Промени статус</button><button type="button" class="nd-go-action-secondary" data-copy-order="' + esc(order.id) + '">Копирај поруџбину</button>' : '') +
      '</footer>' + statusPanel + '</article>';
  }

  function render() {
    rootNode.innerHTML = '<div class="nd-go-intro"><div><h2>Поруџбине</h2><p>Отворена тура · пријем и евиденција поруџбина</p></div><span class="nd-go-count">' + orders.length + ' укупно</span></div>' +
      (feedback ? '<div class="nd-go-feedback ' + (feedbackError ? 'nd-go-error' : '') + '" role="status">' + esc(feedback) + '</div>' : '') +
      '<div class="nd-go-flat-list">' + [...orders].sort((a,b)=>Number(a.id)-Number(b.id)).map(orderCard).join('') + '</div>';
  }

  async function saveOrder(orderId) {
    if (busy || !canManage) return;
    const order = orderMap.get(String(orderId));
    const card = rootNode.querySelector('[data-order-card="' + CSS.escape(String(orderId)) + '"]');
    const phone = card?.querySelector('[data-order-phone]')?.value.trim() || '';
    const pointValue = card?.querySelector('[data-order-point]')?.value || null;
    if (pointValue && !pointMap.has(String(pointValue))) { feedback='Изабрани пункт није пронађен.'; feedbackError=true; render(); return; }
    busy = true; feedback='Чувам измене поруџбине #' + orderId + '…'; feedbackError=false; render();
    try {
      const result = await client.from('porudzbine').update({ telefon: phone || null, punkt_id: pointValue ? Number(pointValue) : null, updated_at: new Date().toISOString() }).eq('id', orderId).select('id,telefon,punkt_id').maybeSingle();
      if (result.error) throw result.error;
      if (!result.data || String(result.data.id)!==String(orderId) || String(result.data.punkt_id || '')!==String(pointValue || '')) throw new Error('База није потврдила измену телефона и пункта.');
      Object.assign(order, result.data);
      editingOrderId=null; busy=false; feedback='Подаци поруџбине #' + orderId + ' су сачувани.'; render();
      if (typeof onRefresh==='function') await onRefresh();
    } catch(error) { busy=false; feedback='Измена није сачувана: '+(error.message||String(error)); feedbackError=true; render(); }
  }

  async function saveStatus(orderId) {
    if (busy || !canManage) return;
    const card=rootNode.querySelector('[data-order-card="' + CSS.escape(String(orderId)) + '"]');
    const value=card?.querySelector('[data-order-status]')?.value;
    if (!statusOptions.some(row=>row[0]===value)) { feedback='Изабрани статус није дозвољен.'; feedbackError=true; render(); return; }
    busy=true; feedback='Чувам статус поруџбине #' + orderId + '…'; feedbackError=false; render();
    try {
      const result=await client.from('porudzbine').update({status:value,updated_at:new Date().toISOString()}).eq('id',orderId).select('id,status').maybeSingle();
      if(result.error)throw result.error;
      if(!result.data||String(result.data.id)!==String(orderId)||result.data.status!==value)throw new Error('База није потврдила нови статус.');
      Object.assign(orderMap.get(String(orderId)),result.data);
      statusOrderId=null;busy=false;feedback='Статус поруџбине #' + orderId + ' је сачуван.';render();
      if(typeof onRefresh==='function')await onRefresh();
    }catch(error){busy=false;feedback='Статус није сачуван: '+(error.message||String(error));feedbackError=true;render();}
  }

  async function saveLine(lineId) {
    if (busy || !canManage) return;
    const line=items.find(row=>String(row.id)===String(lineId));
    const card=line&&rootNode.querySelector('[data-order-card="' + CSS.escape(String(line.porudzbina_id)) + '"]');
    const input=card?.querySelector('[data-line-count="' + CSS.escape(String(lineId)) + '"]');
    const count=Number(input?.value);
    if(!line||!Number.isFinite(count)||count<=0){feedback='Број паковања мора бити већи од нуле.';feedbackError=true;render();return;}
    if(line.unit_price===null||line.unit_price===undefined||line.unit_price===''){feedback='Ова ставка нема сачувану цену по паковању. Количина није промењена.';feedbackError=true;render();return;}
    busy=true;feedback='Чувам изабрану ставку…';feedbackError=false;render();
    try{
      const result=await client.from('stavke_porudzbine').update({package_count:count}).eq('id',lineId).select('id,package_count,package_size,package_unit,unit_price,cena_stavke').maybeSingle();
      if(result.error)throw result.error;
      if(!result.data||Math.abs(Number(result.data.package_count)-count)>0.000001)throw new Error('База није потврдила нови број паковања.');
      Object.assign(line,result.data);
      editingLineId=null;expandedLineId=String(lineId);busy=false;feedback='Ставка је сачувана и проверена у бази.';render();
      if(typeof onRefresh==='function')await onRefresh();
    }catch(error){busy=false;feedback='Ставка није сачувана: '+(error.message||String(error));feedbackError=true;render();}
  }

  function openPointQuickAction(orderId) {
    if (!canManage || busy || !orderMap.has(String(orderId))) return;
    editingOrderId=String(orderId);render();
  }

  rootNode.addEventListener('click', async event => {
    const action=event.target.closest('button');
    if(action){
      const id=action.dataset.editOrder||action.dataset.saveOrder||action.dataset.changeStatus||action.dataset.saveStatus||action.dataset.editLine||action.dataset.saveLine||action.dataset.copyOrder;
      if(action.hasAttribute('data-edit-order')){editingOrderId=String(action.dataset.editOrder);render();return;}
      if(action.hasAttribute('data-save-order')){await saveOrder(action.dataset.saveOrder);return;}
      if(action.hasAttribute('data-change-status')){statusOrderId=String(action.dataset.changeStatus);render();return;}
      if(action.hasAttribute('data-save-status')){await saveStatus(action.dataset.saveStatus);return;}
      if(action.hasAttribute('data-edit-line')){editingLineId=String(action.dataset.editLine);expandedLineId=String(action.dataset.editLine);render();return;}
      if(action.hasAttribute('data-save-line')){await saveLine(action.dataset.saveLine);return;}
      if(action.hasAttribute('data-cancel-line')){editingLineId=null;render();return;}
      if(action.hasAttribute('data-cancel-order')){editingOrderId=null;render();return;}
      if(action.hasAttribute('data-cancel-status')){statusOrderId=null;render();return;}
      if(action.hasAttribute('data-copy-order')){
        const order=orderMap.get(String(action.dataset.copyOrder));
        const buyer=customerMap.get(String(order?.kupac_id))||{};
        const lines=linesByOrder.get(String(order?.id))||[];
        const text=['ПОРУЏБИНА #'+order.id,'КУПАЦ: '+(buyer.ime_prezime||''),'ТЕЛЕФОН: '+(order.telefon||buyer.telefon||''),'ПУНКТ: '+(pointMap.get(String(order.punkt_id))?.name||'Без пункта'),'',
          ...lines.map(line=>{const p=linePresentation(line);return '• '+p.name+' — '+p.count+' × '+p.packageText+' — '+(p.lineTotal===null?'цена није унета':money(p.lineTotal));})].join('\n');
        try{await navigator.clipboard.writeText(text);feedback='Поруџбина је копирана.';feedbackError=false;}catch(_){feedback='Копирање није доступно у овом прегледачу.';feedbackError=true;}render();return;
      }
    }
    const row=event.target.closest('[data-open-line]');
    if(row&&!event.target.closest('button,input,select,a')){
      const id=String(row.dataset.openLine);
      expandedLineId=expandedLineId===id?null:id;
      if(expandedLineId!==id)editingLineId=null;
      render();
    }
  });
  rootNode.addEventListener('keydown',event=>{
    const row=event.target.closest('[data-open-line]');
    if(row&&['Enter',' '].includes(event.key)){event.preventDefault();row.click();}
  });

  render();
  return { destroy() { root.replaceChildren(); } };
}
