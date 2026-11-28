/*
 * NARUČI DOMAĆE — GROUPED TOUR ORDERS
 * Version: 1.3.8
 * Updated: 2026-11-28
 * Description: Order shortage banner, per-line delivery quantity protection, and existing buyer order operations.
 * Data source: Existing authenticated ADMIN Supabase client and existing order/item/product records.
 */
export function mountTourOrdersGroupedView({ root, client, tourId, orders, items, customers, points, products, variants=[], procurementAllocations=[], tourStops=[], canManage, onOpenOrder, onRefresh }) {
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
  const variantMap = new Map((variants || []).map(row => [String(row.id), row]));
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
  let expandedOrderId = null;
  let orderFilter = 'all';
  let shortageFilter = null;

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

  function packageSize(line) { const variant=variantMap.get(String(line.variant_id)); const size=Number(line.package_size)||Number(variant?.package_value)||1; return Number.isFinite(size)&&size>0?size:1; }
  function effectivePackages(line) { const value=line.kolicina_za_isporuku; return value===null||value===undefined||value===''?Number(line.package_count)||0:Math.max(0,Number(value)||0)/packageSize(line); }
  function shortageRows() {
    const demand=new Map(); for(const line of items){const key=String(line.product_id)+'::'+String(line.variant_id);const row=demand.get(key)||{key,productId:line.product_id,variantId:line.variant_id,name:productMap.get(String(line.product_id))?.name||'Производ',variant:variantMap.get(String(line.variant_id))?.name||variantMap.get(String(line.variant_id))?.size_label||'Амбалажа',ordered:0,reduced:0,protected:0,confirmed:0};row.ordered+=Math.max(0,Number(line.package_count)||0);if(line.status_izdavanja==='zadrzi')row.protected+=Math.max(0,Number(line.package_count)||0);row.reduced+=Math.max(0,(Number(line.package_count)||0)-effectivePackages(line));demand.set(key,row)}
    for(const allocation of procurementAllocations||[]){const key=String(allocation.product_id)+'::'+String(allocation.variant_id);const row=demand.get(key);if(row)row.confirmed+=Math.max(0,Number(allocation.potvrdjeno_pakovanja??allocation.broj_pakovanja??0)||0)}
    return [...demand.values()].map(row=>({...row,missing:Math.max(0,row.ordered-row.confirmed),remaining:Math.max(0,row.ordered-row.confirmed-row.reduced)})).filter(row=>row.remaining>0.000001).sort((a,b)=>a.name.localeCompare(b.name,'sr'));
  }
  function chronologicalLines(source) {
    return [...(source||[])].map((line,index)=>({line,index})).sort((a,b)=>{
      const ta=Date.parse(a.line.created_at||a.line.createdAt||a.line.inserted_at||'');
      const tb=Date.parse(b.line.created_at||b.line.createdAt||b.line.inserted_at||'');
      if(Number.isFinite(ta)&&Number.isFinite(tb)&&ta!==tb)return ta-tb;
      const ia=Number(a.line.id),ib=Number(b.line.id);
      if(Number.isFinite(ia)&&Number.isFinite(ib)&&ia!==ib)return ia-ib;
      return a.index-b.index;
    }).map(entry=>entry.line);
  }

  function orderCard(order) {
    const lines = chronologicalLines(linesByOrder.get(String(order.id)) || []);
    const buyer = customerMap.get(String(order.kupac_id)) || {};
    const point = pointMap.get(String(order.punkt_id));
    const phone = order.telefon || buyer.telefon || 'Телефон није наведен';
    const isOpen = expandedOrderId === String(order.id);
    const lineRows = lines.length ? lines.map(line => {
      const p = linePresentation(line);
      const opened = expandedLineId === String(line.id);
      const editing = editingLineId === String(line.id);
      const detail = opened ? '<tr class="nd-go-detail-row"><td colspan="5"><div class="nd-go-detail">' +
        '<div class="nd-go-detail-grid"><span>Назив производа<strong>' + esc(p.name) + '</strong></span><span>Цена по паковању<strong>' + (p.unitPrice === null ? 'Није унета' : money(p.unitPrice)) + '</strong></span><span>Вредност ставке<strong>' + (p.lineTotal === null ? 'Није унета' : money(p.lineTotal)) + '</strong></span><span>Укупна количина<strong>' + esc(p.totalQty) + '</strong></span></div>' +
        (editing && canManage ? '<label class="nd-go-edit-count">Број паковања<input type="number" min="0" step="0.001" inputmode="decimal" data-line-count="' + esc(line.id) + '" value="' + esc(p.count ?? '') + '"></label><div class="nd-go-inline-actions"><button type="button" class="nd-go-action-primary" data-save-line="' + esc(line.id) + '">Сачувај ставку</button><button type="button" class="nd-go-action-secondary" data-cancel-line>Откажи</button></div>' : (canManage ? '<button type="button" class="nd-go-action-secondary" data-edit-line="' + esc(line.id) + '">Измени овај производ</button>' : '')) +
        (canManage ? '<div class="nd-go-shortage-control"><label class="nd-go-edit-count">За испоруку (паковања)<input type="number" min="0" step="1" inputmode="numeric" data-effective-count="'+esc(line.id)+'" value="'+esc(effectivePackages(line))+'"></label><div class="nd-go-inline-actions"><button type="button" class="nd-go-action-primary" data-save-effective="'+esc(line.id)+'">Сачувај количину</button><button type="button" class="nd-go-action-secondary" data-protect-line="'+esc(line.id)+'">'+(line.status_izdavanja==='zadrzi'?'Укини „Не скидај“':'Не скидај · задржи пуну количину')+'</button></div><small>'+(line.status_izdavanja==='zadrzi'?'Ова ставка је заштићена од умањења.':'Оригинална поруџбина остаје непромењена.')+'</small></div>' : '') +
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
    const status = String(order.status || 'nova');
    const editPanel = editingOrderId === String(order.id) ? '<div class="nd-go-order-editor"><label>Телефон купца<input type="tel" inputmode="tel" data-order-phone="' + esc(order.id) + '" value="' + esc(order.telefon || buyer.telefon || '') + '"></label><label>Пункт преузимања<select data-order-point="' + esc(order.id) + '"><option value="">Без пункта</option>' + (points || []).map(item => '<option value="' + esc(item.id) + '"' + (String(order.punkt_id || '') === String(item.id) ? ' selected' : '') + '>' + esc(item.name || ('Пункт ' + item.id)) + '</option>').join('') + '</select></label><div class="nd-go-inline-actions"><button type="button" class="nd-go-action-primary" data-save-order="' + esc(order.id) + '">Сачувај измене</button><button type="button" class="nd-go-action-secondary" data-cancel-order>Откажи</button></div></div>' : '';
    const statusPanel = statusOrderId === String(order.id) ? '<div class="nd-go-status-editor"><label>Нови статус<select data-order-status="' + esc(order.id) + '">' + statusOptions.map(row => '<option value="' + row[0] + '"' + (status === row[0] ? ' selected' : '') + '>' + row[1] + '</option>').join('') + '</select></label><button type="button" class="nd-go-action-primary" data-save-status="' + esc(order.id) + '">Сачувај статус</button><button type="button" class="nd-go-action-secondary" data-cancel-status>Откажи</button></div>' : '';
    return '<article class="nd-go-order-card nd-go-order-flat' + (isOpen ? ' is-expanded' : '') + '" data-order-card="' + esc(order.id) + '">' +
      '<button type="button" class="nd-go-order-summary" data-toggle-order="' + esc(order.id) + '" aria-expanded="' + (isOpen ? 'true' : 'false') + '">' +
      '<span class="nd-go-summary-main"><strong>' + esc(buyer.ime_prezime || ('Купац · ' + (order.kupac_id ?? '—'))) + '</strong><small>' + esc(phone) + ' · ' + esc(point?.name || 'Без пункта') + '</small><small>Поруџбина #' + esc(order.id) + ' · ' + lines.length + ' ставки</small></span>' +
      '<span class="nd-go-summary-side"><span class="nd-go-status-badge" data-status="' + esc(status) + '">' + esc(statusLabel(status)) + '</span><span class="nd-go-summary-chevron" aria-hidden="true">' + (isOpen ? '⌃' : '⌄') + '</span></span></button>' +
      (isOpen ? '<div class="nd-go-order-content">' + editPanel +
      '<div class="nd-go-table-wrap"><table class="nd-go-table"><thead><tr><th>Производ</th><th>Амбалажа</th><th>Број паковања</th><th>Укупна количина</th><th>Цена</th></tr></thead><tbody>' + lineRows + '</tbody></table></div>' +
      '<div class="nd-go-buyer-total"><span>УКУПНО ЗА НАПЛАТУ</span><strong>' + total + '</strong></div>' +
      '<footer class="nd-go-order-actions">' + (canManage ? '<button type="button" class="nd-go-action-primary" data-edit-order="' + esc(order.id) + '">Измени поруџбину</button><button type="button" class="nd-go-action-secondary" data-change-status="' + esc(order.id) + '">Промени статус</button><button type="button" class="nd-go-action-secondary" data-copy-order="' + esc(order.id) + '">Копирај</button><button type="button" class="nd-go-action-danger" data-delete-order="' + esc(order.id) + '">Обриши поруџбину</button>' : '') + '</footer>' + statusPanel + '</div>' : '') + '</article>';
  }

  function render() {
    const orderedStops=[...(tourStops||[])].sort((a,b)=>{const ta=String(a.vreme||'').slice(0,5),tb=String(b.vreme||'').slice(0,5),ra=Number.isFinite(Number(a.redosled))?Number(a.redosled):999999,rb=Number.isFinite(Number(b.redosled))?Number(b.redosled):999999;if(ta&&tb)return ta.localeCompare(tb)||ra-rb;if(ta)return -1;if(tb)return 1;return ra-rb});const pointOrder=new Map(orderedStops.map((stop,index)=>[String(stop.punkt_id),index]));
    const sorted=[...orders].sort((a,b)=>{const pa=pointOrder.has(String(a.punkt_id))?pointOrder.get(String(a.punkt_id)):999999,pb=pointOrder.has(String(b.punkt_id))?pointOrder.get(String(b.punkt_id)):999999;return pa-pb||Number(a.id)-Number(b.id)});
    const visible=sorted.filter(order=>(orderFilter==='all'||(orderFilter==='new'?['nova','primljeno','primljena','provera'].includes(String(order.status||'nova')):['potvrdjena','scheduled'].includes(String(order.status||''))))&&(!shortageFilter||(linesByOrder.get(String(order.id))||[]).some(line=>String(line.product_id)+'::'+String(line.variant_id)===shortageFilter)));
    const grouped=new Map();
    visible.forEach(order=>{const key=String(order.punkt_id??'unassigned');if(!grouped.has(key))grouped.set(key,{point:pointMap.get(key)||null,orders:[]});grouped.get(key).orders.push(order)});
    const totalLines=items.filter(line=>orderMap.has(String(line.porudzbina_id))).length,newCount=sorted.filter(order=>['nova','primljeno','primljena','provera'].includes(String(order.status||'nova'))).length;
    const fmtMoney=value=>Number.isFinite(Number(value))?Number(value).toLocaleString('sr-RS',{maximumFractionDigits:2})+' дин.':'—';
    const lineAmount=line=>{if(line.cena_stavke!==null&&line.cena_stavke!==undefined&&line.cena_stavke!==''&&Number.isFinite(Number(line.cena_stavke)))return Number(line.cena_stavke);const p=linePresentation(line);return p.unitPrice!==null&&p.count!==null?p.unitPrice*p.count:null};
    const phoneFor=order=>{const buyer=customerMap.get(String(order.kupac_id))||{};return String(order.telefon||buyer.telefon||'').trim()};
    const phoneDigits=phone=>{let digits=String(phone||'').replace(/\D/g,'');if(digits.startsWith('00'))digits=digits.slice(2);if(digits.startsWith('0'))digits='381'+digits.slice(1);else if(!digits.startsWith('381')&&digits.length===9)digits='381'+digits;return digits?'+'+digits:''};
    const pointSections=[...grouped.entries()].map(([key,group])=>{
      const pointName=group.point?.name||'Пункт није наведен',stop=(tourStops||[]).find(row=>String(row.punkt_id)===key),time=String(stop?.vreme||'').slice(0,5);
      let pointTotal=0,pointHasUnknown=false;
      const tableRows=group.orders.map(order=>{
        const buyer=customerMap.get(String(order.kupac_id))||{},lines=chronologicalLines(linesByOrder.get(String(order.id))||[]),name=buyer.ime_prezime||('Купац #'+(order.kupac_id??'—'));
        let customerTotal=0,customerUnknown=false;
        const normalized=phoneDigits(phoneFor(order)),viber=normalized?'<button type="button" class="nd-gop-viber" data-viber-phone="'+esc(normalized)+'" aria-label="Отвори Viber за '+esc(name)+'">Viber</button>':'<button type="button" class="nd-gop-viber" disabled title="Телефон купца није евидентиран">Нема броја</button>';
        const customerCell='<tr class="nd-gop-customer-toolbar-row"><td colspan="5"><div class="nd-gop-customer-toolbar"><div class="nd-gop-customer-identity"><strong>'+esc(name)+'</strong><small>Поруџбина #'+esc(order.id)+'</small></div><div class="nd-gop-order-actions"><button type="button" class="nd-gop-order-open" data-open-order="'+esc(order.id)+'">Отвори</button>'+(canManage?'<button type="button" class="nd-gop-edit-order" data-open-order="'+esc(order.id)+'">Измени</button><button type="button" class="nd-gop-delete-order" data-delete-order="'+esc(order.id)+'">Обриши</button>':'')+viber+'</div></div></td></tr>';
        const itemRows=lines.map((line,index)=>{const p=linePresentation(line),amount=lineAmount(line);if(amount===null)customerUnknown=true;else customerTotal+=amount;return '<tr class="nd-gop-line"><td colspan="2"><div class="nd-gop-product-line"><span class="nd-gop-line-number">'+(index+1)+'.</span><div><strong>'+esc(p.name)+'</strong><small>'+esc(p.packageText)+'</small></div></div></td><td class="nd-gop-qty"><strong>'+(p.count===null?'—':fmt(p.count)+' ком')+'</strong><small>('+esc(p.totalQty)+')</small></td><td colspan="2" class="nd-gop-price-line"><span>'+(p.unitPrice===null?'—':fmtMoney(p.unitPrice)+' / пак.')+'</span><strong>→ '+(amount===null?'Цена није унета':fmtMoney(amount))+'</strong></td></tr>'}).join('');
        const orderTotal=order.ukupna_cena!==null&&order.ukupna_cena!==undefined&&order.ukupna_cena!==''&&Number.isFinite(Number(order.ukupna_cena))?Number(order.ukupna_cena):(customerUnknown?null:customerTotal);
        if(orderTotal===null)pointHasUnknown=true;else pointTotal+=orderTotal;
        return customerCell+(itemRows||'<tr><td colspan="5" class="nd-go-empty">Нема ставки у поруџбини.</td></tr>')+'<tr class="nd-gop-customer-total"><td colspan="3">Укупно за '+esc(name)+'</td><td colspan="2" class="nd-gop-amount">'+(orderTotal===null?'Није обрачунато':fmtMoney(orderTotal))+'</td></tr>';
      }).join('');
      const validPointId=/^\d+$/.test(String(key))&&group.point&&String(group.point.id)===String(key);return '<section class="nd-gop-point"><header class="nd-gop-point-head"><div><span>ПУНКТ ДОСТАВЕ</span><h3>'+esc(pointName)+'</h3></div>'+(validPointId?'<label>Време <input type="time" value="'+esc(time)+'" data-point-time="'+esc(key)+'"></label>':'<span class="nd-gop-time-unavailable">Време — пункт није повезан</span>')+'</header><div class="nd-gop-table-wrap"><table class="nd-gop-table"><thead><tr><th colspan="2">Артикал / амбалажа</th><th>Количина</th><th colspan="2">Цена по пак. → износ</th></tr></thead><tbody>'+(tableRows||'<tr><td colspan="5" class="nd-go-empty">Нема поруџбина за овај пункт.</td></tr>')+'</tbody><tfoot><tr><td colspan="3">УКУПНО ПУНКТ '+esc(pointName.toLocaleUpperCase('sr-RS'))+'</td><td colspan="2" class="nd-gop-amount">'+(pointHasUnknown?'Део цена недостаје':fmtMoney(pointTotal))+'</td></tr></tfoot></table></div></section>';
    }).join('');
    const shortage=shortageRows();
    const shortageBanner=shortage.length?'<section class="nd-go-shortage-banner"><strong>Мањкови у набавци</strong><div class="nd-go-shortage-list">'+shortage.map(row=>'<button type="button" data-shortage-filter="'+esc(row.key)+'" class="nd-go-shortage-chip '+(shortageFilter===row.key?'is-active':'')+'"><b>'+esc(row.name)+' · '+esc(row.variant)+'</b><span>Преостало за решавање '+fmt(row.remaining)+' пак. · почетни мањак '+fmt(row.missing)+' пак.</span></button>').join('')+'</div><button type="button" data-clear-shortage-filter>Прикажи све поруџбине</button></section>':'<div class="nd-go-shortage-banner">Нема евидентираних мањкова у набавци.</div>';
    rootNode.innerHTML='<section class="nd-go-workspace-head"><div class="nd-go-heading-copy"><span>АКТИВНА ТУРА</span><h2>Поруџбине по пунктовима</h2><p>Све поруџбине купаца, отворене у једном приказу</p></div><div class="nd-go-metrics"><div><strong>'+orders.length+'</strong><span>Поруџбина</span></div><div><strong>'+totalLines+'</strong><span>Ставки</span></div><div><strong>'+newCount+'</strong><span>За проверу</span></div></div></section>'+shortageBanner+(feedback?'<div class="nd-go-feedback '+(feedbackError?'nd-go-error':'')+'" role="status">'+esc(feedback)+'</div>':'')+'<div class="nd-go-list-toolbar"><strong>Пунктови и поруџбине</strong><div class="nd-go-filters" role="group" aria-label="Филтрирај поруџбине"><button type="button" data-order-filter="all" class="'+(orderFilter==='all'?'is-active':'')+'">Све</button><button type="button" data-order-filter="new" class="'+(orderFilter==='new'?'is-active':'')+'">Нове</button><button type="button" data-order-filter="confirmed" class="'+(orderFilter==='confirmed'?'is-active':'')+'">Потврђене</button></div></div>'+(pointSections||'<div class="nd-go-empty-state">Нема поруџбина у активној тури.</div>');
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

  async function deleteOrder(orderId) {
    if (busy || !canManage) return;
    const order=orderMap.get(String(orderId));
    if(!order){feedback='Поруџбина није пронађена у тренутном приказу.';feedbackError=true;render();return;}
    const buyer=customerMap.get(String(order.kupac_id))||{};
    const lines=linesByOrder.get(String(orderId))||[];
    const buyerName=buyer.ime_prezime||('Купац #'+(order.kupac_id??'—'));
    const approved=window.confirm('Обриши поруџбину #'+orderId+'?\\n\\nКупац: '+buyerName+'\\nСтавки: '+lines.length+'\\n\\nПоруџбина и њене ставке биће трајно уклоњене. Ова радња се не може опозвати.');
    if(!approved)return;
    busy=true;feedback='Бришем поруџбину #'+orderId+'…';feedbackError=false;render();
    try{
      const result=await client.from('porudzbine').delete().eq('id',orderId).select('id').maybeSingle();
      if(result.error)throw result.error;
      if(!result.data||String(result.data.id)!==String(orderId))throw new Error('База није потврдила брисање поруџбине.');
      const index=orders.findIndex(row=>String(row.id)===String(orderId));if(index>=0)orders.splice(index,1);
      for(let i=items.length-1;i>=0;i--){if(String(items[i].porudzbina_id)===String(orderId))items.splice(i,1);}
      orderMap.delete(String(orderId));linesByOrder.delete(String(orderId));
      expandedOrderId=null;editingOrderId=null;statusOrderId=null;expandedLineId=null;editingLineId=null;
      busy=false;feedback='Поруџбина #'+orderId+' је обрисана.';render();
      if(typeof onRefresh==='function')await onRefresh();
    }catch(error){busy=false;feedback='Поруџбина није обрисана: '+(error.message||String(error));feedbackError=true;render();}
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

  async function saveEffective(lineId, protect) {
    if(busy||!canManage)return;const line=items.find(row=>String(row.id)===String(lineId));if(!line)return;
    const card=rootNode.querySelector('[data-order-card="'+CSS.escape(String(line.porudzbina_id))+'"]'),input=card?.querySelector('[data-effective-count="'+CSS.escape(String(lineId))+'"]');
    const count=protect?Math.max(0,Number(line.package_count)||0):Number(input?.value);if(!Number.isFinite(count)||count<0||count>Math.max(0,Number(line.package_count)||0)+0.000001){feedback='Количина за испоруку мора бити између 0 и наручене количине.';feedbackError=true;render();return;}
    const quantity=Number((count*packageSize(line)).toFixed(6)),status=protect?'zadrzi':count===0?'nepreuzeto':(['zadrzi','nepreuzeto'].includes(line.status_izdavanja)?null:line.status_izdavanja||null);
    busy=true;feedback='Чувам количину за испоруку ставке #'+lineId+'…';feedbackError=false;render();try{
      const result=await client.from('stavke_porudzbine').update({kolicina_za_isporuku:quantity,status_izdavanja:status}).eq('id',lineId).eq('tura_id',tourId).select('id,kolicina_za_isporuku,status_izdavanja').maybeSingle();
      if(result.error)throw result.error;if(!result.data||String(result.data.id)!==String(lineId)||Math.abs(Number(result.data.kolicina_za_isporuku)-quantity)>0.000001||String(result.data.status_izdavanja||'')!==String(status||''))throw new Error('База није потврдила количину и статус ставке.');
      Object.assign(line,result.data);busy=false;feedback=protect?'Ставка је заштићена: не скида се купцу.':count===0?'Ставка је постављена на 0 и означена као НЕПРЕУЗЕТО.':'Количина за испоруку је сачувана.';render();if(typeof onRefresh==='function')await onRefresh();
    }catch(error){busy=false;feedback='Измена није сачувана: '+(error.message||String(error));feedbackError=true;render();}
  }

  function openPointQuickAction(orderId) {
    if (!canManage || busy || !orderMap.has(String(orderId))) return;
    editingOrderId=String(orderId);render();
  }

  rootNode.addEventListener('change',async event=>{
    const input=event.target.closest('[data-point-time]');if(!input)return;
    const pointId=input.dataset.pointTime,stop=(tourStops||[]).find(row=>String(row.punkt_id)===String(pointId));
    if(busy){input.value=String(stop?.vreme||'').slice(0,5);return}
    if(!/^\d+$/.test(String(tourId))||!/^\d+$/.test(String(pointId))){feedback='Тура или пункт нема исправан идентификатор.';feedbackError=true;render();return}
    const previous=String(stop?.vreme||'').slice(0,5),value=input.value;
    if(value&&!/^([01]\\d|2[0-3]):[0-5]\\d$/.test(value)){feedback='Изабери исправну сатницу.';feedbackError=true;render();return}
    busy=true;input.disabled=true;feedback='Чувам сатницу пункта…';feedbackError=false;
    try{
      const result=await client.from('tura_punktovi').upsert({tura_id:Number(tourId),punkt_id:Number(pointId),redosled:stop?.redosled??null,aktivan:true,vreme:value||null},{onConflict:'tura_id,punkt_id'}).select('tura_id,punkt_id,redosled,aktivan,vreme').maybeSingle();
      if(result.error)throw result.error;
      if(!result.data)throw new Error('База није потврдила сатницу пункта.');
      if(stop)Object.assign(stop,result.data);else tourStops.push(result.data);
      feedback='Сатница пункта је сачувана.';busy=false;render();if(typeof onRefresh==='function')await onRefresh()
    }catch(error){busy=false;feedback='Сатница није сачувана: '+(error.message||String(error));feedbackError=true;input.disabled=false;input.value=previous;render()}
  });
  rootNode.addEventListener('click', async event => {
    const action=event.target.closest('button');
    if(action){
      if(action.hasAttribute('data-viber-phone')){const phone=action.dataset.viberPhone;if(phone)window.location.href='viber://chat?number='+encodeURIComponent(phone);return;}
      if(action.hasAttribute('data-open-order')){if(typeof onOpenOrder==='function')await onOpenOrder(action.dataset.openOrder);return;}
      if(action.hasAttribute('data-toggle-order')){const id=String(action.dataset.toggleOrder);expandedOrderId=expandedOrderId===id?null:id;editingLineId=null;editingOrderId=null;statusOrderId=null;render();return;}
      if(action.hasAttribute('data-order-filter')){orderFilter=action.dataset.orderFilter;expandedOrderId=null;render();return;}
      if(action.hasAttribute('data-shortage-filter')){shortageFilter=action.dataset.shortageFilter;orderFilter='all';expandedOrderId=null;render();return;}
      if(action.hasAttribute('data-clear-shortage-filter')){shortageFilter=null;render();return;}
      if(action.hasAttribute('data-save-effective')){await saveEffective(action.dataset.saveEffective,false);return;}
      if(action.hasAttribute('data-protect-line')){await saveEffective(action.dataset.protectLine,true);return;}
      const id=action.dataset.editOrder||action.dataset.saveOrder||action.dataset.changeStatus||action.dataset.saveStatus||action.dataset.editLine||action.dataset.saveLine||action.dataset.copyOrder;
      if(action.hasAttribute('data-edit-order')){editingOrderId=String(action.dataset.editOrder);expandedOrderId=String(action.dataset.editOrder);render();return;}
      if(action.hasAttribute('data-save-order')){await saveOrder(action.dataset.saveOrder);return;}
      if(action.hasAttribute('data-delete-order')){await deleteOrder(action.dataset.deleteOrder);return;}
      if(action.hasAttribute('data-change-status')){statusOrderId=String(action.dataset.changeStatus);expandedOrderId=String(action.dataset.changeStatus);render();return;}
      if(action.hasAttribute('data-save-status')){await saveStatus(action.dataset.saveStatus);return;}
      if(action.hasAttribute('data-edit-line')){editingLineId=String(action.dataset.editLine);expandedLineId=String(action.dataset.editLine);expandedOrderId=String(items.find(row=>String(row.id)===String(action.dataset.editLine))?.porudzbina_id||'');render();return;}
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
