/*
 * NARUČI DOMAĆE — TOUR OPERATIONS PANEL
 * Version: 1.2.0
 * Updated: 2026-11-21
 * Description: Displays order prices and adds an RLS-protected open-to-processing tour transition.
 */
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const uniq = (values) => [...new Set(values.filter((value) => value !== null && value !== undefined))];
const fmtDate = (value) => value ? new Date(value + 'T12:00:00').toLocaleDateString('sr-RS') : 'Datum nije naveden';
const fmtQty = (count, size, unit) => {
  const a = Number(count), b = Number(size);
  return Number.isFinite(a) && Number.isFinite(b) ? (a * b).toLocaleString('sr-RS') + ' ' + esc(unit || '') : 'Količina nije dostupna';
};
const fail = (result, label) => { if (result.error) throw new Error(label + ': ' + result.error.message); return result.data || []; };

export async function mountTourOperations({ root, core, tourId, onBack, onOpenProcurement, initialTab='orders' }) {
  if (!root || !core || core.authenticated !== true || !core.client || !tourId) throw new Error('Недостаје потврђено ADMIN језгро или ID туре.');
  const client = core.client;
  const role = core.getState().role;
  const canReadProducts = ['admin','super_admin'].includes(role);
  const canManageOrders = ['admin','super_admin','operator'].includes(role);
  let activeTab = ['orders','products','delivery'].includes(initialTab) ? initialTab : 'orders', disposed = false, loadToken = 0, groupedOrdersView = null, statusBusy = false;
  const state = { tour:null, items:[], orders:[], customers:[], products:[], variants:[], farms:[], itemAllocations:[], procurementAllocations:[], tourStops:[], points:[] };
  const orderSheetPromise = import('/admin/procurement/procurement-order-sheet.js?v=1.0.2').then(mod => mod.createProcurementOrderSheet({
    client,
    getState: () => ({ orders:state.orders, customers:state.customers, points:state.points, productCatalog:state.products }),
    refresh: () => load()
  }));
  root.innerHTML = '<section class="nd-tour-ops"><div class="nd-ops-loading">Учитавам податке из Supabase базе…</div></section>';
  const shell = root.querySelector('.nd-tour-ops');
  const load = async () => {
    const token = ++loadToken;
    shell.querySelector('[data-ops-error]')?.remove();
    shell.querySelector('[data-ops-content]')?.remove();
    const result = await client.from('ture').select('id,naziv,datum,status,dostavljac').eq('id', tourId).maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) throw new Error('Изабрана тура није пронађена или немате дозволу за читање.');
    state.tour = result.data;
    const itemResult = await client.from('stavke_porudzbine').select('id,porudzbina_id,product_id,variant_id,gazdinstvo_id,status,status_stavke,status_izdavanja,package_count,package_size,package_unit,unit_price,cena_stavke,preuzeta_kolicina,isporucena_kolicina,kolicina_za_isporuku,stavka_cekirana').eq('tura_id', tourId);
    state.items = fail(itemResult, 'Ставке поруџбина');
    const orderIds = uniq(state.items.map(x=>x.porudzbina_id));
    const productIds = uniq(state.items.map(x=>x.product_id));
    const variantIds = uniq(state.items.map(x=>x.variant_id));
    const farmIds = uniq(state.items.map(x=>x.gazdinstvo_id));
    const ordersResult = orderIds.length ? await client.from('porudzbine').select('id,kupac_id,status,procurement_status,telefon,punkt_id,adresa_dostave,dostava_obradjena,dostava_obradjena_at,ukupna_cena,dostavljac').in('id',orderIds) : {data:[],error:null};
    state.orders = fail(ordersResult, 'Поруџбине');
    const customerIds = uniq(state.orders.map(x=>x.kupac_id));
    const customerResult = customerIds.length ? await client.from('kupci').select('id,ime_prezime,telefon').in('id',customerIds) : {data:[],error:null};
    state.customers = fail(customerResult, 'Купци');
    // ДОСТАВА: сви постојећи пунктови су доступни за преглед; веза са tura_punktovi није услов.
    const pointsResult = await client.from('punktovi').select('id,name,city,address').order('name',{ascending:true});
    state.points = fail(pointsResult,'Пунктови');
    if (canReadProducts) {
      const procurementResult = await client.from('tura_nabavka_dodele').select('id,tura_id,product_id,variant_id,gazdinstvo_id,broj_pakovanja,nabavna_cena,raspodela_kupcima,preuzeto_pakovanja,naruceno,potvrdjeno_pakovanja').eq('tura_id',tourId);
      const procurementRows = fail(procurementResult,'Набавка');
      const allProductIds = uniq([...productIds,...procurementRows.map(x=>x.product_id)]);
      const allVariantIds = uniq([...variantIds,...procurementRows.map(x=>x.variant_id)]);
      const allFarmIds = uniq([...farmIds,...procurementRows.map(x=>x.gazdinstvo_id)]);
      const [productsResult, variantsResult, itemAllocResult] = await Promise.all([
        allProductIds.length ? client.from('products').select('id,name,gazdinstvo_id').in('id',allProductIds) : Promise.resolve({data:[],error:null}),
        allVariantIds.length ? client.from('product_variants').select('id,product_id,name,size_label,unit,package_value,package_unit,is_active').in('id',allVariantIds) : Promise.resolve({data:[],error:null}),
        state.items.length ? client.from('tura_stavke_raspodela').select('id,stavka_porudzbine_id,gazdinstvo_id,broj_pakovanja').in('stavka_porudzbine_id',state.items.map(x=>x.id)) : Promise.resolve({data:[],error:null})
      ]);
      state.products=fail(productsResult,'Производи'); state.variants=fail(variantsResult,'Варијанте');
      state.itemAllocations=fail(itemAllocResult,'Расподела ставки'); state.procurementAllocations=procurementRows;
      const resolvedFarmIds = uniq([...allFarmIds,...state.products.map(product=>product.gazdinstvo_id)]);
      const farmsResult = resolvedFarmIds.length ? await client.from('gazdinstva').select('id,name,phone').in('id',resolvedFarmIds) : {data:[],error:null};
      state.farms=fail(farmsResult,'Газдинства');
    }
    if (token !== loadToken || disposed) return;
    render();
  };
  const mapBy=(rows,key)=>new Map(rows.map(row=>[row[key],row]));
  function render() {
    const orderMap=mapBy(state.orders,'id'), customerMap=mapBy(state.customers,'id'), productMap=mapBy(state.products,'id'), variantMap=mapBy(state.variants,'id'), farmMap=mapBy(state.farms,'id'), pointMap=mapBy(state.points,'id');
    const title=esc(state.tour.naziv||('Тура #'+tourId));
    let body='';
    if(activeTab==='orders') body='<div data-grouped-orders-root></div>';
    if(activeTab==='products') body=!canReadProducts?'<div class="nd-ops-notice">Ваша ADMIN улога нема SELECT дозволу за производе и варијанте. Приказ је ограничен постојећим RLS правилима.</div>':state.items.length?state.items.map(item=>{const p=productMap.get(item.product_id),v=variantMap.get(item.variant_id),f=farmMap.get(item.gazdinstvo_id)||farmMap.get(p?.gazdinstvo_id);return '<article class="nd-ops-card" data-open-procurement-product="'+esc(item.product_id||'')+'" role="button" tabindex="0" aria-label="Отвори набавку за '+esc(p?.name||'производ')+'"><strong>'+esc(p?.name||'Назив производа није доступан')+'</strong><div>'+esc(v?.name||v?.size_label||'Варијанта није наведена')+'</div><div class="nd-ops-qty">'+fmtQty(item.package_count,item.package_size,item.package_unit)+'</div><small>'+esc(f?.name||'Газдинство није доступно')+'</small></article>'}).join(''):'<div class="nd-ops-empty">Нема производа за приказ.</div>';
    if(activeTab==='allocations') body=!canReadProducts?'<div class="nd-ops-notice">Ваша ADMIN улога нема SELECT дозволу за табеле расподеле. RLS правила нису мењана.</div>':'<h3>Расподела ставки поруџбина</h3>'+ (state.itemAllocations.map(a=>'<article class="nd-ops-card"><strong>Ставка #'+esc(a.stavka_porudzbine_id)+'</strong><div>'+esc(a.broj_pakovanja)+' паковања</div><small>'+esc(farmMap.get(a.gazdinstvo_id)?.name||'Газдинство није доступно')+'</small></article>').join('')||'<div class="nd-ops-empty">Нема редова у tura_stavke_raspodela.</div>')+'<h3>Набавка по производу и газдинству</h3>'+ (state.procurementAllocations.map(a=>'<article class="nd-ops-card"><strong>'+esc(productMap.get(a.product_id)?.name||'Производ није доступан')+'</strong><div>'+esc(a.broj_pakovanja)+' паковања · преузето '+esc(a.preuzeto_pakovanja??0)+'</div><small>'+esc(farmMap.get(a.gazdinstvo_id)?.name||'Газдинство није доступно')+'</small></article>').join('')||'<div class="nd-ops-empty">Нема редова у tura_nabavka_dodele.</div>');
    if(activeTab==='delivery') {
      const packageLabel = (count, item) => {
        const packages = Number(count) || 0, size = Number(item?.package_size);
        if (Number.isFinite(size) && size > 0) return (packages * size).toLocaleString('sr-RS') + ' ' + esc(item.package_unit || '');
        return packages.toLocaleString('sr-RS') + ' пак.';
      };
      const renderDeliveryOrder = order => {
        const customer = customerMap.get(order.kupac_id);
        const orderItems = state.items.filter(item => String(item.porudzbina_id) === String(order.id));
        const packageTotal = orderItems.reduce((sum,item) => sum + (Number(item.package_count) || 0),0);
        const itemRows = canReadProducts ? orderItems.map(item => {
          const product = productMap.get(item.product_id);
          const variant = variantMap.get(item.variant_id);
          const shares = state.itemAllocations.filter(row => String(row.stavka_porudzbine_id) === String(item.id));
          const ordered = Number(item.package_count) || 0;
          const shareRows = shares.map(share => {
            const farm = farmMap.get(share.gazdinstvo_id);
            const allocation = state.procurementAllocations.find(row =>
              String(row.product_id) === String(item.product_id) &&
              String(row.variant_id) === String(item.variant_id) &&
              String(row.gazdinstvo_id) === String(share.gazdinstvo_id)
            );
            const collectedAtFarm = Number(allocation?.preuzeto_pakovanja) || 0;
            const assignedForFarmProduct = state.itemAllocations
              .filter(row => String(row.gazdinstvo_id) === String(share.gazdinstvo_id))
              .filter(row => state.items.some(other =>
                String(other.id) === String(row.stavka_porudzbine_id) &&
                String(other.product_id) === String(item.product_id) &&
                String(other.variant_id) === String(item.variant_id)
              ))
              .reduce((sum,row) => sum + (Number(row.broj_pakovanja) || 0),0);
            const relatedItems = new Set(state.itemAllocations
              .filter(row => String(row.gazdinstvo_id) === String(share.gazdinstvo_id))
              .filter(row => state.items.some(other =>
                String(other.id) === String(row.stavka_porudzbine_id) &&
                String(other.product_id) === String(item.product_id) &&
                String(other.variant_id) === String(item.variant_id)
              ))
              .map(row => String(row.stavka_porudzbine_id)));
            let collectedForItem = null;
            if (relatedItems.size === 1) collectedForItem = Math.min(Number(share.broj_pakovanja) || 0, collectedAtFarm);
            else if (collectedAtFarm >= assignedForFarmProduct) collectedForItem = Number(share.broj_pakovanja) || 0;
            else if (collectedAtFarm === 0) collectedForItem = 0;
            return { farm, share, allocation, collectedAtFarm, assignedForFarmProduct, collectedForItem, relatedItems };
          });
          const allocated = shareRows.reduce((sum,row) => sum + (Number(row.share.broj_pakovanja) || 0),0);
          const allExact = shareRows.length > 0 && shareRows.every(row => row.collectedForItem !== null);
          const collected = allExact ? shareRows.reduce((sum,row) => sum + row.collectedForItem,0) : null;
          const missing = collected === null ? null : Math.max(0, ordered - collected);
          const status = !shares.length ? 'Није додељено газдинству' : collected === null ? 'Део преузимања није могуће приписати купцу' : missing === 0 ? 'Преузето' : collected === 0 ? 'Није преузето' : 'Делимично преузето';
          const statusClass = collected === null || !shares.length ? 'neutral' : missing === 0 ? 'complete' : collected === 0 ? 'missing' : 'partial';
          const farmLines = shareRows.length ? shareRows.map(row => {
            const farmName = row.farm?.name || ('Газдинство #' + row.share.gazdinstvo_id);
            if (row.collectedForItem === null) return '<small>' + esc(farmName) + ': додељено ' + packageLabel(row.share.broj_pakovanja,item) + ' · газдинство је укупно преузело ' + packageLabel(row.collectedAtFarm,item) + ' од ' + packageLabel(row.assignedForFarmProduct,item) + ' за ову амбалажу; количина по купцу није раздвојена</small>';
            return '<small>' + esc(farmName) + ': додељено ' + packageLabel(row.share.broj_pakovanja,item) + ' · стварно преузето ' + packageLabel(row.collectedForItem,item) + '</small>';
          }).join('') : '<small>Није додељено ниједном газдинству · преузето 0</small>';
          return '<div class="nd-ops-delivery-item"><div class="nd-ops-delivery-item-head"><strong>' + esc(product?.name || 'Производ није доступан') + '</strong><span class="nd-ops-delivery-status ' + statusClass + '">' + esc(status) + '</span></div><div class="nd-ops-delivery-variant">' + esc(variant?.name || variant?.size_label || 'Основна варијанта') + '</div><div class="nd-ops-delivery-metrics"><span>Наручено <b>' + packageLabel(ordered,item) + '</b></span><span>Преузето <b>' + (collected === null ? 'није раздвојено' : packageLabel(collected,item)) + '</b></span><span>Недостаје <b>' + (missing === null ? 'није утврђено по купцу' : packageLabel(missing,item)) + '</b></span></div><div class="nd-ops-delivery-farms">' + farmLines + '</div></div>';
        }).join('') : '';
        return '<div class="nd-ops-delivery-order"><strong>' + esc(customer?.ime_prezime || ('Купац #' + (order.kupac_id ?? '—'))) + '</strong><div>Поруџбина #' + esc(order.id) + ' · ' + orderItems.length + ' ставки · ' + packageTotal.toLocaleString('sr-RS') + ' паковања</div>' + (customer?.telefon || order.telefon ? '<small>Телефон: ' + esc(customer?.telefon || order.telefon) + '</small>' : '') + (order.adresa_dostave ? '<small>Адреса: ' + esc(order.adresa_dostave) + '</small>' : '') + (canReadProducts ? '<div class="nd-ops-delivery-items">' + (itemRows || '<small>У поруџбини нема ставки производа.</small>') + '</div>' : '<small>Детаљи производа нису доступни за ову ADMIN улогу.</small>') + '</div>';
      };
      const pointSections = state.points.map(point => {
        const pointOrders = state.orders.filter(order => String(order.punkt_id ?? '') === String(point.id));
        if (!pointOrders.length) return '';
        const orderRows = pointOrders.map(renderDeliveryOrder).join('');
        return '<article class="nd-ops-card nd-ops-delivery-point"><strong>'+esc(point.name||('Пункт #'+point.id))+'</strong><div>'+esc([point.city,point.address].filter(Boolean).join(' · '))+'</div><small>'+pointOrders.length+' поруџбина</small>'+orderRows+'</article>';
      }).join('');
      const assignedPointIds = new Set(state.points.map(point => String(point.id)));
      const unassignedOrders = state.orders.filter(order => !order.punkt_id || !assignedPointIds.has(String(order.punkt_id)));
      const unassignedSection = unassignedOrders.length ? '<article class="nd-ops-card nd-ops-delivery-point"><strong>Поруџбине без препознатог пункта</strong><small>'+unassignedOrders.length+' поруџбина</small>'+unassignedOrders.map(order => renderDeliveryOrder(order) + (order.punkt_id ? '<small>Сачувани ID пункта: '+esc(order.punkt_id)+'</small>' : '<small>Пункт није изабран у поруџбини.</small>')).join('')+'</article>' : '';
      body = pointSections + unassignedSection || '<div class="nd-ops-empty">Нема пунктова ни поруџбина за приказ.</div>';
    }
    if(groupedOrdersView){groupedOrdersView.destroy();groupedOrdersView=null;}
    shell.innerHTML='<header class="nd-ops-head"><div><small>ОПЕРАТИВНИ ПРЕГЛЕД · #'+esc(tourId)+'</small><h1>'+title+'</h1><p>'+fmtDate(state.tour.datum)+' · '+esc(String(state.tour.status||'').toUpperCase())+'</p><div class="nd-ops-stats"><span>'+state.orders.length+' поруџбина</span><span>'+state.items.length+' ставки</span><span>'+state.customers.length+' купаца</span></div>'+(state.tour.status==='open'&&['admin','super_admin'].includes(role)?'<button type="button" data-tour-processing '+(statusBusy?'disabled':'')+'>'+(statusBusy?'Пребацујем…':'Затвори пријем · пребаци у обраду')+'</button>':'')+'</div><button type="button" data-back>← Назад</button></header><section class="nd-ops-content" data-ops-content>'+body+'</section><footer class="nd-ops-foot"><span>Само читање · Подаци из Supabase</span><button type="button" data-refresh>Освежи</button></footer>';
    shell.querySelector('[data-back]').addEventListener('click',onBack);
    shell.querySelector('[data-tour-processing]')?.addEventListener('click', async event => {
      const button = event.currentTarget;
      if (statusBusy || state.tour.status !== 'open' || !['admin','super_admin'].includes(role)) return;
      statusBusy = true; button.disabled = true; button.textContent = 'Пребацујем…';
      try {
        const {data,error} = await client.from('ture').update({status:'processing'}).eq('id',tourId).eq('status','open').select('id,status').maybeSingle();
        if (error) throw error;
        if (!data || data.status !== 'processing') throw new Error('База није потврдила промену статуса. Освежи туру и провери тренутно стање.');
        state.tour.status = data.status;
        statusBusy = false;
        await load();
      } catch (error) { statusBusy = false; showError(error); }
    });
    if(activeTab==='orders'){
      import('./orders/tour-orders-grouped-view.js?v=1.0.5').then(mod=>{
        if(disposed || activeTab!=='orders') return;
        const target=shell.querySelector('[data-grouped-orders-root]');
        if(!target) return;
        groupedOrdersView=mod.mountTourOrdersGroupedView({root:target,client,orders:state.orders,items:state.items,customers:state.customers,points:state.points,products:state.products,canManage:canManageOrders,onOpenOrder:async orderId=>{try{const sheet=await orderSheetPromise;await sheet.open(orderId)}catch(error){showError(error)}},onRefresh:()=>load()});
      }).catch(showError);
    }
    shell.querySelectorAll('[data-open-order]').forEach(button=>button.addEventListener('click',async()=>{
      if(button.disabled)return;
      button.disabled=true;
      try { const sheet=await orderSheetPromise; await sheet.open(button.dataset.openOrder); }
      catch(error) { button.disabled=false; showError(error); }
    }));
    shell.querySelectorAll('[data-open-procurement-product]').forEach(card=>{
      const open=()=>{const productId=card.dataset.openProcurementProduct;if(productId)onOpenProcurement?.(productId);};
      card.addEventListener('click',open);
      card.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();open();}});
    });
    shell.querySelector('[data-refresh]').addEventListener('click',async e=>{e.currentTarget.disabled=true;try{await load()}catch(error){showError(error)}finally{if(e.currentTarget)e.currentTarget.disabled=false}});
  }
  function showError(error){shell.innerHTML='<div class="nd-ops-error"><strong>Подаци нису учитани</strong><p>'+esc(error.message||String(error))+'</p><button type="button" data-back>Назад</button></div>';shell.querySelector('[data-back]').addEventListener('click',onBack)}
  try { await load(); } catch(error) { showError(error); }
  return { destroy(){disposed=true;loadToken++;if(groupedOrdersView)groupedOrdersView.destroy();orderSheetPromise.then(sheet=>sheet.destroy()).catch(()=>{});root.replaceChildren();} };
}
