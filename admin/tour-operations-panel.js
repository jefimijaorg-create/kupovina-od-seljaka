/*
 * NARUČI DOMAĆE — TOUR OPERATIONS PANEL
 * Version: 1.5.49
 * Updated: 2026-11-28
 * Description: Full pickup auto-covers ordered customer items; partial pickup is not assigned by order sequence and is capped by physical pickup.
 */
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const productPairKey = (row) => String(row.product_id ?? '') + '::' + String(row.variant_id ?? '');
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
  let activeTab = ['orders','products','delivery','traceability'].includes(initialTab) ? initialTab : 'orders', returnFromReport='orders', disposed = false, loadToken = 0, groupedOrdersView = null, statusBusy = false, deliveryBusy = false, selectedDeliveryPointId = null;
  let deliveryView = 'routes';
  let calculatorExpression='0', calculatorJustEvaluated=false;
  const state = { tour:null, items:[], orders:[], customers:[], products:[], variants:[], productOffers:[], farms:[], itemAllocations:[], procurementAllocations:[], tourStops:[], points:[] };
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
    if (!['open','processing'].includes(result.data.status)) throw new Error('Тура није отворена нити је у обради.');
    state.tour = result.data;
    const itemResult = await client.from('stavke_porudzbine').select('id,porudzbina_id,product_id,variant_id,gazdinstvo_id,status,status_stavke,package_count,package_size,package_unit,unit_price,cena_stavke,preuzeta_kolicina,isporucena_kolicina,kolicina_za_isporuku,stavka_cekirana').eq('tura_id', tourId);
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
      const procurementResult = await client.from('tura_nabavka_dodele').select('id,tura_id,product_id,variant_id,gazdinstvo_id,broj_pakovanja,nabavna_cena,raspodela_kupcima,preuzeto_pakovanja,naruceno,potvrdjeno_pakovanja,odbijeno_pakovanja').eq('tura_id',tourId);
      const procurementRows = fail(procurementResult,'Набавка');
      const allProductIds = uniq([...productIds,...procurementRows.map(x=>x.product_id)]);
      const allVariantIds = uniq([...variantIds,...procurementRows.map(x=>x.variant_id)]);
      const allFarmIds = uniq([...farmIds,...procurementRows.map(x=>x.gazdinstvo_id)]);
      const [productsResult, variantsResult, itemAllocResult, offersResult] = await Promise.all([
        allProductIds.length ? client.from('products').select('id,name,gazdinstvo_id,price').in('id',allProductIds) : Promise.resolve({data:[],error:null}),
        allVariantIds.length ? client.from('product_variants').select('id,product_id,name,size_label,unit,package_value,package_unit,price,is_active').in('id',allVariantIds) : Promise.resolve({data:[],error:null}),
        state.items.length ? client.from('tura_stavke_raspodela').select('id,stavka_porudzbine_id,gazdinstvo_id,broj_pakovanja').in('stavka_porudzbine_id',state.items.map(x=>x.id)) : Promise.resolve({data:[],error:null}),
        allProductIds.length && allVariantIds.length ? client.from('product_offers').select('product_id,variant_id,gazdinstvo_id,sale_price').in('product_id',allProductIds).in('variant_id',allVariantIds) : Promise.resolve({data:[],error:null})
      ]);
      state.products=fail(productsResult,'Производи'); state.variants=fail(variantsResult,'Варијанте');
      state.itemAllocations=fail(itemAllocResult,'Расподела ставки'); state.productOffers=fail(offersResult,'Продајне цене'); state.procurementAllocations=procurementRows;
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
  const hasNumber=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));
  const salePriceFor=item=>{
    const offers=state.productOffers.filter(row=>String(row.product_id)===String(item.product_id)&&String(row.variant_id)===String(item.variant_id));
    const exact=offers.find(row=>String(row.gazdinstvo_id)===String(item.gazdinstvo_id)&&hasNumber(row.sale_price));
    const available=exact||offers.find(row=>hasNumber(row.sale_price));
    if(available)return Number(available.sale_price);
    const variant=state.variants.find(row=>String(row.id)===String(item.variant_id));
    if(hasNumber(variant?.price))return Number(variant.price);
    const product=state.products.find(row=>String(row.id)===String(item.product_id));
    return hasNumber(product?.price)?Number(product.price):null;
  };
  function render() {
    const orderMap=mapBy(state.orders,'id'), customerMap=mapBy(state.customers,'id'), productMap=mapBy(state.products,'id'), variantMap=mapBy(state.variants,'id'), farmMap=mapBy(state.farms,'id'), pointMap=mapBy(state.points,'id');
    const title=esc(state.tour.naziv||('Тура #'+tourId));
    let body='';
    let deliverySaveGroups = new Map();
    let updateDeliveryAmounts = null;
    if(activeTab==='orders') body='<div data-grouped-orders-root></div>';
    if(activeTab==='products') body=!canReadProducts?'<div class="nd-ops-notice">Ваша ADMIN улога нема SELECT дозволу за производе и варијанте. Приказ је ограничен постојећим RLS правилима.</div>':state.items.length?state.items.map(item=>{const p=productMap.get(item.product_id),v=variantMap.get(item.variant_id),f=farmMap.get(item.gazdinstvo_id)||farmMap.get(p?.gazdinstvo_id);return '<article class="nd-ops-card" data-open-procurement-product="'+esc(item.product_id||'')+'" role="button" tabindex="0" aria-label="Отвори набавку за '+esc(p?.name||'производ')+'"><strong>'+esc(p?.name||'Назив производа није доступан')+'</strong><div>'+esc(v?.name||v?.size_label||'Варијанта није наведена')+'</div><div class="nd-ops-qty">'+fmtQty(item.package_count,item.package_size,item.package_unit)+'</div><small>'+esc(f?.name||'Газдинство није доступно')+'</small></article>'}).join(''):'<div class="nd-ops-empty">Нема производа за приказ.</div>';
    if(activeTab==='allocations') body=!canReadProducts?'<div class="nd-ops-notice">Ваша ADMIN улога нема SELECT дозволу за табеле расподеле. RLS правила нису мењана.</div>':'<h3>Расподела ставки поруџбина</h3>'+ (state.itemAllocations.map(a=>'<article class="nd-ops-card"><strong>Ставка #'+esc(a.stavka_porudzbine_id)+'</strong><div>'+esc(a.broj_pakovanja)+' паковања</div><small>'+esc(farmMap.get(a.gazdinstvo_id)?.name||'Газдинство није доступно')+'</small></article>').join('')||'<div class="nd-ops-empty">Нема редова у tura_stavke_raspodela.</div>')+'<h3>Набавка по производу и газдинству</h3>'+ (state.procurementAllocations.map(a=>'<article class="nd-ops-card"><strong>'+esc(productMap.get(a.product_id)?.name||'Производ није доступан')+'</strong><div>'+esc(a.broj_pakovanja)+' паковања · преузето '+esc(a.preuzeto_pakovanja??0)+'</div><small>'+esc(farmMap.get(a.gazdinstvo_id)?.name||'Газдинство није доступно')+'</small></article>').join('')||'<div class="nd-ops-empty">Нема редова у tura_nabavka_dodele.</div>');
    if(activeTab==='traceability') {
      if(!canReadProducts) body='<div class="nd-ops-notice">Немате дозволу за преглед производа и газдинстава.</div>';
      else {
        const customerFor=item=>{const order=orderMap.get(item.porudzbina_id);return customerMap.get(order?.kupac_id)?.ime_prezime||('Купац #'+(order?.kupac_id??'—'));};
        const packageFor=item=>{const variant=variantMap.get(item.variant_id);return variant?.name||variant?.size_label||((item.package_size??'')+' '+(item.package_unit||''))||'Амбалажа није наведена';};
        const farmGroups=new Map();
        state.items.forEach(item=>{
          const farmId=item.gazdinstvo_id??state.products.find(p=>String(p.id)===String(item.product_id))?.gazdinstvo_id??'unknown';
          const farmName=farmMap.get(farmId)?.name||(farmId==='unknown'?'Газдинство није повезано':('Газдинство #'+farmId));
          const key=String(farmId);
          if(!farmGroups.has(key))farmGroups.set(key,{name:farmName,products:new Map(),packages:new Map()});
          const farm=farmGroups.get(key),productName=productMap.get(item.product_id)?.name||'Производ није наведен';
          const productKey=String(item.product_id)+'::'+String(item.variant_id);
          if(!farm.products.has(productKey))farm.products.set(productKey,{name:productName,variant:packageFor(item),items:[]});
          farm.products.get(productKey).items.push(item);
          const packageKey=String(item.variant_id||'')+'::'+String(item.package_size||'')+'::'+String(item.package_unit||'');
          if(!farm.packages.has(packageKey))farm.packages.set(packageKey,{name:packageFor(item),product:productName,items:[]});
          farm.packages.get(packageKey).items.push(item);
        });
        const qtyFor=rows=>rows.reduce((sum,item)=>sum+(Number(item.package_count)||0),0);
        const pickedFor=item=>{let total=0;state.procurementAllocations.forEach(allocation=>{if(String(allocation.product_id)!==String(item.product_id)||String(allocation.variant_id)!==String(item.variant_id))return;let entries=allocation.raspodela_kupcima;if(typeof entries==='string'){try{entries=JSON.parse(entries)}catch(_){entries=[]}}if(Array.isArray(entries))entries.forEach(entry=>{if(String(entry.stavka_porudzbine_id)===String(item.id))total+=Math.max(0,Number(entry.preuzeto_pakovanja)||0)})});return total;};
        const detailsFor=rows=>rows.map(item=>'<div class="nd-trace-customer"><span>'+esc(customerFor(item))+'</span><b>Наручено '+esc(item.package_count??0)+' · преузето '+esc(pickedFor(item))+' пак.</b><small>Поруџбина #'+esc(item.porudzbina_id)+'</small></div>').join('');
        body='<div class="nd-trace-intro"><strong>Следљивост активне туре</strong><span>Изабери производ или амбалажу да видиш тачно ко је наручио и колико.</span></div>'+
          [...farmGroups.values()].sort((a,b)=>a.name.localeCompare(b.name,'sr')).map((farm,index)=>'<section class="nd-trace-farm"><header><strong>'+esc(farm.name)+'</strong><span>'+farm.products.size+' производа · '+farm.packages.size+' врста амбалаже</span></header>'+
          '<h3>Производи</h3>'+[...farm.products.values()].map((group,i)=>'<details class="nd-trace-group"><summary><span><b>'+esc(group.name)+'</b><small>'+esc(group.variant)+'</small></span><strong>'+qtyFor(group.items).toLocaleString('sr-RS')+' пак.</strong></summary><div class="nd-trace-details">'+detailsFor(group.items)+'</div></details>').join('')+
          '<h3>Амбалажа</h3>'+[...farm.packages.values()].map(group=>'<details class="nd-trace-group"><summary><span><b>'+esc(group.name)+'</b><small>'+esc(group.product)+'</small></span><strong>'+qtyFor(group.items).toLocaleString('sr-RS')+' пак.</strong></summary><div class="nd-trace-details">'+detailsFor(group.items)+'</div></details>').join('')+'</section>').join('')||
          '<div class="nd-ops-empty">Нема поруџбина за приказ у активној тури.</div>';
      }
    }
    if(activeTab==='report') {
      const money=value=>value===null||value===undefined?'Није обрачунато':Number(value).toLocaleString('sr-RS',{minimumFractionDigits:0,maximumFractionDigits:2})+' дин.';
      const qty=value=>Number(value||0).toLocaleString('sr-RS',{maximumFractionDigits:3});
      const lineSale=item=>{
        if(item.cena_stavke!==null&&item.cena_stavke!==undefined&&item.cena_stavke!==''&&Number.isFinite(Number(item.cena_stavke)))return Number(item.cena_stavke);
        if(item.unit_price!==null&&item.unit_price!==undefined&&item.unit_price!==''&&item.package_count!==null&&item.package_count!==undefined&&Number.isFinite(Number(item.unit_price))&&Number.isFinite(Number(item.package_count)))return Number(item.unit_price)*Number(item.package_count);
        const fallbackPrice=salePriceFor(item),count=Number(item.package_count);
        return fallbackPrice!==null&&Number.isFinite(count)&&count>=0?fallbackPrice*count:null;
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
      /* ЦЕЛА НАРУЏБИНА ПО ГАЗДИНСТВИМА — набавка и продаја рачунају се по нарученој количини; преузето се приказује засебно. */
      const salesUnitByPair=new Map();
      for(const item of state.items){
        const count=Number(item.package_count),value=lineSale(item);
        if(!Number.isFinite(count)||count<=0||value===null)continue;
        const key=String(item.product_id)+'::'+String(item.variant_id);
        const old=salesUnitByPair.get(key)||{quantity:0,value:0};
        old.quantity+=count;old.value+=value;salesUnitByPair.set(key,old);
      }
      const farmOrderFinance=new Map();
      let orderPackages=0,pickedOrderPackages=0,orderPurchaseTotal=0,orderSalesTotal=0;
      let orderPurchaseMissing=0,orderSalesMissing=0;
      for(const allocation of state.procurementAllocations){
        const orderedRaw=allocation.broj_pakovanja??allocation.naruceno_pakovanja??allocation.naruceno??0;
        const ordered=Math.max(0,Number(orderedRaw)||0),picked=Math.max(0,Number(allocation.preuzeto_pakovanja)||0);
        if(ordered<=0&&picked<=0)continue;
        const farmName=farmMap.get(allocation.gazdinstvo_id)?.name||('Газдинство #'+allocation.gazdinstvo_id);
        const productName=productMap.get(allocation.product_id)?.name||'Производ није наведен';
        const variant=variantMap.get(allocation.variant_id)?.name||variantMap.get(allocation.variant_id)?.size_label||'Варијанта није наведена';
        const key=String(allocation.product_id)+'::'+String(allocation.variant_id);
        const salesMeta=salesUnitByPair.get(key);
        const salePerPackage=salesMeta&&salesMeta.quantity>0?salesMeta.value/salesMeta.quantity:null;
        const purchaseKnown=allocation.nabavna_cena!==null&&allocation.nabavna_cena!==undefined&&allocation.nabavna_cena!==''&&Number.isFinite(Number(allocation.nabavna_cena));
        const purchaseValue=purchaseKnown?ordered*Number(allocation.nabavna_cena):null;
        const salesValue=salePerPackage!==null?ordered*salePerPackage:null;
        let farm=farmOrderFinance.get(farmName);
        if(!farm){farm={ordered:0,picked:0,purchase:0,sales:0,purchaseKnown:true,salesKnown:true,products:new Map()};farmOrderFinance.set(farmName,farm);}
        farm.ordered+=ordered;farm.picked+=picked;
        if(purchaseValue===null){farm.purchaseKnown=false;orderPurchaseMissing++;}else{farm.purchase+=purchaseValue;orderPurchaseTotal+=purchaseValue;}
        if(salesValue===null){farm.salesKnown=false;orderSalesMissing++;}else{farm.sales+=salesValue;orderSalesTotal+=salesValue;}
        const productKey=key+'::'+String(allocation.gazdinstvo_id);
        const product=farm.products.get(productKey)||{name:productName,variant,ordered:0,picked:0,purchase:0,sales:0,purchaseKnown:true,salesKnown:true};
        product.ordered+=ordered;product.picked+=picked;
        if(purchaseValue===null)product.purchaseKnown=false;else product.purchase+=purchaseValue;
        if(salesValue===null)product.salesKnown=false;else product.sales+=salesValue;
        farm.products.set(productKey,product);
        orderPackages+=ordered;pickedOrderPackages+=picked;
      }
      const farmOrderCards=[...farmOrderFinance.entries()].sort((a,b)=>a[0].localeCompare(b[0],'sr')).map(([farmName,farm])=>
        '<article class="nd-report-farm-card"><header><div><strong>'+esc(farmName)+'</strong><small>'+qty(farm.ordered)+' наручено · '+qty(farm.picked)+' преузето</small></div><div class="nd-report-farm-totals"><span><small>Набавна вредност</small><b>'+money(farm.purchaseKnown?farm.purchase:null)+'</b></span><span><small>Продајна вредност</small><b>'+money(farm.salesKnown?farm.sales:null)+'</b></span></div></header>'+
        [...farm.products.values()].map(product=>'<div class="nd-report-farm-product"><div class="nd-report-farm-product-name"><strong>'+esc(product.name)+'</strong><small>'+esc(product.variant)+'</small><small>'+qty(product.ordered)+' наручено · '+qty(product.picked)+' преузето</small></div><div><small>Набавка</small><b>'+money(product.purchaseKnown?product.purchase:null)+'</b></div><div><small>Продаја</small><b>'+money(product.salesKnown?product.sales:null)+'</b></div></div>').join('')+'</article>'
      ).join('')||'<div class="nd-report-empty">Нема евидентираних газдинстава за ову туру.</div>';
      const farmOrderSummary='<div class="nd-report-order-summary"><div><small>Укупно наручено</small><strong>'+qty(orderPackages)+' паковања</strong></div><div><small>Укупно преузето</small><strong>'+qty(pickedOrderPackages)+' паковања</strong></div><div><small>Набавна вредност наруџбине</small><strong>'+money(orderPurchaseMissing?null:orderPurchaseTotal)+'</strong></div><div><small>Продајна вредност наруџбине</small><strong>'+money(orderSalesMissing?null:orderSalesTotal)+'</strong></div><div><small>Разлика у цени</small><strong>'+money(orderPurchaseMissing||orderSalesMissing?null:orderSalesTotal-orderPurchaseTotal)+'</strong></div></div>';
      const purchaseCards=[...purchaseByFarm.entries()].map(([name,row])=>'<article class="nd-report-row"><div><strong>'+esc(name)+'</strong><small>'+qty(row.quantity)+' преузетих паковања · '+row.lines+' ставки</small></div><b>'+money(row.cost)+'</b></article>').join('')||'<div class="nd-report-empty">Нема евидентиране набавке за ову туру.</div>';
      const customerCards=rows(salesByCustomer,(name,value)=>'<article class="nd-report-row"><div><strong>'+esc(name)+'</strong><small>Вредност поруџбина</small></div><b>'+money(value)+'</b></article>');
      const pointCards=rows(salesByPoint,(name,value)=>'<article class="nd-report-row"><div><strong>'+esc(name)+'</strong><small>Продајна вредност</small></div><b>'+money(value)+'</b></article>');
      const productCards=[...salesByProduct.entries()].map(([key,row])=>{const cost=purchaseByProduct.get(key);const profit=cost?.known&&row.value!==null?row.value-cost.cost:null;return '<article class="nd-report-product"><div><strong>'+esc(row.name)+'</strong><small>'+esc(row.variant)+' · '+qty(row.quantity)+' паковања</small></div><div><span>Продаја</span><b>'+money(row.value)+'</b></div><div><span>Набавка</span><b>'+money(cost?cost.cost:null)+'</b></div><div><span>Разлика</span><b>'+money(profit)+'</b></div></article>';}).join('')||'<div class="nd-report-empty">Нема производа за анализу.</div>';
      body='<section class="nd-report-page"><header class="nd-report-title"><div><small>КОМПЛЕТАН ФИНАНСИЈСКИ ИЗВЕШТАЈ · ТУРА #'+esc(tourId)+'</small><h2>'+title+'</h2><p>'+fmtDate(state.tour.datum)+' · Статус: '+esc(String(state.tour.status||'').toUpperCase())+'</p></div><button type="button" data-report-back>← Назад у оперативу</button></header>'+
        '<div class="nd-report-print"><button type="button" data-report-print>Штампај / сачувај као PDF</button></div><div class="nd-report-kpis"><article><small>Укупна набавка</small><strong>'+money(purchaseKnown?purchase:null)+'</strong><span>'+qty(pickedPackages)+' преузетих паковања</span></article><article><small>Укупна продаја</small><strong>'+money(sales)+'</strong><span>'+state.orders.length+' поруџбина</span></article><article><small>Разлика · бруто</small><strong>'+money(margin)+'</strong><span>'+(marginPercent===null?'Маржа није обрачуната':marginPercent.toLocaleString('sr-RS',{maximumFractionDigits:2})+'% од продаје')+'</span></article></div>'+
        '<div class="nd-report-notice '+(missingCount?'is-warning':'')+'"><strong>'+(missingCount?'Обрачун није потпун':'Обрачун цена је потпун')+'</strong><span>'+(hasProcurement?purchaseMissing+' ставки набавке без цене':'Набавка није евидентирана')+' · '+salesMissing+' ставки продаје без цене. Разлика је приказана само када су обе стране потпуне.</span></div>'+
        '<section class="nd-report-section nd-report-order-section"><h3>Целокупна наруџбина по газдинствима</h3>'+farmOrderSummary+farmOrderCards+'<p class="nd-report-foot">Набавна и продајна вредност рачунају се за целу наручену количину. Преузета количина је посебно приказана и не мења вредност наруџбине.</p></section>'+
        '<section class="nd-report-section"><h3>Трошак стварно преузете робе по газдинствима</h3>'+purchaseCards+'</section>'+
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
      const packageMeasureLabel=(count,size,unit)=>{const n=Number(count),s=Number(size),total=n*s,u=esc(unit||'');return Number.isFinite(n)&&Number.isFinite(s)&&s>0?n.toLocaleString('sr-RS',{maximumFractionDigits:3})+' × '+s.toLocaleString('sr-RS',{maximumFractionDigits:3})+' '+u+' (укупно '+total.toLocaleString('sr-RS',{maximumFractionDigits:3})+' '+u+')':packageCountLabel(n)};
      const phoneDisplay=value=>{const raw=String(value||''),digits=raw.replace(/\D/g,'');if(digits.startsWith('381')&&digits.length===12)return '+381 '+digits.slice(3,5)+' '+digits.slice(5,8)+' '+digits.slice(8);if(digits.startsWith('0')&&digits.length===10)return digits.slice(0,3)+' '+digits.slice(3,6)+' '+digits.slice(6);return raw};
      const itemById=new Map(state.items.map(item=>[String(item.id),item]));
      const pickupByItem=new Map(),invalidItemIds=new Set(),invalidProductPairs=new Set();
      const productPair=row=>String(row.product_id??'')+'::'+String(row.variant_id??'');
      deliverySaveGroups=new Map();

      /* ПРЕУЗИМАЊЕ СЕ ВОДИ ПО ПРОИЗВОДУ И ВАРИЈАНТИ — БЕЗ РУЧНЕ РАСПОДЕЛЕ КУПЦИМА */
      const pickupPool=new Map(),demandPool=new Map();
      for(const item of state.items){const pair=productPair(item);demandPool.set(pair,(demandPool.get(pair)||0)+Math.max(0,Number(item.package_count)||0))}
      for(const allocation of state.procurementAllocations){
        const pair=productPair(allocation),packages=Math.max(0,Number(allocation.preuzeto_pakovanja)||0);
        if(packages<=0)continue;
        if(!pickupPool.has(pair))pickupPool.set(pair,{total:0,allocations:[]});
        const pool=pickupPool.get(pair);pool.total+=packages;pool.allocations.push(allocation);
      }
      const partialPickupPairs=new Set(),requestedPool=new Map();
      const requestedPackagesFor=item=>{
        const ordered=Math.max(0,Number(item.package_count)||0),variant=variantMap.get(String(item.variant_id)),size=Number(item.package_size||variant?.package_value);
        const raw=item.kolicina_za_isporuku;
        return raw!==null&&raw!==undefined&&raw!==''&&Number.isFinite(size)&&size>0?Math.min(ordered,Math.max(0,Number(raw)/size)):ordered;
      };
      for(const item of state.items){const pair=productPair(item);requestedPool.set(pair,(requestedPool.get(pair)||0)+requestedPackagesFor(item));}
      for(const [pair,pool] of pickupPool){
        const demand=demandPool.get(pair)||0,items=state.items.filter(item=>productPair(item)===pair);
        if(pool.total+0.000001<demand){
          partialPickupPairs.add(pair);
          const requested=requestedPool.get(pair)||0;
          /* При мањку, купци се не бирају аутоматски по редоследу: припрема поруџбина одређује количину сваког купца. */
          if(requested>pool.total+0.000001){invalidProductPairs.add(pair);continue;}
          for(const item of items){const quantity=requestedPackagesFor(item);if(quantity>0)pickupByItem.set(String(item.id),[{quantity,allocation:null,pickedAtFarm:pool.total,exceedsPickup:false,autoPool:true,preparedOrderQuantity:true}]);}
          continue;
        }
        for(const item of items){
          const quantity=Math.max(0,Number(item.package_count)||0);
          if(quantity>0)pickupByItem.set(String(item.id),[{quantity,allocation:null,pickedAtFarm:pool.total,exceedsPickup:false,autoPool:true}]);
        }
      }
      const surplusByPair=new Map();
      for(const [pair,pool] of pickupPool){const surplus=Math.max(0,pool.total-(demandPool.get(pair)||0));if(surplus>0)surplusByPair.set(pair,surplus)}

      const pickupAlertHtml='';
      const lineSaleValue=item=>{
        if(hasNumber(item.cena_stavke))return Number(item.cena_stavke);
        if(hasNumber(item.unit_price)&&hasNumber(item.package_count))return Number(item.unit_price)*Number(item.package_count);
        const fallbackPrice=salePriceFor(item),count=Number(item.package_count);
        return fallbackPrice!==null&&Number.isFinite(count)&&count>=0?fallbackPrice*count:null;
      };
      const salePricePerPackage=item=>{
        const count=Number(item.package_count),total=lineSaleValue(item);
        if(total!==null&&Number.isFinite(count)&&count>0)return total/count;
        return hasNumber(item.unit_price)?Number(item.unit_price):salePriceFor(item);
      };
      let purchaseTotal=0,purchaseKnown=true;
      for(const row of state.procurementAllocations){
        const picked=Math.max(0,Number(row.preuzeto_pakovanja)||0);
        if(picked<=0)continue;
        if(!hasNumber(row.nabavna_cena))purchaseKnown=false;else purchaseTotal+=picked*Number(row.nabavna_cena);
      }
      /* Просечна евидентирана набавна цена по производу и варијанти — за информативни збир по купцу. */
      const farmUnitCostByPair=new Map();
      for(const row of state.procurementAllocations){
        const pair=productPair(row),qty=Math.max(0,Number(row.preuzeto_pakovanja)||0);
        if(qty<=0)continue;
        if(!farmUnitCostByPair.has(pair))farmUnitCostByPair.set(pair,{qty:0,cost:0,known:true});
        const cost=farmUnitCostByPair.get(pair);
        if(!hasNumber(row.nabavna_cena))cost.known=false;
        else cost.cost+=qty*Number(row.nabavna_cena);
        cost.qty+=qty;
      }
      for(const cost of farmUnitCostByPair.values()){
        cost.unitCost=cost.known&&cost.qty>0?cost.cost/cost.qty:null;
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
        }
        if(invalid){chargeKnown=false;continue}
        if(packages>0){if(!Number.isFinite(size)||size<=0)chargeKnown=false;else {const price=salePricePerPackage(item);if(price===null)chargeKnown=false;else chargeTotal+=packages*price}}
      }
      const marginKnown=purchaseKnown&&orderedSaleKnown;
      const marginTotal=marginKnown?orderedSaleTotal-purchaseTotal:null;
      const summary='<section class="nd-ops-delivery-summary" aria-label="Укупни финансијски преглед туре">'+
        '<div><small>Укупна набавна вредност</small><strong>'+money(purchaseKnown?purchaseTotal:null)+'</strong></div>'+
        '<div><small>Укупна продајна вредност</small><strong>'+money(orderedSaleKnown?orderedSaleTotal:null)+'</strong></div>'+
        '<div><small>Укупна разлика</small><strong>'+money(marginTotal)+'</strong></div>'+
        '</section><div class="nd-ops-delivery-overview"><span>'+activeOrders.length+' активних поруџбина</span><span>'+activeCustomerIds.size+' купаца</span><span>'+completedCount+' завршених</span></div>';

      const renderCustomerGroup=(pointKey,customerId,orders)=>{
        const customer=customerMap.get(orders[0]?.kupac_id),groupKey=String(pointKey)+':'+String(customerId),descriptors=[];
        let customerOrdered=0,customerOrderedKnown=true,customerCharge=0,customerChargeKnown=true,checkedLines=0,totalLines=0,hasIssue=false,excludedLines=0;
        let farmDemandPackages=0,farmPickedPackages=0,farmValue=0,farmValueKnown=true,unallocatedPartialPickup=false;
        const orderHtml=orders.map(order=>{
          const orderItems=state.items.filter(item=>String(item.porudzbina_id)===String(order.id));
          const rows=orderItems.map(item=>{
            totalLines++;
            const product=productMap.get(item.product_id),variant=variantMap.get(item.variant_id);
            const ordered=Math.max(0,Number(item.package_count)||0),pickupRows=pickupByItem.get(String(item.id))||[];
            const picked=pickupRows.reduce((sum,row)=>sum+row.quantity,0),size=Number(item.package_size||variant?.package_value);
            farmDemandPackages+=ordered;
            farmPickedPackages+=picked;
            if(partialPickupPairs.has(productPair(item))&&invalidProductPairs.has(productPair(item)))unallocatedPartialPickup=true;
            const farmCost=farmUnitCostByPair.get(productPair(item));
            if(!farmCost||farmCost.unitCost===null)farmValueKnown=false;else farmValue+=ordered*farmCost.unitCost;
            const requestedPackages=Number.isFinite(Number(item.kolicina_za_isporuku))&&item.kolicina_za_isporuku!==null&&item.kolicina_za_isporuku!==''&&Number.isFinite(size)&&size>0?Math.max(0,Number(item.kolicina_za_isporuku)/size):ordered,available=partialPickupPairs.has(productPair(item))?Math.min(ordered,requestedPackages):Math.min(ordered,picked,requestedPackages),deliveredBase=Math.max(0,Number(item.isporucena_kolicina)||0);
            const deliveredPackages=Number.isFinite(size)&&size>0?deliveredBase/size:0;
            const dataIssue=invalidItemIds.has(String(item.id))||invalidProductPairs.has(productPair(item))||
              picked>ordered+0.000001||deliveredPackages>available+0.000001||!Number.isFinite(size)||size<=0;
            const checked=item.stavka_cekirana===true,unavailable=item.status_stavke==='upitno';
            const deficitPackages=Math.max(0,ordered-picked),deliveryDeficitPackages=Math.max(0,ordered-(checked?deliveredPackages:available));
            if(checked&&!unavailable)checkedLines++;if(dataIssue||unavailable)hasIssue=true;if(unavailable)excludedLines++;
            const sale=lineSaleValue(item);if(sale===null)customerOrderedKnown=false;else customerOrdered+=sale;
            const billablePackages=checked?deliveredPackages:0;
            if(dataIssue)customerChargeKnown=false;
            if(billablePackages>0){const price=salePricePerPackage(item);if(price===null||!Number.isFinite(size)||size<=0)customerChargeKnown=false;else customerCharge+=billablePackages*price}
            const partialShortage=partialPickupPairs.has(productPair(item));
            const status=unavailable?'УПИТНО':checked?'✓ Готово':dataIssue?'Провери податке':
              partialShortage?(invalidProductPairs.has(productPair(item))?'КОЛИЧИНЕ ЗА ИСПОРУКУ ПРЕЛАЗЕ ПРЕУЗЕТО':'ПРЕУЗЕТО ПО ПРИПРЕМИ ПОРУЏБИНА'):
              picked+0.000001>=ordered&&ordered>0?'Роба доступна за доставу':
              picked>0?'Делимично преузето · недостаје '+packageCountLabel(deficitPackages):
              'Није преузето · недостаје '+packageCountLabel(deficitPackages);
            const statusClass=unavailable?'missing':checked?'complete':dataIssue?'missing':partialShortage?'partial':picked+0.000001>=ordered&&ordered>0?'complete':picked>0?'partial':'missing';
            const pickupMatchesOrder=Math.abs(ordered-picked)<=0.000001;
            const itemStatusHtml=status&&!(pickupMatchesOrder&&!unavailable&&!dataIssue&&status!=='✓ Готово')?'<span class="nd-ops-delivery-status '+statusClass+'">'+status+'</span>':'';
            const pairPickupTotal=pickupPool.get(productPair(item))?.total||0;const farmLines=partialShortage?'<small>Физички преузето: '+packageCountLabel(pairPickupTotal)+' · наручено: '+packageCountLabel(demandPool.get(productPair(item))||0)+' · припремљено за испоруку: '+packageCountLabel(requestedPool.get(productPair(item))||0)+(invalidProductPairs.has(productPair(item))?' · Умањи количине у „Поруџбинама“ док збир не буде у оквиру преузетог.':' · купчеве количине су узете из припреме поруџбина.')+'</small>':(deficitPackages>0||unavailable||dataIssue)?(picked>0?'<small>Преузето од газдинстава: '+packageCountLabel(picked)+'</small>':'<small>Нема евидентираног преузимања овог производа.</small>'):'';
            const inputValue=checked?deliveredPackages:available,editable=canReadProducts&&state.tour.status==='processing'&&!dataIssue&&!unavailable&&!checked;
            const deliveryUnitPrice=salePricePerPackage(item);
            const deliveryLineAmount=deliveryUnitPrice!==null&&Number.isFinite(Number(inputValue))?Number(inputValue)*deliveryUnitPrice:null;
            descriptors.push({order,item,availablePackages:available,packageSize:size,hasDataIssue:dataIssue,isUnavailable:unavailable});
            const deficitLabel=deficitPackages>0?packageCountLabel(deficitPackages)+' · '+packageAmountLabel(deficitPackages,size,item.package_unit):'Нема мањка';
            const comparisonHtml=(deficitPackages>0||unavailable||dataIssue)?'<div class="nd-ops-delivery-compare"><span><b>Наручено:</b> '+packageCountLabel(ordered)+' ('+packageAmountLabel(ordered,size,item.package_unit||variant?.package_unit||variant?.unit)+')</span><span><b>Преузето:</b> '+packageCountLabel(picked)+' ('+packageAmountLabel(picked,size,item.package_unit||variant?.package_unit||variant?.unit)+')</span>'+(deficitPackages>0?'<strong class="nd-ops-delivery-deficit">Недостаје: '+packageCountLabel(deficitPackages)+' ('+packageAmountLabel(deficitPackages,size,item.package_unit||variant?.package_unit||variant?.unit)+') · не предаје се</strong>':'')+((unavailable||dataIssue)?'<strong class="nd-ops-delivery-deficit">'+(unavailable?'Нема за купца · упитно · не предаје се':'Провери податке · не предаје се')+'</strong>':'')+'</div>':'';
            return '<div class="nd-ops-delivery-item nd-ops-delivery-compact'+(unavailable?' is-unavailable':deliveryDeficitPackages>0?' has-deficit':'')+'" data-delivery-item-card="'+esc(item.id)+'" role="group" tabindex="0" aria-label="Изабери ставку и унеси количину за предају"><div class="nd-ops-delivery-item-head">'+itemStatusHtml+'</div>'+
              '<div class="nd-ops-delivery-main">'+
              '<div class="nd-ops-delivery-column nd-ops-delivery-column-product"><div class="nd-ops-delivery-product-info"><strong class="nd-ops-delivery-product-name">'+esc(product?.name||'Производ није доступан')+'</strong></div></div>'+
              '<div class="nd-ops-delivery-column nd-ops-delivery-column-order"><span class="nd-ops-delivery-ordered">'+packageCountLabel(ordered)+' × '+(Number.isFinite(Number(size))?Number(size).toLocaleString('sr-RS',{maximumFractionDigits:3}):'—')+' '+esc(item.package_unit||variant?.package_unit||variant?.unit||'')+'</span><span class="nd-ops-delivery-package">'+packageAmountLabel(ordered,size,item.package_unit||variant?.package_unit||variant?.unit)+'</span></div>'+
              '<div class="nd-ops-delivery-column nd-ops-delivery-column-pickup"><div class="nd-ops-delivery-action"><label class="nd-ops-delivery-qty-wrap"><input type="number" min="0" max="'+String(available)+'" step="0.001" inputmode="decimal" data-delivery-qty="'+esc(item.id)+
              '" value="'+String(inputValue)+'" '+(editable?'':'disabled')+'><small>пак.</small></label>'+
              '<button type="button" class="nd-ops-delivery-quick'+(checked?' is-complete':'')+'" data-confirm-delivery="'+esc(item.id)+'" '+(editable?'':'disabled')+'>'+(checked?'✓ Готово':'Потврди')+'</button></div>'+
              '<div class="nd-ops-delivery-price-row"><span class="nd-ops-delivery-unit-price">'+(unavailable?'Цена није доступна':money(deliveryUnitPrice).replace(/\s*дин\.$/,'')+' дин./пак.')+'</span><strong class="nd-ops-delivery-line-total" data-delivery-line-amount="'+esc(item.id)+'">'+(unavailable?'—':money(deliveryLineAmount))+'</strong></div></div></div>'+comparisonHtml+
              '<div class="nd-ops-delivery-farms">'+farmLines+'</div></div>';
          }).join('');
          const orderSale=orderItems.reduce((sum,item)=>sum+(lineSaleValue(item)??0),0);
          return '<div class="nd-ops-delivery-order"><div class="nd-ops-delivery-order-head"><strong>Поруџбина #'+esc(order.id)+
            '</strong><span>'+orderItems.length+' '+(orderItems.length===1?'ставка':orderItems.length>=2&&orderItems.length<=4?'ставке':'ставки')+'</span></div>'+
            (order.adresa_dostave?'<small>Адреса: '+esc(order.adresa_dostave)+'</small>':'')+
            '<div class="nd-ops-delivery-items">'+(rows||'<small>Нема ставки у поруџбини.</small>')+'</div>'+
            '</div>';
        }).join('');
        deliverySaveGroups.set(groupKey,{orders,lines:descriptors});
        const status=hasIssue?'Провери податке':checkedLines===0?'Чека потврду':checkedLines===totalLines?'Све ставке потврђене':'Делимично потврђено';
        const statusClass=hasIssue?'missing':checkedLines===totalLines?'complete':checkedLines?'partial':'neutral';
        const phone=customer?.telefon||orders[0]?.telefon||'';
        return '<article class="nd-ops-delivery-customer" data-delivery-group="'+esc(groupKey)+'"><div class="nd-ops-delivery-customer-head"><div><strong>'+
          esc(customer?.ime_prezime||('Купац #'+(orders[0]?.kupac_id??'—')))+
          (phone?'<a class="nd-ops-delivery-customer-phone" href="tel:'+esc(String(phone).replace(/[^0-9+]/g,''))+'">☎ '+esc(phoneDisplay(phone))+'</a>':'')+
          '<small class="nd-ops-delivery-order-refs">'+orders.map(order=>'#'+esc(order.id)).join(' · ')+'</small>'+
          '</div><span class="nd-ops-delivery-status '+statusClass+'">'+status+'</span></div>'+
          orderHtml+
          '<div class="nd-ops-delivery-customer-charge"><span>ЗА НАПЛАТУ ОД КУПЦА</span><strong data-customer-charge>'+money(customerChargeKnown?customerCharge:null)+'</strong></div>'+
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
          if(item.status_stavke==='upitno')continue;
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
          if(item.stavka_cekirana===true&&packages>0){if(!Number.isFinite(size)||size<=0)known=false;else {const price=salePricePerPackage(item);if(price===null)known=false;else total+=packages*price}}
        }
        const totalNode=shell.querySelector('[data-charge-total]');
        if(totalNode)totalNode.textContent=money(known?total:null);
        for(const card of shell.querySelectorAll('.nd-ops-delivery-customer')){
          const group=deliverySaveGroups.get(card.dataset.deliveryGroup);
          if(!group)continue;
          let sum=0,customerKnown=true;
          for(const line of group.lines){
            if(line.isUnavailable)continue;
            const input=card.querySelector('[data-delivery-qty="'+line.item.id+'"]');
            const lineAmountNode=card.querySelector('[data-delivery-line-amount="'+line.item.id+'"]');
            const linePrice=salePricePerPackage(line.item);
            const linePackages=input&&Number.isFinite(Number(input.value))?Number(input.value):line.availablePackages;
            if(lineAmountNode)lineAmountNode.textContent=line.isUnavailable||linePrice===null||!Number.isFinite(linePackages)||linePackages<0?'—':money(linePackages*linePrice);
            const size=Number(line.item.package_size||state.variants.find(variant=>String(variant.id)===String(line.item.variant_id))?.package_value);
            const packages=line.item.stavka_cekirana===true?
              (Number(line.item.isporucena_kolicina)||0)/(Number.isFinite(size)&&size>0?size:1):line.availablePackages;
            if(line.hasDataIssue||!Number.isFinite(packages)||packages<0){if(line.hasDataIssue)customerKnown=false;continue}
            if(packages>0){const price=salePricePerPackage(line.item);if(price===null)customerKnown=false;else sum+=packages*price}
          }
          const node=card.querySelector('[data-customer-charge]');if(node)node.textContent=group.lines.length>0&&group.lines.every(line=>line.isUnavailable)?'НЕ ОБРАЧУНАВА СЕ':money(customerKnown?sum:null);
        }
      };
      body=pickupAlertHtml+summary+'<div class="nd-ops-delivery-overview"><strong>'+remainingPoints.length+' преосталих пунктова</strong><span>'+pointWork.filter(row=>row.remaining.length===0).length+' завршених</span></div>'+(pointSections||'')+(unassignedSection||'')+
        (activeOrders.length===0?'<div class="nd-ops-empty">Све поруџбине су завршене. Нема активних испорука.</div>':'');
      /* У ВОЗИЛУ — целокупно стање по активној тури, производу и амбалажи */
      const vehicleGroups=new Map();
      const ensureVehicleGroup=(productId,variantId)=>{
        const key=String(productId??'')+'::'+String(variantId??'');
        if(!vehicleGroups.has(key)){
          const product=productMap.get(productId),variant=variantMap.get(variantId);
          vehicleGroups.set(key,{key,productId,variantId,name:product?.name||'Производ није доступан',
            variant:variant?.name||variant?.size_label||'Амбалажа није наведена',
            ordered:0,requested:0,delivered:0,picked:0});
        }
        return vehicleGroups.get(key);
      };
      for(const item of state.items){
        const group=ensureVehicleGroup(item.product_id,item.variant_id);
        group.ordered+=Math.max(0,Number(item.package_count)||0);
      }
      for(const allocation of state.procurementAllocations){
        const group=ensureVehicleGroup(allocation.product_id,allocation.variant_id);
        const requested=Math.max(0,Number(allocation.broj_pakovanja)||0);
        const confirmed=Math.max(0,Number(allocation.potvrdjeno_pakovanja)||0);
        group.requested+=allocation.naruceno===true?requested:0;
        group.delivered+=allocation.naruceno===true?confirmed:0;
        group.picked+=Math.max(0,Number(allocation.preuzeto_pakovanja)||0);
      }
      const vehicleList=[...vehicleGroups.values()].sort((a,b)=>(a.name+' '+a.variant).localeCompare(b.name+' '+b.variant,'sr'));
      const vehicleOrdered=vehicleList.reduce((sum,g)=>sum+g.ordered,0);
      const vehicleRequested=vehicleList.reduce((sum,g)=>sum+g.requested,0);
      const vehicleDelivered=vehicleList.reduce((sum,g)=>sum+g.delivered,0);
      const vehiclePicked=vehicleList.reduce((sum,g)=>sum+g.picked,0);
      const vehicleQty=value=>Number(value).toLocaleString('sr-RS',{maximumFractionDigits:3});
      const vehicleProducts=new Map();
      vehicleList.forEach(group=>{
        const productKey=String(group.productId??'');
        if(!vehicleProducts.has(productKey))vehicleProducts.set(productKey,{productId:group.productId,name:group.name,packages:[]});
        vehicleProducts.get(productKey).packages.push(group);
      });
      const vehicleRows=[...vehicleProducts.values()].sort((a,b)=>a.name.localeCompare(b.name,'sr')).map(product=>{
        const packageMarkup=product.packages.map(group=>{
          const requestedGap=Math.max(0,group.ordered-group.requested);
          const confirmationGap=Math.max(0,group.requested-group.delivered);
          const vehicleGap=Math.max(0,group.delivered-group.picked);
          const status=group.picked>group.delivered+0.000001
            ?'Провери вишак преузимања · '+vehicleQty(group.picked-group.delivered)+' пак.'
            :requestedGap>0.000001
              ?'Није требовано од газдинства · '+vehicleQty(requestedGap)+' пак.'
              :confirmationGap>0.000001
                ?'Чека се потврда · '+vehicleQty(confirmationGap)+' пак.'
                :vehicleGap>0.000001
                  ?'Потврђено, није у возилу · '+vehicleQty(vehicleGap)+' пак.'
                  :'Количине су усклађене';
          const statusClass=group.picked>group.delivered+0.000001?'is-error':requestedGap>0.000001||confirmationGap>0.000001||vehicleGap>0.000001?'is-warning':'is-ok';
          return '<section class="nd-vehicle-package">'+
            '<div class="nd-vehicle-package-name">'+esc(group.variant)+'</div>'+
            '<div class="nd-vehicle-metrics">'+
            '<div class="nd-vehicle-metric"><small>Купци наручили</small><strong>'+vehicleQty(group.ordered)+'</strong><span>пак.</span></div>'+
            '<div class="nd-vehicle-metric"><small>Газдинствима тражено</small><strong>'+vehicleQty(group.requested)+'</strong><span>пак.</span></div>'+
            '<div class="nd-vehicle-metric"><small>Газдинства потврдила</small><strong>'+vehicleQty(group.delivered)+'</strong><span>пак.</span></div>'+
            '<div class="nd-vehicle-metric"><small>Физички преузето</small><strong>'+vehicleQty(group.picked)+'</strong><span>пак.</span></div></div>'+
            '<div class="nd-vehicle-status '+statusClass+'">'+esc(status)+'</div></section>';
        }).join('');
        return '<article class="nd-vehicle-product"><header class="nd-vehicle-product-head"><strong>'+esc(product.name)+'</strong></header>'+packageMarkup+'</article>';
      }).join('');
      const vehicleHtml='<section class="nd-vehicle-list"><div class="nd-vehicle-summary">'+
        '<div><small>Купци наручили</small><strong>'+vehicleQty(vehicleOrdered)+' пак.</strong></div>'+
        '<div><small>Газдинствима тражено</small><strong>'+vehicleQty(vehicleRequested)+' пак.</strong></div>'+
        '<div><small>Газдинства потврдила</small><strong>'+vehicleQty(vehicleDelivered)+' пак.</strong></div>'+
        '<div class="is-clear"><small>Физички преузето · у возилу</small><strong>'+vehicleQty(vehiclePicked)+' пак.</strong></div></div>'+
        (vehicleRows||'<div class="nd-ops-empty">У активној тури нема ставки производа.</div>')+
        '<p class="nd-vehicle-note">Приказ је само евиденција тренутног стања робе у возилу. Количине се овде не уносе и не мењају.</p></section>';
      const deliveryTabs='<nav class="nd-ops-delivery-tabs" aria-label="Приказ доставе"><button type="button" data-delivery-view="routes" aria-pressed="'+(deliveryView==='routes'?'true':'false')+'" class="'+(deliveryView==='routes'?'is-active':'')+'">Пунктови и испорука</button><button type="button" data-delivery-view="vehicle" aria-pressed="'+(deliveryView==='vehicle'?'true':'false')+'" class="'+(deliveryView==='vehicle'?'is-active':'')+'">У возилу</button></nav>';
      if(deliveryView==='vehicle')body=pickupAlertHtml+vehicleHtml;
      body=deliveryTabs+body;
      if(deliveryView!=='vehicle')body+='<button type="button" class="nd-ops-calculator-launch" data-calculator-open>⌗ Калкулатор</button>'+
        '<div class="nd-ops-calculator-overlay" data-calculator-overlay hidden><section class="nd-ops-calculator" role="dialog" aria-modal="true" aria-labelledby="ndCalculatorTitle">'+
        '<header><strong id="ndCalculatorTitle">Калкулатор</strong><button type="button" data-calculator-close aria-label="Затвори">×</button></header>'+
        '<div class="nd-ops-calculator-screen"><small data-calculator-expression>Рачунање</small><output data-calculator-display>0</output></div>'+
        '<div class="nd-ops-calculator-keys">'+['7','8','9','÷','4','5','6','×','1','2','3','−','C','0',',','+','(',')','⌫','='].map(key=>'<button type="button" data-calculator-key="'+key+'" class="'+(['÷','×','−','+','='].includes(key)?'operator':'')+(key==='='?' equals':'')+(key==='C'?' clear':'')+'">'+key+'</button>').join('')+'</div>'+
        '<small class="nd-ops-calculator-note">Самосталан рачун · не мења износ купца нити податке туре</small></section></div>';
    }
    if(groupedOrdersView){groupedOrdersView.destroy();groupedOrdersView=null;}
    const vehicleOnly=activeTab==='delivery'&&deliveryView==='vehicle';
    shell.classList.toggle('nd-tour-ops-vehicle-only',vehicleOnly);
    shell.classList.toggle('nd-tour-ops-delivery',activeTab==='delivery');
    const opsHeader=vehicleOnly
      ?'<header class="nd-ops-head nd-vehicle-head"><div><small>УТОВАР · ТУРА #'+esc(tourId)+'</small><h1>'+title+'</h1><p>'+fmtDate(state.tour.datum)+'</p></div><button type="button" data-back>← Назад</button></header>'
      :'<header class="nd-ops-head"><div><small>'+(activeTab==='report'?'ФИНАНСИЈСКИ ИЗВЕШТАЈ':'ОПЕРАТИВНИ ПРЕГЛЕД')+' · #'+esc(tourId)+'</small><h1>'+title+'</h1><p>'+fmtDate(state.tour.datum)+' · '+esc(String(state.tour.status||'').toUpperCase())+'</p><div class="nd-ops-stats"><span>'+state.orders.length+' поруџбина</span><span>'+state.items.length+' ставки</span><span>'+state.customers.length+' купаца</span></div>'+(state.tour.status==='open'&&['admin','super_admin'].includes(role)?'<button type="button" data-tour-processing '+(statusBusy?'disabled':'')+'>'+(statusBusy?'Пребацујем…':'Затвори пријем · пребаци у обраду')+'</button>':'')+'</div>'+(canReadProducts?'<button type="button" data-open-report>Финансијски извештај</button>':'')+'<button type="button" data-back>← Назад</button></header>';
    document.querySelector('.nd-workspace .nd-topbar > .nd-ops-head')?.remove();
    shell.innerHTML=opsHeader+'<section class="nd-ops-content" data-ops-content>'+body+'</section>'+(vehicleOnly?'':'<footer class="nd-ops-foot"><span>Само читање · Подаци из Supabase</span><button type="button" data-refresh>Освежи</button></footer>');
    /* Оперативни HERO се премешта у глобално заглавље да би мени и подаци туре били у истом реду. */
    const compactOpsHead=shell.querySelector('.nd-ops-head');
    compactOpsHead?.querySelector('[data-back]')?.addEventListener('click',onBack);
    compactOpsHead?.querySelector('[data-open-report]')?.addEventListener('click',()=>{if(activeTab==='report')return;returnFromReport=activeTab;activeTab='report';render();});
    shell.querySelector('[data-report-print]')?.addEventListener('click',()=>window.print());
    shell.querySelectorAll('[data-delivery-view]').forEach(button=>button.addEventListener('click',()=>{deliveryView=button.dataset.deliveryView==='vehicle'?'vehicle':'routes';render();}));
    shell.querySelector('[data-report-back]')?.addEventListener('click',()=>{activeTab=['orders','products','delivery','traceability'].includes(returnFromReport)?returnFromReport:'orders';render();});
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
      import('./orders/tour-orders-grouped-view.js?v=1.3.10').then(mod=>{
        if(disposed || activeTab!=='orders') return;
        const target=shell.querySelector('[data-grouped-orders-root]');
        if(!target) return;
        groupedOrdersView=mod.mountTourOrdersGroupedView({root:target,client,orders:state.orders,items:state.items,customers:state.customers,points:state.points,products:state.products,variants:state.variants,procurementAllocations:state.procurementAllocations,tourId,tourStops:state.tourStops,canManage:canManageOrders,onOpenOrder:async orderId=>{try{const sheet=await orderSheetPromise;await sheet.open(orderId)}catch(error){showError(error)}},onRefresh:()=>load()});
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
        if(line.item.status_stavke==='upitno'){if(feedback)feedback.textContent='Ова ставка је означена као УПИТНО и не може да се потврди у достави.';return;}
        const packages=Number(input.value);
        try{
          if(line.hasDataIssue)throw new Error('Постоји неусаглашеност у расподели. Ставка није потврђена.');
          if(!Number.isFinite(packages)||packages<0||packages>line.availablePackages+0.000001)
            throw new Error('Унеси количину до наручене количине.');
          const pair=productPairKey(line.item),poolLimit=state.procurementAllocations.filter(row=>productPairKey(row)===pair).reduce((sum,row)=>sum+Math.max(0,Number(row.preuzeto_pakovanja)||0),0);
          const packageSize=Number(line.item.package_size)||Number(state.variants.find(v=>String(v.id)===String(line.item.variant_id))?.package_value)||1;
          const alreadyDelivered=state.items.filter(row=>productPairKey(row)===pair).reduce((sum,row)=>sum+(Number(row.isporucena_kolicina)||0)/(Number(row.package_size)||Number(state.variants.find(v=>String(v.id)===String(row.variant_id))?.package_value)||1),0);
          const currentDelivered=(Number(line.item.isporucena_kolicina)||0)/packageSize;
          if(alreadyDelivered-currentDelivered+packages>poolLimit+0.000001)
            throw new Error('Недовољно преузете робе. Физички је преузето '+packageCountLabel(poolLimit)+'. Изабери мању количину или другог купца.');
          if(!Number.isFinite(line.packageSize)||line.packageSize<=0)throw new Error('Недостаје величина паковања за ову ставку.');
          deliveryBusy=true;button.disabled=true;button.textContent='ЧУВАМ ПОТВРДУ…';
          if(feedback)feedback.textContent='Чувам предату количину и проверавам одговор базе…';
          const baseQuantity=Number((packages*line.packageSize).toFixed(6));
          const result=await client.from('stavke_porudzbine').update({
            isporucena_kolicina:baseQuantity,stavka_cekirana:true
          }).eq('id',line.item.id).eq('tura_id',tourId)
            .select('id,isporucena_kolicina,stavka_cekirana').maybeSingle();
          if(result.error)throw result.error;
          if(!result.data||result.data.stavka_cekirana!==true||
            Math.abs(Number(result.data.isporucena_kolicina)-baseQuantity)>0.000001)
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
    const topbar=document.querySelector('.nd-workspace .nd-topbar');
    if(activeTab==='delivery'&&compactOpsHead){compactOpsHead.classList.add('nd-ops-delivery-local-head');shell.prepend(compactOpsHead);}
    else if(topbar&&compactOpsHead)topbar.append(compactOpsHead);
  }
  function showError(error){document.querySelector('.nd-workspace .nd-topbar > .nd-ops-head')?.remove();shell.innerHTML='<div class="nd-ops-error"><strong>Подаци нису учитани</strong><p>'+esc(error.message||String(error))+'</p><button type="button" data-back>Назад</button></div>';shell.querySelector('[data-back]').addEventListener('click',onBack)}
  try { await load(); } catch(error) { showError(error); }
  return { destroy(){disposed=true;loadToken++;if(groupedOrdersView)groupedOrdersView.destroy();orderSheetPromise.then(sheet=>sheet.destroy()).catch(()=>{});root.replaceChildren();} };
}
