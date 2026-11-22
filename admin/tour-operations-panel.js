/*
 * NARUČI DOMAĆE — TOUR OPERATIONS PANEL
 * Version: 1.5.9
 * Updated: 2026-11-22
 * Description: Reconciles customer-level delivery quantities from the approved pickup JSON without changing original orders.
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
  let activeTab = ['orders','products','delivery'].includes(initialTab) ? initialTab : 'orders', returnFromReport='orders', disposed = false, loadToken = 0, groupedOrdersView = null, statusBusy = false, deliveryBusy = false, selectedDeliveryPointId = null;
  let calculatorExpression='0', calculatorJustEvaluated=false;
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
    if (result.data.status !== 'processing') throw new Error('Достава је доступна искључиво за туру која је у статусу обраде.');
    state.tour = result.data;
    const itemResult = await client.from('stavke_porudzbine').select('id,porudzbina_id,product_id,variant_id,gazdinstvo_id,status,status_stavke,status_izdavanja,package_count,package_size,package_unit,unit_price,cena_stavke,preuzeta_kolicina,isporucena_kolicina,kolicina_za_isporuku,stavka_cekirana').eq('tura_id', tourId);
    state.items = fail(itemResult, 'Ставке поруџбина');
    const orderIds = uniq(state.items.map(x=>x.porudzbina_id));
    const productIds = uniq(state.items.map(x=>x.product_id));
    const variantIds = uniq(state.items.map(x=>x.variant_id));
    const farmIds = uniq(state.items.map(x=>x.gazdinstvo_id));
    const ordersResult = orderIds.length ? await client.from('porudzbine').select('id,kupac_id,status,procurement_status,telefon,punkt_id,adresa_dostave,dostava_obradjena,dostava_obradjena_at,ukupna_cena,naplaceno,dostavljac').in('id',orderIds) : {data:[],error:null};
    state.orders = fail(ordersResult, 'Поруџбине');
    const customerIds = uniq(state.orders.map(x=>x.kupac_id));
    const customerResult = customerIds.length ? await client.from('kupci').select('id,ime_prezime,telefon').in('id',customerIds) : {data:[],error:null};
    state.customers = fail(customerResult, 'Купци');
    // ДОСТАВА: сви постојећи пунктови су доступни за преглед; веза са tura_punktovi није услов.
    const [pointsResult, tourStopsResult] = await Promise.all([
      client.from('punktovi').select('id,name,city,address,sort_order').order('sort_order',{ascending:true}),
      client.from('tura_punktovi').select('punkt_id,redosled,aktivan,vreme').eq('tura_id',tourId).eq('aktivan',true).order('redosled',{ascending:true})
    ]);
    state.points = fail(pointsResult,'Пунктови');
    state.tourStops = fail(tourStopsResult,'Редослед пунктова');
    if(state.tourStops.length){
      const routeOrder=new Map(state.tourStops.map((stop,index)=>[String(stop.punkt_id),Number.isFinite(Number(stop.redosled))?Number(stop.redosled):index]));
      state.points.sort((a,b)=>{
        const av=routeOrder.has(String(a.id))?routeOrder.get(String(a.id)):Number.MAX_SAFE_INTEGER;
        const bv=routeOrder.has(String(b.id))?routeOrder.get(String(b.id)):Number.MAX_SAFE_INTEGER;
        return av-bv || (Number(a.sort_order)||0)-(Number(b.sort_order)||0);
      });
    }
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
  /* КАЛКУЛАТОР ДОСТАВЕ — САМОСТАЛАН ОБРАЧУН, БЕЗ УПИСА У БАЗУ */
  function calculateDeliveryExpression(source) {
    const text=String(source||'').replace(/,/g,'.').replace(/×/g,'*').replace(/÷/g,'/').replace(/−/g,'-').replace(/\s+/g,'');
    const tokens=text.match(/(?:\d+(?:\.\d*)?|\.\d+)|[()+\-*/]/g)||[];
    if(!tokens.length||tokens.join('')!==text) throw new Error('Неисправан израз');
    let i=0;
    function factor(){const t=tokens[i];if(t==='+'){i++;return factor();}if(t==='-'){i++;return -factor();}if(t==='('){i++;const v=expression();if(tokens[i]!==')')throw new Error('Недостаје заграда');i++;return v;}if(t===undefined||t===')')throw new Error('Недостаје број');i++;return Number(t);}
    function term(){let v=factor();while(tokens[i]==='*'||tokens[i]==='/'){const op=tokens[i++],r=factor();if(op==='/'&&r===0)throw new Error('Дељење нулом');v=op==='*'?v*r:v/r;}return v;}
    function expression(){let v=term();while(tokens[i]==='+'||tokens[i]==='-'){const op=tokens[i++],r=term();v=op==='+'?v+r:v-r;}return v;}
    const result=expression();if(i!==tokens.length||!Number.isFinite(result))throw new Error('Неисправан израз');return result;
  }
  const mapBy=(rows,key)=>new Map(rows.map(row=>[row[key],row]));
  function render() {
    const orderMap=mapBy(state.orders,'id'), customerMap=mapBy(state.customers,'id'), productMap=mapBy(state.products,'id'), variantMap=mapBy(state.variants,'id'), farmMap=mapBy(state.farms,'id'), pointMap=mapBy(state.points,'id');
    const title=esc(state.tour.naziv||('Тура #'+tourId));
    let body='';
    let deliverySaveGroups = new Map();
    let updateDeliveryAmounts = null;
    if(activeTab==='orders') body='<div data-grouped-orders-root></div>';
    if(activeTab==='products') body=!canReadProducts?'<div class="nd-ops-notice">Ваша ADMIN улога нема SELECT дозволу за производе и варијанте. Приказ је ограничен постојећим RLS правилима.</div>':state.items.length?state.items.map(item=>{const p=productMap.get(item.product_id),v=variantMap.get(item.variant_id),f=farmMap.get(item.gazdinstvo_id)||farmMap.get(p?.gazdinstvo_id);return '<article class="nd-ops-card" data-open-procurement-product="'+esc(item.product_id||'')+'" role="button" tabindex="0" aria-label="Отвори набавку за '+esc(p?.name||'производ')+'"><strong>'+esc(p?.name||'Назив производа није доступан')+'</strong><div>'+esc(v?.name||v?.size_label||'Варијанта није наведена')+'</div><div class="nd-ops-qty">'+fmtQty(item.package_count,item.package_size,item.package_unit)+'</div><small>'+esc(f?.name||'Газдинство није доступно')+'</small></article>'}).join(''):'<div class="nd-ops-empty">Нема производа за приказ.</div>';
    if(activeTab==='allocations') body=!canReadProducts?'<div class="nd-ops-notice">Ваша ADMIN улога нема SELECT дозволу за табеле расподеле. RLS правила нису мењана.</div>':'<h3>Расподела ставки поруџбина</h3>'+ (state.itemAllocations.map(a=>'<article class="nd-ops-card"><strong>Ставка #'+esc(a.stavka_porudzbine_id)+'</strong><div>'+esc(a.broj_pakovanja)+' паковања</div><small>'+esc(farmMap.get(a.gazdinstvo_id)?.name||'Газдинство није доступно')+'</small></article>').join('')||'<div class="nd-ops-empty">Нема редова у tura_stavke_raspodela.</div>')+'<h3>Набавка по производу и газдинству</h3>'+ (state.procurementAllocations.map(a=>'<article class="nd-ops-card"><strong>'+esc(productMap.get(a.product_id)?.name||'Производ није доступан')+'</strong><div>'+esc(a.broj_pakovanja)+' паковања · преузето '+esc(a.preuzeto_pakovanja??0)+'</div><small>'+esc(farmMap.get(a.gazdinstvo_id)?.name||'Газдинство није доступно')+'</small></article>').join('')||'<div class="nd-ops-empty">Нема редова у tura_nabavka_dodele.</div>');
    if(activeTab==='report') {
      const money=value=>value===null||value===undefined?'Није обрачунато':Number(value).toLocaleString('sr-RS',{minimumFractionDigits:0,maximumFractionDigits:2})+' дин.';
      const qty=value=>Number(value||0).toLocaleString('sr-RS',{maximumFractionDigits:3});
      const lineSale=item=>{
        if(item.cena_stavke!==null&&item.cena_stavke!==undefined&&item.cena_stavke!==''&&Number.isFinite(Number(item.cena_stavke)))return Number(item.cena_stavke);
        if(item.unit_price!==null&&item.unit_price!==undefined&&item.unit_price!==''&&item.package_count!==null&&item.package_count!==undefined&&Number.isFinite(Number(item.unit_price))&&Number.isFinite(Number(item.package_count)))return Number(item.unit_price)*Number(item.package_count);
        return null;
      };
      const productName=item=>productMap.get(item.product_id)?.name||'Производ није наведен';
      const variantName=item=>{const v=variantMap.get(item.variant_id);return v?.name||v?.size_label||'Варијанта није наведена';};
      let sales=0,salesMissing=0;
      const salesByCustomer=new Map(),salesByProduct=new Map(),salesByPoint=new Map();
      for(const item of state.items){
        const value=lineSale(item),order=orderMap.get(item.porudzbina_id);
        if(value===null){salesMissing++;continue;} sales+=value;
        const customer=customerMap.get(order?.kupac_id)?.ime_prezime||('Купац #'+(order?.kupac_id??'—'));
        salesByCustomer.set(customer,(salesByCustomer.get(customer)||0)+value);
        const point=pointMap.get(order?.punkt_id)?.name||'Пункт није наведен';
        salesByPoint.set(point,(salesByPoint.get(point)||0)+value);
        const key=String(item.product_id)+'::'+String(item.variant_id);
        const old=salesByProduct.get(key)||{name:productName(item),variant:variantName(item),quantity:0,value:0};
        old.quantity+=Number(item.package_count)||0;old.value+=value;salesByProduct.set(key,old);
      }
      let purchase=0,purchaseMissing=0,pickedPackages=0;
      const purchaseByFarm=new Map(),purchaseByProduct=new Map();
      for(const row of state.procurementAllocations){
        const picked=Number(row.preuzeto_pakovanja);
        if(!Number.isFinite(picked)||picked<=0)continue;
        pickedPackages+=picked;
        const farm=farmMap.get(row.gazdinstvo_id)?.name||('Газдинство #'+row.gazdinstvo_id);
        const product=productMap.get(row.product_id)?.name||'Производ није наведен';
        const variant=variantMap.get(row.variant_id)?.name||variantMap.get(row.variant_id)?.size_label||'Варијанта није наведена';
        const key=String(row.product_id)+'::'+String(row.variant_id);
        const oldProduct=purchaseByProduct.get(key)||{name:product,variant,quantity:0,cost:0,known:true};
        oldProduct.quantity+=picked;
        const farmRow=purchaseByFarm.get(farm)||{quantity:0,cost:0,known:true,lines:0};
        farmRow.quantity+=picked;farmRow.lines++;
        if(row.nabavna_cena===null||row.nabavna_cena===undefined||row.nabavna_cena===''||!Number.isFinite(Number(row.nabavna_cena))){
          purchaseMissing++;farmRow.known=false;oldProduct.known=false;
        }else{
          const cost=picked*Number(row.nabavna_cena);purchase+=cost;farmRow.cost+=cost;oldProduct.cost+=cost;
        }
        purchaseByFarm.set(farm,farmRow);purchaseByProduct.set(key,oldProduct);
      }
      const hasProcurement=state.procurementAllocations.length>0;
      const purchaseKnown=hasProcurement;
      const salesKnown=true;
      const marginKnown=hasProcurement;
      const margin=marginKnown?sales-purchase:null;
      const marginPercent=marginKnown&&sales!==0?(margin/sales)*100:null;
      let paid=0,paidKnown=true,receivable=0,receivableKnown=true;
      for(const order of state.orders){
        const orderItems=state.items.filter(item=>String(item.porudzbina_id)===String(order.id));
        const orderValue=orderItems.reduce((sum,item)=>sum+(lineSale(item)??0),0);
        /* Ставке без продајне цене се прескачу; остале ставке остају у обрачуну. */
        const paidValue=order.naplaceno;
        if(paidValue===null||paidValue===undefined||paidValue===''||!Number.isFinite(Number(paidValue)))paidKnown=false;
        else paid+=Number(paidValue);
        if(orderItems.every(item=>lineSale(item)!==null))receivable+=Math.max(0,orderValue-(Number(paidValue)||0));
      }
      const missingCount=purchaseMissing+salesMissing;
      const rows=(map,renderRow)=>[...map.entries()].sort((a,b)=>Number(b[1])-Number(a[1])).map(([name,row])=>renderRow(name,row)).join('')||'<div class="nd-report-empty">Нема евидентираних ставки.</div>';
      const purchaseCards=[...purchaseByFarm.entries()].map(([name,row])=>'<article class="nd-report-row"><div><strong>'+esc(name)+'</strong><small>'+qty(row.quantity)+' преузетих паковања · '+row.lines+' ставки</small></div><b>'+money(row.cost)+'</b></article>').join('')||'<div class="nd-report-empty">Нема евидентиране набавке за ову туру.</div>';
      const customerCards=rows(salesByCustomer,(name,value)=>'<article class="nd-report-row"><div><strong>'+esc(name)+'</strong><small>Вредност поруџбина</small></div><b>'+money(value)+'</b></article>');
      const pointCards=rows(salesByPoint,(name,value)=>'<article class="nd-report-row"><div><strong>'+esc(name)+'</strong><small>Продајна вредност</small></div><b>'+money(value)+'</b></article>');
      const productCards=[...salesByProduct.entries()].map(([key,row])=>{const cost=purchaseByProduct.get(key);const profit=cost?.known&&row.value!==null?row.value-cost.cost:null;return '<article class="nd-report-product"><div><strong>'+esc(row.name)+'</strong><small>'+esc(row.variant)+' · '+qty(row.quantity)+' паковања</small></div><div><span>Продаја</span><b>'+money(row.value)+'</b></div><div><span>Набавка</span><b>'+money(cost?cost.cost:null)+'</b></div><div><span>Разлика</span><b>'+money(profit)+'</b></div></article>';}).join('')||'<div class="nd-report-empty">Нема производа за анализу.</div>';
      body='<section class="nd-report-page"><header class="nd-report-title"><div><small>КОМПЛЕТАН ФИНАНСИЈСКИ ИЗВЕШТАЈ · ТУРА #'+esc(tourId)+'</small><h2>'+title+'</h2><p>'+fmtDate(state.tour.datum)+' · Статус: '+esc(String(state.tour.status||'').toUpperCase())+'</p></div><button type="button" data-report-back>← Назад у оперативу</button></header>'+
        '<div class="nd-report-print"><button type="button" data-report-print>Штампај / сачувај као PDF</button></div><div class="nd-report-kpis"><article><small>Укупна набавка</small><strong>'+money(purchaseKnown?purchase:null)+'</strong><span>'+qty(pickedPackages)+' преузетих паковања</span></article><article><small>Укупна продаја</small><strong>'+money(sales)+'</strong><span>'+state.orders.length+' поруџбина</span></article><article><small>Разлика · бруто</small><strong>'+money(margin)+'</strong><span>'+(marginPercent===null?'Маржа није обрачуната':marginPercent.toLocaleString('sr-RS',{maximumFractionDigits:2})+'% од продаје')+'</span></article></div>'+
        '<div class="nd-report-notice '+(missingCount?'is-warning':'')+'"><strong>'+(missingCount?'Обрачун није потпун':'Обрачун цена је потпун')+'</strong><span>'+(hasProcurement?purchaseMissing+' ставки набавке без цене':'Набавка није евидентирана')+' · '+salesMissing+' ставки продаје без цене. Разлика је приказана само када су обе стране потпуне.</span></div>'+
        '<section class="nd-report-section"><h3>Набавка по газдинствима</h3>'+purchaseCards+'</section>'+
        '<section class="nd-report-section"><h3>Продаја по купцима</h3>'+customerCards+'</section>'+
        '<section class="nd-report-section"><h3>Продаја по пунктовима</h3>'+pointCards+'</section>'+
        '<section class="nd-report-section"><h3>Наплата</h3><article class="nd-report-row"><div><strong>Наплаћено</strong><small>Збир евидентираних уплата по поруџбинама</small></div><b>'+money(paidKnown?paid:null)+'</b></article><article class="nd-report-row"><div><strong>Преостало за наплату</strong><small>Вредност поруџбина умањена за евидентирану наплату</small></div><b>'+money(paidKnown?receivable:null)+'</b></article></section>'+
        '<section class="nd-report-section"><h3>Резултат по производима</h3>'+productCards+'</section>'+
        '<footer class="nd-report-foot">Извор: евиденција ставki поруџбина и набавка активне туре. Бруто разлика не укључује доставу, гориво, рад и друге режијске трошкове. Извештај је информативан и не мења податке.</footer></section>';
    }
    if(activeTab==='delivery') {
      /* МОДУЛ ДОСТАВА — КОМПАКТНО ПО КУПЦУ, СА ПОТВРЂЕНОМ ИСПОРУКОМ */
      const money=value=>value===null||value===undefined||value===''?'Није доступно':
        Number.isFinite(Number(value))?Number(value).toLocaleString('sr-RS',{minimumFractionDigits:0,maximumFractionDigits:2})+' дин.':'Није доступно';
      const hasNumber=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));
      const packageCountLabel=count=>Number(count||0).toLocaleString('sr-RS',{maximumFractionDigits:3})+' пак.';
      const packageAmountLabel=(count,size,unit)=>{const amount=Number(count)*Number(size);return Number.isFinite(amount)?amount.toLocaleString('sr-RS',{maximumFractionDigits:3})+' '+esc(unit||''):'—'};
      const itemById=new Map(state.items.map(item=>[String(item.id),item]));
      const pickupByItem=new Map(),invalidItemIds=new Set(),invalidProductPairs=new Set();
      const productPair=row=>String(row.product_id??'')+'::'+String(row.variant_id??'');
      deliverySaveGroups=new Map();

      for(const allocation of state.procurementAllocations) {
        const pair=productPair(allocation);
        let entries=allocation.raspodela_kupcima;
        if(typeof entries==='string'){try{entries=entries.trim()?JSON.parse(entries):[]}catch(_){entries=null}}
        if(entries==null)entries=[];
        if(!Array.isArray(entries)){invalidProductPairs.add(pair);continue}
        const normalized=[];
        for(const entry of entries){
          const itemId=entry?.stavka_porudzbine_id,quantity=Number(entry?.preuzeto_pakovanja);
          if(itemId===null||itemId===undefined||!Number.isFinite(quantity)||quantity<0){invalidProductPairs.add(pair);continue}
          const item=itemById.get(String(itemId));
          if(!item||String(item.product_id??'')!==String(allocation.product_id??'')||String(item.variant_id??'')!==String(allocation.variant_id??'')){
            if(item)invalidItemIds.add(String(item.id));else invalidProductPairs.add(pair);
            continue;
          }
          normalized.push({item,quantity,allocation});
        }
        const assignedTotal=normalized.reduce((sum,row)=>sum+row.quantity,0);
        const pickedAtFarm=Math.max(0,Number(allocation.preuzeto_pakovanja)||0),exceedsPickup=assignedTotal>pickedAtFarm;
        for(const row of normalized){
          const key=String(row.item.id);
          if(!pickupByItem.has(key))pickupByItem.set(key,[]);
          pickupByItem.get(key).push({quantity:row.quantity,allocation,pickedAtFarm,exceedsPickup});
          if(exceedsPickup)invalidItemIds.add(key);
        }
      }

      const lineSaleValue=item=>{
        if(hasNumber(item.cena_stavke))return Number(item.cena_stavke);
        if(hasNumber(item.unit_price)&&hasNumber(item.package_count))return Number(item.unit_price)*Number(item.package_count);
        return null;
      };
      const salePricePerPackage=item=>{
        const count=Number(item.package_count),total=lineSaleValue(item);
        if(total!==null&&Number.isFinite(count)&&count>0)return total/count;
        return hasNumber(item.unit_price)?Number(item.unit_price):null;
      };
      let purchaseTotal=0,purchaseKnown=true;
      for(const row of state.procurementAllocations){
        const picked=Math.max(0,Number(row.preuzeto_pakovanja)||0);
        if(picked<=0)continue;
        if(!hasNumber(row.nabavna_cena))purchaseKnown=false;else purchaseTotal+=picked*Number(row.nabavna_cena);
      }
      let orderedSaleTotal=0,orderedSaleKnown=true;
      for(const item of state.items){const value=lineSaleValue(item);if(value===null)orderedSaleKnown=false;else orderedSaleTotal+=value}
      const activeOrders=state.orders.filter(order=>order.dostava_obradjena!==true);
      const completedCount=state.orders.filter(order=>order.dostava_obradjena===true).length;
      const activeCustomerIds=new Set(activeOrders.map(order=>String(order.kupac_id??'unknown-'+order.id)));
      let chargeTotal=0,chargeKnown=true;
      for(const item of state.items){
        const order=orderMap.get(item.porudzbina_id),size=Number(item.package_size);
        let packages=0,invalid=false;
        if(item.stavka_cekirana===true&&hasNumber(item.isporucena_kolicina)&&Number(item.isporucena_kolicina)>0){
          if(Number.isFinite(size)&&size>0)packages=Number(item.isporucena_kolicina)/size;else invalid=true;
        }else if(order?.dostava_obradjena!==true){
          const pickup=(pickupByItem.get(String(item.id))||[]).reduce((sum,row)=>sum+row.quantity,0);
          const ordered=Math.max(0,Number(item.package_count)||0);
          packages=Math.min(ordered,pickup);
          if(invalidItemIds.has(String(item.id))||invalidProductPairs.has(productPair(item))||pickup>ordered+0.000001)invalid=true;
        }
        if(invalid){chargeKnown=false;continue}
        if(packages>0){if(!Number.isFinite(size)||size<=0)chargeKnown=false;else {const price=salePricePerPackage(item);if(price===null)chargeKnown=false;else chargeTotal+=packages*price}}
      }
      const summary='<section class="nd-ops-delivery-summary" aria-label="Финансијски преглед туре">'+
        '<div><small>Укупна набавна цена</small><strong>'+money(purchaseKnown?purchaseTotal:null)+'</strong></div>'+
        '<div><small>Укупна продајна цена нарученог</small><strong>'+money(orderedSaleKnown?orderedSaleTotal:null)+'</strong></div>'+
        '<div><small>За наплату · тренутни избор</small><strong data-charge-total>'+money(chargeKnown?chargeTotal:null)+'</strong></div>'+
        '</section><div class="nd-ops-delivery-overview"><span>'+activeOrders.length+' активних поруџбина</span><span>'+activeCustomerIds.size+' купаца</span><span>'+completedCount+' завршених</span></div>';

      const renderCustomerGroup=(pointKey,customerId,orders)=>{
        const customer=customerMap.get(orders[0]?.kupac_id),groupKey=String(pointKey)+':'+String(customerId),descriptors=[];
        let customerOrdered=0,customerOrderedKnown=true,customerCharge=0,customerChargeKnown=true,checkedLines=0,totalLines=0,hasIssue=false;
        const orderHtml=orders.map(order=>{
          const orderItems=state.items.filter(item=>String(item.porudzbina_id)===String(order.id));
          const rows=orderItems.map(item=>{
            totalLines++;
            const product=productMap.get(item.product_id),variant=variantMap.get(item.variant_id);
            const ordered=Math.max(0,Number(item.package_count)||0),pickupRows=pickupByItem.get(String(item.id))||[];
            const picked=pickupRows.reduce((sum,row)=>sum+row.quantity,0),size=Number(item.package_size);
            const available=Math.min(ordered,picked),deliveredBase=Math.max(0,Number(item.isporucena_kolicina)||0);
            const deliveredPackages=Number.isFinite(size)&&size>0?deliveredBase/size:0;
            const dataIssue=invalidItemIds.has(String(item.id))||invalidProductPairs.has(productPair(item))||
              picked>ordered+0.000001||deliveredPackages>available+0.000001||!Number.isFinite(size)||size<=0;
            const checked=item.stavka_cekirana===true;
            const deficitPackages=Math.max(0,ordered-picked);
            if(checked)checkedLines++;if(dataIssue)hasIssue=true;
            const sale=lineSaleValue(item);if(sale===null)customerOrderedKnown=false;else customerOrdered+=sale;
            const billablePackages=checked?deliveredPackages:available;
            if(dataIssue)customerChargeKnown=false;
            if(billablePackages>0){const price=salePricePerPackage(item);if(price===null||!Number.isFinite(size)||size<=0)customerChargeKnown=false;else customerCharge+=billablePackages*price}
            const status=dataIssue?'Провери податке':deficitPackages>0?'Недостаје '+packageCountLabel(deficitPackages):
              checked&&deliveredPackages<=0?'Није испоручено':
              checked&&deliveredPackages+0.000001<ordered?'Делимично испоручено':'';
            const statusClass=dataIssue||deficitPackages>0||deliveredPackages<=0?'missing':'partial';
            const itemStatusHtml=status?'<span class="nd-ops-delivery-status '+statusClass+'">'+status+'</span>':'';
            const farmLines=pickupRows.length?pickupRows.map(row=>{
              const farmName=farmMap.get(row.allocation.gazdinstvo_id)?.name||('Газдинство #'+row.allocation.gazdinstvo_id);
              return '<small>'+esc(farmName)+': преузето '+packageCountLabel(row.quantity)+' · укупно од газдинства '+
                packageCountLabel(row.pickedAtFarm)+(row.exceedsPickup?' · ПРОВЕРА КОЛИЧИНЕ':'')+'</small>';
            }).join(''):'<small>Нема потврђеног преузимања од газдинства.</small>';
            const inputValue=checked?deliveredPackages:available,editable=canReadProducts&&state.tour.status==='processing'&&!dataIssue;
            descriptors.push({order,item,availablePackages:available,packageSize:size,hasDataIssue:dataIssue});
            const deficitLabel=deficitPackages>0?packageCountLabel(deficitPackages)+' · '+packageAmountLabel(deficitPackages,size,item.package_unit):'Нема мањка';
            return '<div class="nd-ops-delivery-item'+(deficitPackages>0?' has-deficit':'')+'" data-delivery-item-card="'+esc(item.id)+'" role="group" tabindex="0" aria-label="Изабери ставку и унеси количину за предају"><div class="nd-ops-delivery-item-head"><strong>'+
              esc(product?.name||'Производ није доступан')+'</strong>'+itemStatusHtml+'</div>'+
              '<div class="nd-ops-delivery-main"><div class="nd-ops-delivery-product-info"><strong class="nd-ops-delivery-package">'+esc(variant?.name||variant?.size_label||'Варијанта није наведена')+'</strong><span>× '+packageCountLabel(ordered)+' наручено</span></div>'+
              '<div class="nd-ops-delivery-action"><label class="nd-ops-delivery-qty-wrap"><input type="number" min="0" max="'+String(available)+'" step="0.001" inputmode="decimal" data-delivery-qty="'+esc(item.id)+
              '" value="'+String(inputValue)+'" '+(editable?'':'disabled')+'><small>КОМАДА</small></label>'+
              '<button type="button" class="nd-ops-delivery-quick" data-confirm-delivery="'+esc(item.id)+'" '+(editable&&available>0?'':'disabled')+'>Потврди</button></div></div>'+
              '<div class="nd-ops-delivery-price-row"><span>'+ (salePricePerPackage(item)!==null?'Цена по паковању':'Цена није доступна') +'</span><strong>'+money(salePricePerPackage(item))+'</strong></div>'+
              '<div class="nd-ops-delivery-metrics"><span>Наручено <b>'+packageCountLabel(ordered)+'</b></span>'+
              '<span>Преузето <b>'+packageCountLabel(picked)+'</b></span>'+
              '<span class="nd-ops-delivery-deficit'+(deficitPackages>0?' is-active':'')+'">Недостаје <b>'+deficitLabel+'</b></span></div>'+
              '<div class="nd-ops-delivery-farms">'+farmLines+'</div></div>';
          }).join('');
          const orderSale=orderItems.reduce((sum,item)=>sum+(lineSaleValue(item)??0),0);
          return '<div class="nd-ops-delivery-order"><div class="nd-ops-delivery-order-head"><strong>Поруџбина #'+esc(order.id)+
            '</strong><span>'+orderItems.length+' ставки</span></div>'+
            (order.adresa_dostave?'<small>Адреса: '+esc(order.adresa_dostave)+'</small>':'')+
            '<div class="nd-ops-delivery-items">'+(rows||'<small>Нема ставки у поруџбини.</small>')+'</div>'+
            '<div class="nd-ops-delivery-order-total"><span>Вредност нарученог</span><strong>'+
            money(orderItems.every(item=>lineSaleValue(item)!==null)?orderSale:null)+'</strong></div></div>';
        }).join('');
        deliverySaveGroups.set(groupKey,{orders,lines:descriptors});
        const status=hasIssue?'Провери податке':checkedLines===0?'Чека потврду':checkedLines===totalLines?'Све ставке потврђене':'Делимично потврђено';
        const statusClass=hasIssue?'missing':checkedLines===totalLines?'complete':checkedLines?'partial':'neutral';
        const phone=customer?.telefon||orders[0]?.telefon||'';
        return '<article class="nd-ops-delivery-customer" data-delivery-group="'+esc(groupKey)+'"><div class="nd-ops-delivery-customer-head"><div><strong>'+
          esc(customer?.ime_prezime||('Купац #'+(orders[0]?.kupac_id??'—')))+
          (phone?'<a class="nd-ops-delivery-customer-phone" href="tel:'+esc(String(phone).replace(/[^0-9+]/g,''))+'">'+esc(phone)+'</a>':'')+
          '<small class="nd-ops-delivery-order-refs">'+orders.map(order=>'#'+esc(order.id)).join(' · ')+'</small>'+
          '</div><span class="nd-ops-delivery-status '+statusClass+'">'+status+'</span></div>'+
          orderHtml+
          '<div class="nd-ops-delivery-customer-footer"><div><small>Вредност нарученог</small><strong>'+
          money(customerOrderedKnown?customerOrdered:null)+'</strong></div><div><small>За наплату</small><strong data-customer-charge>'+
          money(customerChargeKnown?customerCharge:null)+'</strong></div></div>'+
          (canReadProducts&&state.tour.status==='processing'?
            '<small class="nd-ops-delivery-feedback" data-delivery-feedback aria-live="polite">Потврђуј ставке појединачно — сваки додир чува стварно предату количину.</small>':
            '<small>Потврда је доступна само у тури која је у обради и за овлашћену ADMIN улогу.</small>')+
          '</article>';
      };

      const renderPointSection=(pointId,pointName,pointMeta,orders)=>{
        if(!orders.length)return '';
        const byCustomer=new Map();
        for(const order of orders){const key=String(order.kupac_id??'unknown-'+order.id);if(!byCustomer.has(key))byCustomer.set(key,[]);byCustomer.get(key).push(order)}
        const cards=[...byCustomer.entries()].map(([customerId,customerOrders])=>
          renderCustomerGroup(pointId,customerId,customerOrders.sort((a,b)=>Number(a.id)-Number(b.id)))).join('');
        return '<section class="nd-ops-card nd-ops-delivery-point"><div class="nd-ops-delivery-point-head"><div><strong>'+
          esc(pointName)+'</strong><small>'+esc(pointMeta||'')+'</small></div><span>'+byCustomer.size+' купаца</span></div>'+cards+'</section>';
      };
      const pointWork=state.points.map(point=>{
        const pointOrders=state.orders.filter(order=>String(order.punkt_id??'')===String(point.id));
        if(!pointOrders.length)return null;
        const remaining=pointOrders.filter(order=>order.dostava_obradjena!==true);
        const stop=state.tourStops.find(row=>String(row.punkt_id)===String(point.id));
        const schedule=stop?.vreme?'Време: '+stop.vreme:'';
        const customers=new Set(pointOrders.map(order=>String(order.kupac_id??'unknown-'+order.id)));
        return {point,pointOrders,remaining,customers,schedule};
      }).filter(Boolean);
      if(selectedDeliveryPointId!==null&&!pointWork.some(row=>String(row.point.id)===String(selectedDeliveryPointId)&&row.remaining.length)){
        selectedDeliveryPointId=null;
      }
      const remainingPoints=pointWork.filter(row=>row.remaining.length>0);
      const selectedWork=selectedDeliveryPointId===null?null:remainingPoints.find(row=>String(row.point.id)===String(selectedDeliveryPointId));
      const pointSections=selectedWork
        ? '<div class="nd-ops-delivery-point-detail"><button type="button" class="nd-ops-delivery-back" data-delivery-back>← Сви пунктови</button>'+
          renderPointSection(selectedWork.point.id,selectedWork.point.name||('Пункт #'+selectedWork.point.id),[selectedWork.schedule,selectedWork.point.city,selectedWork.point.address].filter(Boolean).join(' · '),selectedWork.remaining)+'</div>'
        : '<div class="nd-ops-delivery-point-list">'+remainingPoints.map(row=>
          '<button type="button" class="nd-ops-delivery-point-choice" data-delivery-open-point="'+esc(row.point.id)+'">'+
          '<span class="nd-ops-delivery-choice-copy"><strong>'+esc(row.point.name||('Пункт #'+row.point.id))+'</strong>'+
          '<small>'+(row.schedule?'Долазак: '+esc(row.schedule.replace(/^Време:\s*/,'')):'Време није наведено')+'</small></span>'+
          '<span class="nd-ops-delivery-choice-count">'+row.customers.size+' куп. · '+row.remaining.length+' пор.</span><span class="nd-ops-delivery-choice-arrow">›</span></button>'
        ).join('')+(remainingPoints.length?'':'<div class="nd-ops-empty">Сви пунктови су завршени. Нема активних испорука.</div>')+'</div>';
      const assignedPointIds=new Set(state.points.map(point=>String(point.id)));
      const unassignedOrders=activeOrders.filter(order=>!order.punkt_id||!assignedPointIds.has(String(order.punkt_id)));
      const unassignedSection=unassignedOrders.length?renderPointSection('unassigned','Поруџбине без познатог пункта','Потребна је провера пункта',unassignedOrders):'';
      updateDeliveryAmounts=()=>{
        let total=0,known=true;
        for(const item of state.items){
          const input=shell.querySelector('[data-delivery-qty="'+item.id+'"]'),size=Number(item.package_size);
          let packages=0,invalid=false;
          if(input){
            packages=Number(input.value);
            const line=[...deliverySaveGroups.values()].flatMap(group=>group.lines).find(row=>String(row.item.id)===String(item.id));
            invalid=!!line?.hasDataIssue||input.disabled;
          }else if(item.stavka_cekirana===true&&hasNumber(item.isporucena_kolicina)&&Number(item.isporucena_kolicina)>0&&Number.isFinite(size)&&size>0){
            packages=Number(item.isporucena_kolicina)/size;
          }
          if(invalid||!Number.isFinite(packages)||packages<0){known=false;continue}
          if(packages>0){if(!Number.isFinite(size)||size<=0)known=false;else {const price=salePricePerPackage(item);if(price===null)known=false;else total+=packages*price}}
        }
        const totalNode=shell.querySelector('[data-charge-total]');
        if(totalNode)totalNode.textContent=money(known?total:null);
        for(const card of shell.querySelectorAll('.nd-ops-delivery-customer')){
          const group=deliverySaveGroups.get(card.dataset.deliveryGroup);
          if(!group)continue;
          let sum=0,customerKnown=true;
          for(const line of group.lines){
            const input=card.querySelector('[data-delivery-qty="'+line.item.id+'"]');
            const size=Number(line.item.package_size),packages=input?Number(input.value):
              (Number(line.item.isporucena_kolicina)||0)/(Number.isFinite(size)&&size>0?size:1);
            if(line.hasDataIssue||input?.disabled||!Number.isFinite(packages)||packages<0){customerKnown=false;continue}
            if(packages>0){const price=salePricePerPackage(line.item);if(price===null)customerKnown=false;else sum+=packages*price}
          }
          const node=card.querySelector('[data-customer-charge]');if(node)node.textContent=money(customerKnown?sum:null);
        }
      };
      body=summary+'<div class="nd-ops-delivery-overview"><strong>'+remainingPoints.length+' преосталих пунктова</strong><span>'+pointWork.filter(row=>row.remaining.length===0).length+' завршених</span></div>'+(pointSections||'')+(unassignedSection||'')+
        (activeOrders.length===0?'<div class="nd-ops-empty">Све поруџбине су завршене. Нема активних испорука.</div>':'');
      const vehicleGroups=new Map(),vehicleFarmGroups=new Map();
      for(const allocation of state.procurementAllocations){
        const packages=Math.max(0,Number(allocation.preuzeto_pakovanja)||0);
        if(packages<=0)continue;
        const key=productPair(allocation),product=productMap.get(allocation.product_id),variant=variantMap.get(allocation.variant_id);
        const productName=product?.name||'Производ није доступан',variantName=variant?.name||variant?.size_label||'Варијанта није наведена';
        const farmName=farmMap.get(allocation.gazdinstvo_id)?.name||('Газдинство #'+allocation.gazdinstvo_id);
        const group=vehicleGroups.get(key)||{name:productName,variant:variantName,packages:0};
        group.packages+=packages;vehicleGroups.set(key,group);
        const farmKey=String(allocation.gazdinstvo_id??'unknown');
        const farmGroup=vehicleFarmGroups.get(farmKey)||{name:farmName,rows:new Map(),total:0};
        const row=farmGroup.rows.get(key)||{name:productName,variant:variantName,packages:0};
        row.packages+=packages;farmGroup.rows.set(key,row);farmGroup.total+=packages;vehicleFarmGroups.set(farmKey,farmGroup);
      }
      const vehicleRows=[...vehicleGroups.values()].map(group=>'<article class="nd-ops-card"><strong>'+esc(group.name)+'</strong><div>'+esc(group.variant)+'</div><div class="nd-ops-qty">'+packageCountLabel(group.packages)+'</div></article>').join('');
      const farmPickupRows=[...vehicleFarmGroups.values()].map(farm=>'<article class="nd-ops-card"><div class="nd-ops-delivery-point-head"><strong>'+esc(farm.name)+'</strong><b>'+packageCountLabel(farm.total)+'</b></div>'+[...farm.rows.values()].map(row=>'<div class="nd-ops-delivery-item"><strong>'+esc(row.name)+'</strong><div>'+esc(row.variant)+'</div><div class="nd-ops-qty">'+packageCountLabel(row.packages)+'</div></div>').join('')+'</article>').join('');
      const vehicleHtml='<section class="nd-ops-card"><h2>Садржај возила</h2><p>Укупне потврђене количине преузете за ову туру.</p><div class="nd-ops-delivery-overview"><strong>'+[...vehicleGroups.values()].reduce((sum,row)=>sum+row.packages,0).toLocaleString('sr-RS',{maximumFractionDigits:3})+' паковања</strong><span>'+vehicleGroups.size+' врста производа</span></div>'+(vehicleRows||'<div class="nd-ops-empty">Још нема потврђених количина за возило.</div>')+'</section><section class="nd-ops-card"><h2>Преузето од газдинстава</h2><p>Преглед шта је преузето са сваког газдинства, по производу и варијанти.</p>'+(farmPickupRows||'<div class="nd-ops-empty">Нема евидентираног преузимања од газдинстава.</div>')+'</section>';
      const deliveryTabs='<nav class="nd-ops-delivery-tabs" aria-label="Приказ доставе"><button type="button" data-delivery-view="routes" aria-pressed="'+(deliveryView==='routes'?'true':'false')+'" class="'+(deliveryView==='routes'?'is-active':'')+'">Пунктови и испорука</button><button type="button" data-delivery-view="vehicle" aria-pressed="'+(deliveryView==='vehicle'?'true':'false')+'" class="'+(deliveryView==='vehicle'?'is-active':'')+'">У возилу</button></nav>';
      if(deliveryView==='vehicle')body=vehicleHtml;
      body=deliveryTabs+body;
      body+='<button type="button" class="nd-ops-calculator-launch" data-calculator-open>⌗ Калкулатор</button>'+
        '<div class="nd-ops-calculator-overlay" data-calculator-overlay hidden><section class="nd-ops-calculator" role="dialog" aria-modal="true" aria-labelledby="ndCalculatorTitle">'+
        '<header><strong id="ndCalculatorTitle">Калкулатор</strong><button type="button" data-calculator-close aria-label="Затвори">×</button></header>'+
        '<div class="nd-ops-calculator-screen"><small data-calculator-expression>Рачунање</small><output data-calculator-display>0</output></div>'+
        '<div class="nd-ops-calculator-keys">'+['7','8','9','÷','4','5','6','×','1','2','3','−','C','0',',','+','(',')','⌫','='].map(key=>'<button type="button" data-calculator-key="'+key+'" class="'+(['÷','×','−','+','='].includes(key)?'operator':'')+(key==='='?' equals':'')+(key==='C'?' clear':'')+'">'+key+'</button>').join('')+'</div>'+
        '<small class="nd-ops-calculator-note">Самосталан рачун · не мења износ купца нити податке туре</small></section></div>';
    }
    if(groupedOrdersView){groupedOrdersView.destroy();groupedOrdersView=null;}
    shell.classList.toggle('nd-tour-ops-delivery',activeTab==='delivery');
    shell.innerHTML='<header class="nd-ops-head"><div><small>'+(activeTab==='report'?'ФИНАНСИЈСКИ ИЗВЕШТАЈ':'ОПЕРАТИВНИ ПРЕГЛЕД')+' · #'+esc(tourId)+'</small><h1>'+title+'</h1><p>'+fmtDate(state.tour.datum)+' · '+esc(String(state.tour.status||'').toUpperCase())+'</p><div class="nd-ops-stats"><span>'+state.orders.length+' поруџбина</span><span>'+state.items.length+' ставки</span><span>'+state.customers.length+' купаца</span></div>'+(state.tour.status==='open'&&['admin','super_admin'].includes(role)?'<button type="button" data-tour-processing '+(statusBusy?'disabled':'')+'>'+(statusBusy?'Пребацујем…':'Затвори пријем · пребаци у обраду')+'</button>':'')+'</div>'+(canReadProducts?'<button type="button" data-open-report>Финансијски извештај</button>':'')+'<button type="button" data-back>← Назад</button></header><section class="nd-ops-content" data-ops-content>'+body+'</section><footer class="nd-ops-foot"><span>Само читање · Подаци из Supabase</span><button type="button" data-refresh>Освежи</button></footer>';
    const compactOpsHead=shell.querySelector('.nd-ops-head');
    const adminTopbar=document.querySelector('.nd-topbar');
    if(adminTopbar)adminTopbar.querySelectorAll('.nd-ops-head').forEach(node=>node.remove());
    if(compactOpsHead&&adminTopbar)adminTopbar.appendChild(compactOpsHead);
    compactOpsHead?.querySelector('[data-back]')?.addEventListener('click',onBack);
    compactOpsHead?.querySelector('[data-open-report]')?.addEventListener('click',()=>{if(activeTab==='report')return;returnFromReport=activeTab;activeTab='report';render();});
    shell.querySelector('[data-report-print]')?.addEventListener('click',()=>window.print());
    shell.querySelectorAll('[data-delivery-view]').forEach(button=>button.addEventListener('click',()=>{deliveryView=button.dataset.deliveryView==='vehicle'?'vehicle':'routes';render();}));

    shell.querySelector('[data-report-back]')?.addEventListener('click',()=>{activeTab=['orders','products','delivery'].includes(returnFromReport)?returnFromReport:'orders';render();});
    const calcOverlay=shell.querySelector('[data-calculator-overlay]'),calcDisplay=shell.querySelector('[data-calculator-display]'),calcCaption=shell.querySelector('[data-calculator-expression]');
    const updateCalc=()=>{if(calcDisplay)calcDisplay.textContent=calculatorExpression.replace(/\./g,',')||'0';};
    const closeCalc=()=>{if(calcOverlay)calcOverlay.hidden=true;};
    shell.querySelector('[data-calculator-open]')?.addEventListener('click',()=>{if(calcOverlay){calcOverlay.hidden=false;updateCalc();shell.querySelector('[data-calculator-close]')?.focus();}});
    shell.querySelector('[data-calculator-close]')?.addEventListener('click',closeCalc);
    calcOverlay?.addEventListener('click',event=>{if(event.target===calcOverlay)closeCalc();});
    shell.querySelectorAll('[data-calculator-key]').forEach(button=>button.addEventListener('click',()=>{
      const key=button.dataset.calculatorKey;
      if(key==='C'){calculatorExpression='0';calculatorJustEvaluated=false;if(calcCaption)calcCaption.textContent='Рачунање';updateCalc();return;}
      if(key==='⌫'){calculatorExpression=calculatorExpression.length>1?calculatorExpression.slice(0,-1):'0';calculatorJustEvaluated=false;updateCalc();return;}
      if(key==='='){try{const result=calculateDeliveryExpression(calculatorExpression);calculatorExpression=String(Number(result.toPrecision(12)));calculatorJustEvaluated=true;if(calcCaption)calcCaption.textContent='Резултат';updateCalc();}catch(error){if(calcCaption)calcCaption.textContent=error.message||'Провери израз';}return;}
      const operator=['+','−','×','÷'].includes(key);
      if(calculatorJustEvaluated&&!operator&&key!==')')calculatorExpression='0';
      calculatorJustEvaluated=false;
      if(calculatorExpression==='0'&&!operator&&![')',','].includes(key))calculatorExpression=key;else calculatorExpression+=key;
      if(calcCaption)calcCaption.textContent='Рачунање';updateCalc();
    }));
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
    shell.querySelectorAll('[data-delivery-open-point]').forEach(button=>button.addEventListener('click',()=>{
      if(deliveryBusy||button.disabled)return;
      selectedDeliveryPointId=String(button.dataset.deliveryOpenPoint);
      render();
    }));
    shell.querySelector('[data-delivery-back]')?.addEventListener('click',()=>{
      if(deliveryBusy)return;
      selectedDeliveryPointId=null;
      render();
    });
    if(updateDeliveryAmounts){
      shell.querySelectorAll('[data-delivery-qty]').forEach(input=>{
        input.addEventListener('input',updateDeliveryAmounts);
        input.addEventListener('change',updateDeliveryAmounts);
      });
      shell.querySelectorAll('[data-fill-delivery]').forEach(button=>{
        button.addEventListener('click',()=>{
          if(button.disabled||deliveryBusy)return;
          const input=shell.querySelector('[data-delivery-qty="'+button.dataset.fillDelivery+'"]');
          if(!input||input.disabled)return;
          input.value=input.max;
          input.dispatchEvent(new Event('input',{bubbles:true}));
          button.textContent='Количина је спремна за чување';
          button.classList.add('is-filled');
        });
      });
      updateDeliveryAmounts();
    }
    shell.querySelectorAll('[data-delivery-item-card]').forEach(itemCard=>{
      const focusQuantity=event=>{
        if(event.type==='click'&&event.target.closest('button,a,input,label'))return;
        if(event.type==='keydown'&&!['Enter',' '].includes(event.key))return;
        if(event.type==='keydown')event.preventDefault();
        itemCard.querySelector('[data-delivery-qty]')?.focus();
      };
      itemCard.addEventListener('click',focusQuantity);
      itemCard.addEventListener('keydown',focusQuantity);
    });
    shell.querySelectorAll('[data-confirm-delivery]').forEach(button=>{
      button.addEventListener('click',async()=>{
        if(deliveryBusy||state.tour.status!=='processing'||button.disabled)return;
        const itemId=button.dataset.confirmDelivery;
        const group=deliverySaveGroups.get(button.closest('.nd-ops-delivery-customer')?.dataset.deliveryGroup);
        const line=group?.lines.find(row=>String(row.item.id)===String(itemId));
        const card=button.closest('.nd-ops-delivery-customer'),feedback=card?.querySelector('[data-delivery-feedback]');
        const input=card?.querySelector('[data-delivery-qty="'+itemId+'"]');
        if(!line||!input)return;
        const packages=Number(input.value);
        try{
          if(line.hasDataIssue)throw new Error('Постоји неусаглашеност у расподели. Ставка није потврђена.');
          if(!Number.isFinite(packages)||packages<=0||packages>line.availablePackages+0.000001)
            throw new Error('Унеси количину већу од нуле, највише до стварно преузете количине.');
          if(!Number.isFinite(line.packageSize)||line.packageSize<=0)throw new Error('Недостаје величина паковања за ову ставку.');
          deliveryBusy=true;button.disabled=true;button.textContent='ЧУВАМ ПОТВРДУ…';
          if(feedback)feedback.textContent='Чувам предату количину и проверавам одговор базе…';
          const baseQuantity=Number((packages*line.packageSize).toFixed(6));
          const result=await client.from('stavke_porudzbine').update({
            kolicina_za_isporuku:baseQuantity,isporucena_kolicina:baseQuantity,stavka_cekirana:true
          }).eq('id',line.item.id).eq('tura_id',tourId)
            .select('id,kolicina_za_isporuku,isporucena_kolicina,stavka_cekirana').maybeSingle();
          if(result.error)throw result.error;
          if(!result.data||result.data.stavka_cekirana!==true||
            Math.abs(Number(result.data.isporucena_kolicina)-baseQuantity)>0.000001||
            Math.abs(Number(result.data.kolicina_za_isporuku)-baseQuantity)>0.000001)
            throw new Error('База није потврдила количину за ставку #'+line.item.id+'.');
          Object.assign(line.item,result.data);
          const orderItems=state.items.filter(item=>String(item.porudzbina_id)===String(line.order.id));
          if(orderItems.length&&orderItems.every(item=>item.stavka_cekirana===true)){
            const savedOrder=await client.from('porudzbine').update({
              dostava_obradjena:true,dostava_obradjena_at:new Date().toISOString()
            }).eq('id',line.order.id).eq('dostava_obradjena',false)
              .select('id,dostava_obradjena,dostava_obradjena_at').maybeSingle();
            if(savedOrder.error)throw savedOrder.error;
            if(savedOrder.data)Object.assign(line.order,savedOrder.data);
            else{
              const verify=await client.from('porudzbine').select('id,dostava_obradjena,dostava_obradjena_at').eq('id',line.order.id).maybeSingle();
              if(verify.error||verify.data?.dostava_obradjena!==true)
                throw new Error('Ставка је сачувана, али база није потврдила завршетак поруџбине #'+line.order.id+'. Ставка остаје сачувана ради провере.');
              Object.assign(line.order,verify.data);
            }
          }
          if(feedback)feedback.textContent='База је потврдила предату количину. Освежавам биланс…';
          await load();
        }catch(error){
          if(feedback)feedback.textContent='Потврда није завршена: '+(error.message||String(error));
          else showError(error);
        }finally{
          deliveryBusy=false;
          if(button.isConnected){button.disabled=false;button.textContent='Понови потврду';}
        }
      });
    });
    shell.querySelectorAll('[data-open-procurement-product]').forEach(card=>{
      const open=()=>{const productId=card.dataset.openProcurementProduct;if(productId)onOpenProcurement?.(productId);};
      card.addEventListener('click',open);
      card.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();open();}});
    });
    shell.querySelector('[data-refresh]')?.addEventListener('click',async e=>{e.currentTarget.disabled=true;try{await load()}catch(error){showError(error)}finally{if(e.currentTarget)e.currentTarget.disabled=false}});
  }
  function showError(error){shell.innerHTML='<div class="nd-ops-error"><strong>Подаци нису учитани</strong><p>'+esc(error.message||String(error))+'</p><button type="button" data-back>Назад</button></div>';shell.querySelector('[data-back]').addEventListener('click',onBack)}
  try { await load(); } catch(error) { showError(error); }
  return { destroy(){disposed=true;loadToken++;if(groupedOrdersView)groupedOrdersView.destroy();document.querySelectorAll('.nd-topbar>.nd-ops-head').forEach(node=>node.remove());orderSheetPromise.then(sheet=>sheet.destroy()).catch(()=>{});root.replaceChildren();} };
}
