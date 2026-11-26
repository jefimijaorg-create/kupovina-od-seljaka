/*
 * NARUČИ ДОМАЋЕ — PROCUREMENT STAGE VIEW
 * Version: 3.2.1
 * Updated: 2026-11-26
 * Description: Progressive product cards with explicit total and farm-level allocation, requisition, confirmation and pickup.
 * Scope: Existing ADMIN Workspace only.
 */
export function renderProcurementStageView(ctx){
 const {s,host,tourId,client,n,f,e,key,qty,prod,variant,farm,demand,allocated,ordered,allocationsFor,totalNeeded,totalOrdered,totalRemaining,totalCollected,offer,allocation,canConfirmProcurement,canCollectProcurement,history=[],editAllocationRow=null,editAllocationDraft={},editAllocationMode='unsent',buildAllocationSheetHtml,mountAnalyticsPanel}=ctx;
 function render(){
  if(s.disposed)return;
  const writable=s.tour?.status==='processing';
  const requestRows=s.allocations.filter(x=>x.naruceno!==true&&x.viber_status==='not_sent'&&!x.viber_poslato_at&&n(x.naruceno_pakovanja)>n(x.potvrdjeno_pakovanja));
  const requestDemandCount=requestRows.length;
  const totalPackages=selector=>f(s.demands.filter(d=>d.valid).reduce((sum,d)=>sum+selector(d),0));
  const awaitingRequestRows=s.allocations.filter(x=>x.naruceno!==true&&x.viber_status==='not_sent'&&!x.viber_poslato_at&&n(x.naruceno_pakovanja)>n(x.potvrdjeno_pakovanja));
  const confirmRows=s.allocations.filter(x=>canConfirmProcurement(x));
  const customerDistributionRows=s.allocations.filter(x=>n(x.potvrdjeno_pakovanja)>n(x.preuzeto_pakovanja));
  const confirmStageRows=[...new Map([...awaitingRequestRows,...confirmRows,...customerDistributionRows].map(row=>[String(row.id),row])).values()];
  const collectRows=s.allocations.filter(x=>canCollectProcurement(x));
  if(s.stage==='confirm'&&!confirmStageRows.length)s.stage='request';
  const confirmFarmRows=s.confirmFarmFilter?confirmStageRows.filter(row=>String(row.gazdinstvo_id)===String(s.confirmFarmFilter)):confirmStageRows;
  const rows=s.stage==='confirm'?confirmFarmRows:s.stage==='collect'?collectRows:[];
  const groupByFarms=s.stage==='confirm'||s.stage==='collect'||s.view==='farms';
  const confirmFarmOptions=[...new Map(confirmStageRows.map(row=>[String(row.gazdinstvo_id),farm(row.gazdinstvo_id)?.name||('Газдинство #'+row.gazdinstvo_id)]))];
  const confirmFarmFilterHtml=s.stage==='confirm'?'<div class="ndp3-product-search-wrap"><label class="ndp3-stage-line-meta" for="confirm-farm-select">Изабери газдинство за потврду</label><select id="confirm-farm-select" class="ndp3-farm-search" data-confirm-farm-filter><option value="">Сва газдинства · '+confirmFarmOptions.length+'</option>'+confirmFarmOptions.map(([id,name])=>'<option value="'+e(id)+'" '+(String(s.confirmFarmFilter||'')===id?'selected':'')+'>'+e(name)+'</option>').join('')+'</select></div>':'';
  const transferCandidates=row=>{const ids=[...new Set(s.offers.filter(o=>o.is_active===true&&String(o.product_id)===String(row.product_id)&&String(o.variant_id)===String(row.variant_id)&&String(o.gazdinstvo_id)!==String(row.gazdinstvo_id)).map(o=>String(o.gazdinstvo_id)))];return ids.map(id=>farm(id)).filter(Boolean);};
  const sourceSummary=d=>{const totals=new Map();(d?.sourceOrders||[]).forEach(x=>{const id=x.orderId===null||x.orderId===undefined?'без броја':String(x.orderId);totals.set(id,(totals.get(id)||0)+n(x.packageCount));});return [...totals].map(([id,count])=>(id==='без броја'?'Изворна ставка':'Поруџбина #'+id)+' · '+f(count)+' пак.').join(' · ')||'Извор поруџбине није доступан';};
  const historyHtml=()=>{
   if(!history.length)return '<div class="ndp3-stage-empty">Нема забележених промена за ову туру.</div>';
   const label={INSERT:'Креирана додела',UPDATE:'Измењена додела',DELETE:'Обрисана додела'};
   const fields=[['broj_pakovanja','Додељено'],['naruceno_pakovanja','Требовано'],['potvrdjeno_pakovanja','Потврђено'],['preuzeto_pakovanja','Преузето'],['viber_status','Статус слања'],['nabavna_cena','Набавна цена']];
   return '<div class="ndp3-history-list">'+history.map(item=>{
    const p=prod(item.product_id),v=variant(item.variant_id),ff=farm(item.gazdinstvo_id),old=item.old_data||{},next=item.new_data||{};
    const changes=fields.filter(([key])=>JSON.stringify(old[key]??null)!==JSON.stringify(next[key]??null)).map(([key,title])=>{
     const before=old[key]??'—',after=next[key]??'—';
     return '<span><small>'+title+'</small><b>'+e(String(before))+' → '+e(String(after))+'</b></span>';
    }).join('');
    const date=item.created_at?new Date(item.created_at).toLocaleString('sr-RS',{dateStyle:'medium',timeStyle:'short'}):'Време није доступно';
    return '<article class="ndp3-history-item"><header><strong>'+e(label[item.operation]||item.operation||'Промена')+'</strong><time>'+e(date)+'</time></header><div class="ndp3-stage-line-title">'+e(p?.name||'Производ')+' · '+e(v?.name||v?.size_label||'Амбалажа')+'</div><div class="ndp3-stage-line-meta">'+e(ff?.name||'Газдинство #'+item.gazdinstvo_id)+' · Актер: '+e(item.actor_role||'непознат')+'</div><div class="ndp3-history-changes">'+(changes||'<span><small>Детаљи</small><b>Нема промене поља у запису</b></span>')+'</div></article>';
   }).join('')+'</div>';
  };
  const packageLabel=count=>f(count)+' паковања';
  const editCustomerRows=editAllocationRow?s.items.filter(item=>String(item.product_id)===String(editAllocationRow.product_id)&&String(item.variant_id)===String(editAllocationRow.variant_id)).sort((a,b)=>Number(a.id)-Number(b.id)):[];
  const editCustomerTotal=editCustomerRows.reduce((sum,item)=>sum+Math.max(0,n(editAllocationDraft[String(item.id)])),0);
  const amountLabel=(count,d)=>qty(count,d);
  const stageTitle=s.stage==='request'?'Требовање':s.stage==='confirm'?'Потврда газдинства':s.stage==='collect'?'Преузимање':s.stage==='debt'?'Преузето и дуговања':'Историја промена';
  const lineHtml=row=>{
   const d=demand(row.product_id,row.variant_id),p=prod(row.product_id),v=variant(row.variant_id),ff=farm(row.gazdinstvo_id);
   const requested=n(row.naruceno_pakovanja),confirmed=n(row.potvrdjeno_pakovanja),collected=n(row.preuzeto_pakovanja);
   const pendingConfirm=Math.max(0,requested-confirmed),pendingCollect=Math.max(0,confirmed-collected);
   const visiblePending=s.stage==='confirm'?pendingConfirm:s.stage==='collect'?pendingCollect:requested;
   const visibleLabel=s.stage==='confirm'?'ЧЕКА ПОТВРДУ':s.stage==='collect'?'ЧЕКА ПРЕУЗИМАЊЕ':'ЗАХТЕВАНО';
   let values='<span><b>'+packageLabel(visiblePending)+'</b><small>'+e(amountLabel(visiblePending,d))+'</small><small class="ndp3-value-label">'+visibleLabel+'</small></span>';
   let controls='';
   if(s.stage==='request'){
    controls='<div class="ndp3-stage-actions"><button class="ndp3-btn primary" data-action="request-confirmation" data-id="'+e(row.id)+'" '+(!writable||s.busy?'disabled':'')+'>Захтевај потврду</button></div>';
   }else if(s.stage==='confirm'&&row.naruceno!==true&&row.viber_status==='not_sent'&&!row.viber_poslato_at){
    controls='<div class="ndp3-stage-actions"><button class="ndp3-btn primary" data-action="request-confirmation" data-id="'+e(row.id)+'" '+(!writable||s.busy?'disabled':'')+'>Захтевај потврду</button><small>Бележи да је захтев упућен. Не шаље Viber поруку.</small></div>';
   }else if(s.stage==='confirm'){
    const initial=confirmed>0?confirmed:requested;
    controls='<div class="ndp3-stage-input"><label>Потврђена количина (паковања)<input type="number" inputmode="numeric" pattern="[0-9]*" min="0" max="'+f(requested)+'" step="1" data-field="potvrdjeno_pakovanja" data-id="'+e(row.id)+'" value="'+f(initial)+'" '+(!writable||s.busy||!canConfirmProcurement(row)?'disabled':'')+'></label><div><div class="ndp3-stage-line-meta">Преостало за потврду: <strong>'+f(Math.max(0,requested-confirmed))+' паковања</strong></div><div class="ndp3-stage-actions"><button class="ndp3-btn primary" data-action="save-field" data-id="'+e(row.id)+'" '+(!writable||s.busy||!canConfirmProcurement(row)?'disabled':'')+'>Потврди количину</button>'+(requested>confirmed&&transferCandidates(row).length?'<button class="ndp3-btn" data-action="open-transfer" data-id="'+e(row.id)+'" '+(!writable||s.busy?'disabled':'')+'>Пренеси непотврђено</button>':'')+(confirmed>0&&collected===0?'<button class="ndp3-btn" data-action="edit-confirmed-customers" data-id="'+e(row.id)+'" '+(!writable||s.busy?'disabled':'')+'>Расподели потврђено по купцима</button>':'')+'</div></div></div>';
   }else{
    controls='<div class="ndp3-stage-input"><label>Стварно преузето (паковања)<input type="number" inputmode="numeric" pattern="[0-9]*" min="'+f(collected)+'" max="'+f(confirmed)+'" step="1" data-field="preuzeto_pakovanja" data-id="'+e(row.id)+'" value="'+f(confirmed)+'" '+(!writable||s.busy||!canCollectProcurement(row)?'disabled':'')+'></label><div><div class="ndp3-stage-line-meta">Преостало за преузимање: <strong>'+f(Math.max(0,confirmed-collected))+' паковања</strong></div><div class="ndp3-stage-actions"><button class="ndp3-btn primary" data-action="save-field" data-id="'+e(row.id)+'" '+(!writable||s.busy||!canCollectProcurement(row)?'disabled':'')+'>Евидентирај преузимање</button></div></div></div>';
   }
   const lineTitle=groupByFarms?(p?.name||'Производ')+' · '+(v?.name||v?.size_label||'Паковање'):(ff?.name||'Газдинство није пронађено');
   const customerTotals=new Map();
   for(const item of s.items.filter(x=>String(x.product_id)===String(row.product_id)&&String(x.variant_id)===String(row.variant_id)&&n(x.package_count)>0)){
    const customerKey=String(item.customer_id??('missing:'+item.id))+'|'+String(item.porudzbina_id??item.id);
    const assignedAll=(item.farm_allocations||[]).reduce((sum,a)=>sum+n(a.broj_pakovanja),0);
    const assignedHere=(item.farm_allocations||[]).filter(a=>String(a.gazdinstvo_id)===String(row.gazdinstvo_id)).reduce((sum,a)=>sum+n(a.broj_pakovanja),0);
    const customer=customerTotals.get(customerKey)||{name:item.customer_name||'Купац није повезан',order:item.porudzbina_id,ordered:0,assigned:0,here:0};
    customer.ordered+=n(item.package_count);customer.assigned+=assignedAll;customer.here+=assignedHere;customerTotals.set(customerKey,customer);
   }
   const customerBreakdown='<div class="ndp3-customer-breakdown"><b>Купци · захтевано и додељено</b>'+([...customerTotals.values()].map(customer=>'<span><strong>'+e(customer.name)+' · поруџбина #'+e(customer.order??'—')+'</strong><small>Наручено '+f(customer.ordered)+' · овом газдинству '+f(customer.here)+' · укупно додељено '+f(customer.assigned)+' · још није додељено '+f(Math.max(0,customer.ordered-customer.assigned))+' пак.</small></span>').join('')||'<small>Нема ставки купаца за ову амбалажу.</small>')+'</div>';
   return '<article class="ndp3-stage-line"><div class="ndp3-stage-line-title">'+e(lineTitle)+'</div><div class="ndp3-stage-line-meta">'+e(ff?.name||'Газдинство није пронађено')+' · '+(d?f(d.packageSize)+' '+e(d.packageUnit)+' по паковању':'Подаци о паковању нису доступни')+'</div>'+customerBreakdown+(s.stage==='collect'?'':'<div class="ndp3-stage-line-meta">Извор: '+e(sourceSummary(d))+'</div>')+'<div class="ndp3-stage-values">'+values+'</div>'+controls+'</article>';
  };
  const groupedRows=()=>{
   const groups=new Map();
   for(const row of rows){
    const groupKey=groupByFarms?String(row.gazdinstvo_id):String(row.product_id);
    if(!groups.has(groupKey))groups.set(groupKey,[]);
    groups.get(groupKey).push(row);
   }
   return [...groups.entries()].map(([groupKey,groupRows])=>{
    const first=groupRows[0],title=groupByFarms?(farm(first.gazdinstvo_id)?.name||'Газдинство #'+first.gazdinstvo_id):(prod(first.product_id)?.name||'Производ');
    let actions='';
    if(s.stage==='request'&&s.view==='farms'){
     actions='<div class="ndp3-stage-actions"><button class="ndp3-btn" data-action="prepare-farm" data-farm-id="'+e(first.gazdinstvo_id)+'" '+(!writable||s.busy?'disabled':'')+'>Пошаљи требовање · Viber</button><button class="ndp3-btn primary" data-action="mark-farm-sent" data-farm-id="'+e(first.gazdinstvo_id)+'" '+(!writable||s.busy?'disabled':'')+'>Означи као послато</button></div>';
    }
    let body='';
    if(groupByFarms){
     body=groupRows.map(lineHtml).join('');
    }else{
     const packages=new Map();
     for(const row of groupRows){
      const id=String(row.variant_id);
      if(!packages.has(id))packages.set(id,[]);
      packages.get(id).push(row);
     }
     body=[...packages.entries()].map(([variantId,packageRows])=>{
      const v=variant(variantId),label=v?.name||v?.size_label||'Амбалажа';
      return '<section class="ndp3-stage-package"><header><strong>'+e(label)+'</strong><span class="ndp3-chip">'+packageRows.length+' газдинстава</span></header>'+packageRows.map(lineHtml).join('')+'</section>';
     }).join('');
    }
    if(s.stage==='collect'&&groupByFarms){
     const pending=groupRows.reduce((sum,row)=>sum+Math.max(0,n(row.potvrdjeno_pakovanja)-n(row.preuzeto_pakovanja)),0);
     return '<details class="ndp3-stage-group ndp3-collect-farm"><summary><span class="ndp3-collect-farm-title">'+e(title)+'</span><span class="ndp3-chip">'+groupRows.length+' ставки</span><span class="ndp3-collect-farm-pending">'+f(pending)+' паковања за преузимање</span></summary><div class="ndp3-collect-farm-body">'+body+'</div></details>';
    }
    return '<section class="ndp3-stage-group"><header><strong>'+e(title)+'</strong><span class="ndp3-chip">'+(groupByFarms?groupRows.length+' ставки':new Set(groupRows.map(x=>String(x.variant_id))).size+' амбалаже')+'</span></header>'+body+actions+'</section>';
   }).join('');
  };
  const requestProductsHtml=(()=>{
   const activeDemand=s.demands.filter(d=>d.valid&&d.productId&&n(d.packages)>0);
   const farmHasDemand=farmId=>activeDemand.some(d=>s.offers.some(o=>o.is_active===true&&String(o.gazdinstvo_id)===String(farmId)&&String(o.product_id)===String(d.productId)&&String(o.variant_id)===String(d.variantId)));
   const farmRows=s.farms.filter(ff=>farmHasDemand(ff.id));
   const remainingForFarm=farmId=>activeDemand.filter(d=>s.offers.some(o=>o.is_active===true&&String(o.gazdinstvo_id)===String(farmId)&&String(o.product_id)===String(d.productId)&&String(o.variant_id)===String(d.variantId))).reduce((sum,d)=>sum+Math.max(0,n(d.packages)-allocated(d.productId,d.variantId)),0)+s.allocations.filter(row=>String(row.gazdinstvo_id)===String(farmId)&&row.naruceno!==true&&row.viber_status==='not_sent'&&!row.viber_poslato_at).reduce((sum,row)=>sum+Math.max(0,n(row.naruceno_pakovanja)-n(row.potvrdjeno_pakovanja)),0);
   const selectedFarm=farm(s.requestFarmFilter);
   const selectedOffers=d=>s.requestFarmFilter&&s.offers.some(o=>o.is_active===true&&String(o.gazdinstvo_id)===String(s.requestFarmFilter)&&String(o.product_id)===String(d.productId)&&String(o.variant_id)===String(d.variantId));
   const buyerRows=d=>{
    const buyers=new Map();
    for(const item of s.items.filter(x=>String(x.product_id)===String(d.productId)&&String(x.variant_id)===String(d.variantId)&&n(x.package_count)>0)){
     const buyerKey=String(item.customer_id??('order:'+item.id))+'|'+String(item.porudzbina_id??item.id);
     const buyer=buyers.get(buyerKey)||{name:item.customer_name||'Купац',count:0};
     buyer.count+=n(item.package_count);buyers.set(buyerKey,buyer);
    }
    return [...buyers.values()];
   };
   const farmPicker='<section class="ndp3-farm-picker" aria-label="Избор газдинства"><div class="ndp3-farm-picker-top"><span class="farm-selector-label">ГАЗДИНСТВО</span><strong>'+(selectedFarm?e(selectedFarm.name||'Изабрано газдинство'):'Изабери газдинство')+'</strong><span class="ndp3-farm-picker-count">'+(selectedFarm?f(remainingForFarm(selectedFarm.id))+' пак. за требовање':farmRows.length+' доступних газдинстава')+'</span></div><div class="farm-chips ndp3-farm-picker-list" role="list">'+farmRows.map(ff=>{const farmAssigned=s.allocations.filter(row=>String(row.gazdinstvo_id)===String(ff.id)).reduce((sum,row)=>sum+n(row.broj_pakovanja),0),farmAvailable=remainingForFarm(ff.id);return '<button type="button" role="listitem" class="farm-chip ndp3-farm-picker-item '+(String(ff.id)===String(s.requestFarmFilter)?'active is-selected':'')+'" data-farm-filter="'+e(ff.id)+'" aria-pressed="'+(String(ff.id)===String(s.requestFarmFilter))+'"><span>'+e(ff.name||'Газдинство #'+ff.id)+'</span><span class="chip-count"><b>Додељено '+f(farmAssigned)+' пак.</b><small>За требовање '+f(farmAvailable)+' пак.</small></span></button>'}).join('')+'</div></section>';
   const products=new Map();
   for(const d of activeDemand){const id=String(d.productId);if(!products.has(id))products.set(id,[]);products.get(id).push(d);}
   const list=[...products.entries()].map(([productId,variants],productIndex)=>{
    const p=prod(productId);
    const lines=variants.map(d=>{
     const v=variant(d.variantId),buyers=buyerRows(d),requested=ordered(d.productId,d.variantId),assignedPackages=allocated(d.productId,d.variantId),remaining=Math.max(0,n(d.packages)-assignedPackages),farmRowsForVariant=allocationsFor(d.productId,d.variantId).filter(row=>n(row.broj_pakovanja)>0);
     const farmAllocationHtml=farmRowsForVariant.map(row=>'<span><strong>'+e(farm(row.gazdinstvo_id)?.name||'Газдинство #'+row.gazdinstvo_id)+'</strong><small>'+f(row.broj_pakovanja)+' пак.</small></span>').join('');
     return '<article class="ndp3-stage-line"><div class="ndp3-stage-line-title">'+e(v?.name||v?.size_label||d.packagingLabel||'Амбалажа')+'</div><div class="ndp3-stage-line-meta">'+f(d.packageSize)+' '+e(d.packageUnit)+' по паковању</div><div class="ndp3-stage-values"><span><b>'+f(d.packages)+' пак.</b><small>Купци су наручили</small></span><span class="ndp3-value-assigned"><b>'+f(assignedPackages)+' пак.</b><small>Додељено укупно</small></span><span><b>'+f(requested)+' пак.</b><small>Већ требовано</small></span><span><b>'+f(remaining)+' пак.</b><small>Није додељено</small></span></div>'+(farmAllocationHtml?'<div class="ndp3-farm-allocation-breakdown"><b>Додељено по газдинствима</b><div>'+farmAllocationHtml+'</div></div>':'<div class="ndp3-farm-allocation-breakdown is-empty">Још није додељено ниједном газдинству.</div>')+'<div class="ndp3-customer-breakdown"><b>Купци и количине</b>'+(buyers.map(b=>'<span><strong>'+e(b.name)+'</strong><small>'+f(b.count)+' паковања</small></span>').join('')||'<small>Нема повезаних купаца.</small>')+'</div></article>';
    }).join('');
    const productNeeded=variants.reduce((sum,d)=>sum+n(d.packages),0),productAssigned=variants.reduce((sum,d)=>sum+allocated(d.productId,d.variantId),0),productRemaining=Math.max(0,productNeeded-productAssigned);
    return '<details class="ndp3-request-product-card product-card ndp3-product-step" '+(productIndex===0?'open':'')+'><summary class="ndp3-request-product-head product-toggle"><div class="product-toggle-left"><h2>'+e(p?.name||'Производ')+'</h2><div class="product-sub">'+variants.length+' амбалаже · потребно '+f(productNeeded)+' · додељено '+f(productAssigned)+'</div></div><div class="product-toggle-right"><span class="'+(productRemaining?'badge-warn':'badge-ok')+'">'+(productRemaining?f(productRemaining)+' за доделу':'Све додељено')+'</span><span class="chevron" aria-hidden="true">›</span></div></summary><div class="ndp3-product-variants variants-wrap">'+lines+'</div></details>';
   }).join('');
   const totalNeeded=activeDemand.reduce((sum,d)=>sum+n(d.packages),0);
   const selectedCount=s.requestFarmFilter?remainingForFarm(s.requestFarmFilter):0;
   const action=selectedFarm?'<div class="ndp3-stage-actions ndp3-farm-request-submit"><button class="ndp3-btn primary" data-action="submit-farm-requisition" data-farm-id="'+e(selectedFarm.id)+'" '+(!writable||s.busy||selectedCount<=0?'disabled':'')+'>Упути требовање · '+f(selectedCount)+' пак.</button></div>':'<div class="ndp3-stage-empty">Изабери газдинство. Систем ће сам издвојити све производе и количине које оно може да обезбеди.</div>';
   return '<div class="ndp3-request-intro">Списак је аутоматски сабран из поруџбина купаца. Не уносиш количине ручно.</div>'+farmPicker+'<section class="ndp3-request-products">'+(list||'<div class="ndp3-stage-empty">Нема производа за требовање у овој тури.</div>')+'</section><div class="ndp3-request-intro">Укупно потребно: <strong>'+f(totalNeeded)+' паковања</strong>. Захтев се формира само за изабрано газдинство и његову активну понуду.</div>'+action;
  })();
  const requestFarmsHtml=(()=>{
   const groups=new Map();
   for(const row of requestRows){const id=String(row.gazdinstvo_id);if(!groups.has(id))groups.set(id,[]);groups.get(id).push(row);}
   if(!groups.size)return '<div class="ndp3-stage-empty">Нема нових захтева за евидентирање.</div>';
   return '<div class="ndp3-request-intro">Захтеви су груписани по газдинству. Када газдинству упутиш захтев својим каналом, евидентирај га дугметом испод. Дугме не шаље поруку.</div>'+[...groups.entries()].map(([farmId,farmRows])=>{
    const ff=farm(farmId);
    const body=farmRows.map(row=>{
     const d=demand(row.product_id,row.variant_id),p=prod(row.product_id),v=variant(row.variant_id),count=n(row.naruceno_pakovanja),confirmed=n(row.potvrdjeno_pakovanja);
     return '<article class="ndp3-stage-line"><div class="ndp3-stage-line-title">'+e(p?.name||'Производ')+' · '+e(v?.name||v?.size_label||'Амбалажа')+'</div><div class="ndp3-stage-line-meta">Захтевано: <strong>'+f(count)+' паковања</strong> · Чека потврду: <strong>'+f(Math.max(0,count-confirmed))+' паковања</strong></div><div class="ndp3-stage-line-meta">'+e(amountLabel(count,d))+' · '+(d?f(d.packageSize)+' '+e(d.packageUnit)+' по паковању':'Подаци о паковању нису доступни')+'</div></article>';
    }).join('');
    return '<section class="ndp3-stage-group"><header><strong>'+e(ff?.name||'Газдинство #'+farmId)+'</strong><span class="ndp3-chip amber">'+farmRows.length+' захтева</span></header>'+body+'<div class="ndp3-stage-actions"><button class="ndp3-btn primary" data-action="request-farm-confirmation" data-farm-id="'+e(farmId)+'" '+(!writable||s.busy?'disabled':'')+'>Захтевај потврду за газдинство</button></div></section>';
   }).join('');
  })();

  const debtHtml=(()=>{
   const products=new Map(),farms=new Map();
   let totalDebt=0,missingPrices=0,totalPackages=0;
   for(const row of s.allocations){
    const packages=Math.max(0,n(row.preuzeto_pakovanja));if(packages<=0)continue;
    const d=demand(row.product_id,row.variant_id),p=prod(row.product_id),v=variant(row.variant_id);
    const productKey=key(row.product_id,row.variant_id),farmKey=String(row.gazdinstvo_id);
    const product=products.get(productKey)||{name:p?.name||'Производ није наведен',variant:v?.name||v?.size_label||'Амбалажа није наведена',packages:0,quantity:0,unit:d?.packageUnit||'пак.',cost:0,known:true,farms:new Set()};
    const farmRow=farms.get(farmKey)||{name:farm(row.gazdinstvo_id)?.name||'Газдинство #'+farmKey,packages:0,cost:0,known:true,lines:0};
    product.packages+=packages;product.quantity+=packages*n(d?.packageSize||1);product.farms.add(farmKey);
    farmRow.packages+=packages;farmRow.lines++;totalPackages+=packages;
    if(row.nabavna_cena===null||row.nabavna_cena===undefined||row.nabavna_cena===''||!Number.isFinite(Number(row.nabavna_cena))){product.known=false;farmRow.known=false;missingPrices++;}
    else{const cost=packages*Number(row.nabavna_cena);product.cost+=cost;farmRow.cost+=cost;totalDebt+=cost;}
    products.set(productKey,product);farms.set(farmKey,farmRow);
   }
   const money=value=>f(value)+' дин.';
   const productRows=[...products.values()].map(row=>'<article class="ndp3-debt-product"><div class="ndp3-debt-product-main"><strong>'+e(row.name)+'</strong><small>'+e(row.variant)+' · '+f(row.packages)+' паковања · '+f(row.quantity)+' '+e(row.unit)+'</small><small>Газдинстава: '+row.farms.size+'</small></div><div class="ndp3-debt-product-price"><small>Набавна цена / пак.</small><b>'+(row.known?money(row.cost/row.packages):'Цена недостаје')+'</b><small>Укупно: '+(row.known?money(row.cost):'Није потпуно обрачунато')+'</small></div></article>').join('');
   const farmRows=[...farms.values()].sort((a,b)=>b.cost-a.cost).map(row=>'<article class="ndp3-debt-farm-row"><div><strong>'+e(row.name)+'</strong><small>'+f(row.packages)+' преузетих паковања · '+row.lines+' ставки</small></div><b>'+(row.known?money(row.cost):money(row.cost)+' + недостаје цена')+'</b></article>').join('');
   return '<div class="ndp3-debt-summary"><article><small>УКУПНО ПРЕУЗЕТО</small><strong>'+f(totalPackages)+' паковања</strong></article><article><small>ДУГУЈЕМО ЗА ТУРУ</small><strong>'+money(totalDebt)+(missingPrices?'*':'')+'</strong></article></div>'+(missingPrices?'<div class="ndp3-note error">Пажња: '+missingPrices+' преузетих ставки нема уписану набавну цену. Приказани износ је збир познатих цена и није коначан.</div>':'')+'<section class="ndp3-debt-section"><header><h3>Преузети производи</h3><span>'+products.size+' врста</span></header>'+(productRows||'<div class="ndp3-stage-empty">Још нема евидентираних преузетих производа.</div>')+'</section><section class="ndp3-debt-section"><header><h3>Дуговање по газдинствима</h3><span>'+farms.size+' газдинстава</span></header>'+(farmRows||'<div class="ndp3-stage-empty">Нема дуговања за ову туру.</div>')+'</section><p class="ndp3-debt-foot">Обрачун: стварно преузета паковања × набавна цена по паковању. Непреузете количине нису укључене.</p>';
  })();
  const bulkMessagesHtml=Array.isArray(s.bulkMessages)&&s.bulkMessages.length?'<div class="ndp3-modal"><section class="ndp3-modal-dialog" role="dialog" aria-modal="true" aria-label="Збирно требовање за газдинства"><header class="ndp3-modal-head"><div><div class="ndp3-kicker">ЗБИРНО ТРЕБОВАЊЕ · ТУРА #'+e(tourId)+'</div><h2>Поруке за газдинства</h2></div><button class="ndp3-btn" data-action="close-bulk-messages">Затвори</button></header><p>Свако газдинство добија једну поруку са свим својим непослатим количинама. Ново допунско требовање улази у нову поруку само за преосталу количину.</p>'+s.bulkMessages.map(item=>'<article class="ndp3-stage-group"><header><strong>'+e(item.farmName)+'</strong><span class="ndp3-chip amber">'+item.rowIds.length+' ставки</span></header><textarea class="ndp3-message" readonly>'+e(item.message)+'</textarea><div class="ndp3-stage-actions"><button class="ndp3-btn primary" data-action="bulk-open-farm" data-farm-id="'+e(item.farmId)+'">Копирај и отвори Viber</button><button class="ndp3-btn" data-action="bulk-mark-farm-sent" data-farm-id="'+e(item.farmId)+'">Означи послато</button></div></article>').join('')+'<div class="ndp3-actions"><button class="ndp3-btn" data-action="close-bulk-messages">Затвори</button></div></section></div>':'';

  const packageOverview=(()=>{
   if(s.stage!=='request'||s.view!=='products')return {overview:'',sheet:''};
   const products=new Map();
   for(const d of s.demands.filter(x=>x.valid&&n(x.packages)>0)){
    const productId=String(d.productId),variantId=String(d.variantId),pair=key(productId,variantId),p=prod(productId),v=variant(variantId);
    if(!products.has(productId))products.set(productId,{name:p?.name||'Производ',variants:[]});
    const buyers=new Map();
    for(const item of s.items.filter(x=>key(x.product_id,x.variant_id)===pair&&n(x.package_count)>0)){
     const buyerKey=item.customer_id!==null&&item.customer_id!==undefined?'customer:'+String(item.customer_id):'order:'+String(item.porudzbina_id??item.id);
     const buyer=buyers.get(buyerKey)||{name:item.customer_name||'Купац није повезан',packages:0,orders:new Set()};
     buyer.packages+=n(item.package_count);if(item.porudzbina_id!==null&&item.porudzbina_id!==undefined)buyer.orders.add(String(item.porudzbina_id));buyers.set(buyerKey,buyer);
    }
    products.get(productId).variants.push({key:pair,productId,variantId,name:v?.name||v?.size_label||d.packagingLabel||'Амбалажа',count:n(d.packages),quantity:qty(n(d.packages),d),buyers:[...buyers.values()]});
   }
   const productGroups=[...products.values()].map(p=>'<section class="ndp3-package-overview-product"><h3>'+e(p.name)+'</h3><div class="ndp3-package-overview-grid">'+p.variants.map(v=>'<button type="button" class="ndp3-package-overview-card" data-package-summary-open="'+e(v.key)+'" aria-label="'+e(v.name)+', '+f(v.count)+' паковања, '+v.buyers.length+' купаца"><span class="ndp3-package-overview-variant">'+e(v.name)+'</span><span class="ndp3-package-overview-count"><strong>'+f(v.count)+'</strong><small>паковања</small></span><span class="ndp3-package-overview-quantity">'+e(v.quantity)+'</span><span class="ndp3-package-overview-buyers">'+v.buyers.length+' '+(v.buyers.length===1?'купац':v.buyers.length%10>=2&&v.buyers.length%10<=4?'купца':'купаца')+' <b>↗</b></span></button>').join('')+'</div></section>').join('');
   const overview=productGroups?'<section class="ndp3-package-overview" aria-label="Укупно наручено по млечним производима и амбалажи"><header class="ndp3-package-overview-head"><div><span>БРЗИ ПРЕГЛЕД ПОРУЏБИНА</span><h2>Производи и амбалажа</h2></div><small>Додирни варијанту за купце</small></header>'+productGroups+'</section>':'';
   const selected=[...products.values()].flatMap(p=>p.variants).find(v=>v.key===s.packageSummaryKey);
   let sheet='';
   if(selected){
    const rows=selected.buyers.map(b=>'<article class="ndp3-package-sheet-customer"><div><strong>'+e(b.name)+'</strong><small>'+([...b.orders].sort((a,c)=>Number(a)-Number(c)).map(id=>'Поруџбина #'+e(id)).join(' · ')||'Број поруџбине није доступан')+'</small></div><b>'+f(b.packages)+' пак.</b></article>').join('');
    sheet='<div class="ndp3-package-sheet-backdrop"><section class="ndp3-package-sheet" role="dialog" aria-modal="true" aria-label="Купци за изабрану амбалажу"><div class="ndp3-package-sheet-handle"></div><header><div><small>'+e(prod(selected.productId)?.name||'Производ')+'</small><h2>'+e(selected.name)+'</h2></div><button type="button" class="ndp3-btn" data-package-summary-close>Затвори</button></header><div class="ndp3-package-sheet-stats"><div><small>Укупно паковања</small><strong>'+f(selected.count)+'</strong></div><div><small>Купаца</small><strong>'+selected.buyers.length+'</strong></div><div><small>Укупна количина</small><strong>'+e(selected.quantity)+'</strong></div></div><h3>Купци и њихове количине</h3><div class="ndp3-package-sheet-list">'+(rows||'<p class="ndp3-stage-empty">Нема повезаних купаца за ову варијанту.</p>')+'</div><p class="ndp3-package-sheet-note">Количине су сабране из поруџбина активне туре. Пункт није приказан јер није доступан у тренутном извору података овог модула.</p></section></div>';
   }
   return {overview,sheet};
  })();
  const packageOverviewHtml='';
  const packageSheetHtml='';

  const contentRows=groupedRows();
  const phaseContent=s.stage==='debt'?debtHtml:s.stage==='history'?historyHtml():s.stage==='request'?requestProductsHtml:
   (contentRows||'<div class="ndp3-stage-empty">'+(s.stage==='confirm'?'Нема требовања која чекају потврду газдинства.':'Нема потврђених количина које чекају преузимање.')+'</div>');
  const invalidDemandCount=s.demands.filter(x=>!x.valid).length;
  const invalidSourceCount=s.items.filter(x=>!x.product_id).length;
  const missingVariantCount=s.demands.filter(x=>x.valid&&!x.allocatable).length;
  const demandWarning=(invalidDemandCount||invalidSourceCount||missingVariantCount)?'<div class="ndp3-note error">Пажња: '+invalidDemandCount+' невалидних комбинација и '+invalidSourceCount+' ставки без производа нису укључене у збирове. '+missingVariantCount+' производа имају поруџбину, али им недостаје повезана амбалажа; приказани су, али расподела је блокирана.</div>':'';
  host.innerHTML='<header class="ndp3-head"><div><div class="ndp3-kicker">НАБАВКА · ТУРА #'+e(tourId)+'</div><h1>'+e(s.tour?.naziv||'Тура')+'</h1></div><button class="ndp3-btn" data-action="back">← Назад</button></header>'+
   '<nav class="ndp3-phase-tabs" aria-label="Три корака набавке"><button class="ndp3-phase-tab" data-stage="request" aria-selected="'+(s.stage==='request')+'"><span class="ndp3-phase-step">1. КОРАК</span><strong>Требовање</strong></button><button class="ndp3-phase-tab" data-stage="confirm" aria-selected="'+(s.stage==='confirm')+'" '+(!confirmStageRows.length?'disabled aria-disabled="true" title="Нема послатих требовања која чекају потврду газдинства"':'title="Изабери газдинство, исправи потврђене количине и евидентирај мањак"')+'><span class="ndp3-phase-step">2. КОРАК</span><strong>Потврда газдинства</strong></button><button class="ndp3-phase-tab" data-stage="collect" aria-selected="'+(s.stage==='collect')+'" '+(!collectRows.length?'disabled aria-disabled="true" title="Преузимање је могуће тек после потврде газдинства"':'title="Евиденција потврђених количина за преузимање"')+'><span class="ndp3-phase-step">3. КОРАК</span><strong>Преузето</strong></button></nav>'+
   (s.stage==='request'||s.stage==='collect'||s.stage==='debt'?'':'<div class="ndp3-view-switch"><button type="button" data-view="products" aria-pressed="'+(s.view==='products')+'">По производима</button><button type="button" data-view="farms" aria-pressed="'+(s.view==='farms')+'">По газдинствима</button></div>')+
   
   packageOverviewHtml+packageSheetHtml+
   confirmFarmFilterHtml+'<section class="ndp3-kpis ndp3-kpis-reference"><div class="ndp3-kpi"><b>'+totalPackages(d=>d.packages)+'</b><span>УКУПНО ПОТРЕБНО</span></div><div class="ndp3-kpi"><b>'+totalPackages(d=>allocated(d.productId,d.variantId))+'</b><span>ДОДЕЉЕНО ГАЗДИНСТВИМА</span></div><div class="ndp3-kpi ndp3-kpi-pending"><b>'+totalPackages(d=>Math.max(0,d.packages-allocated(d.productId,d.variantId)))+'</b><span>ЈОШ НИЈЕ ДОДЕЉЕНО</span></div></section>'+
   (s.notice?'<div class="ndp3-note '+(s.error?'error':'')+'" role="status">'+e(s.notice)+'</div>':'')+(!writable?'<div class="ndp3-note">Тура није у статусу processing. Приказ је само за читање.</div>':'')+(s.stage==='request'?'<div class="ndp3-actions ndp3-global-request-actions"><small>Изабери газдинство и једним дугметом упути аутоматски састављено требовање.</small></div>':'')+demandWarning+
   '<section class="ndp3-panel"><div class="ndp3-row"><h2>'+stageTitle+'</h2><span class="ndp3-chip">'+(s.stage==='debt'?'Стварно преузето × набавна цена':s.stage==='history'?'Непроменљива евиденција':s.stage==='collect'?'Отвори газдинство за детаље':s.view==='products'?'Груписано по производима':'Груписано по газдинствима')+'</span></div>'+phaseContent+'</section>'+
   '<div class="ndp3-modal" '+(s.requestOpen?'':'hidden')+'><section class="ndp3-modal-dialog" role="dialog" aria-modal="true" aria-label="Подеси требовање"><header class="ndp3-modal-head"><div><div class="ndp3-kicker">ТРЕБОВАЊЕ · ТУРА #'+e(tourId)+'</div><h2>Требовање: '+e(s.requestProductId?prod(s.requestProductId)?.name||'Изабрани производ':'Цела тура')+'</h2></div><button class="ndp3-btn" data-action="close-request">Затвори</button></header>'+buildAllocationSheetHtml()+'<div class="ndp3-actions"><button class="ndp3-btn primary" data-action="save-multi-allocation" '+(!writable||s.busy?'disabled':'')+'>'+(s.busy?'Чувам…':s.assignmentSaveMode?'Сачувај доделу':'Сачувај требовање')+'</button></div></section></div>'+
   (editAllocationRow?'<div class="ndp3-modal"><section class="ndp3-modal-dialog" role="dialog" aria-modal="true" aria-label="Расподела по купцима"><header class="ndp3-modal-head"><div><div class="ndp3-kicker">РАСПОДЕЛА ПО КУПЦИМА · ТУРА #'+e(tourId)+'</div><h2>'+(editAllocationMode==='confirmed'?'Расподели потврђено по купцима':'Колико додељујеш газдинству?')+'</h2></div><button class="ndp3-btn" data-action="close-allocation-edit">Затвори</button></header><div class="ndp3-note"><b>'+e(farm(editAllocationRow.gazdinstvo_id)?.name||'Газдинство')+'</b><br>'+e(prod(editAllocationRow.product_id)?.name||'Производ')+' · '+e(variant(editAllocationRow.variant_id)?.name||variant(editAllocationRow.variant_id)?.size_label||'Амбалажа')+'<br>Укупна додела се аутоматски сабира из количина купаца.'+(editAllocationMode==='confirmed'?'<br>Газдинство је потврдило '+f(editAllocationRow.potvrdjeno_pakovanja)+' паковања. Расподела купцима не мења потврду газдинства.':'')+'</div><div class="ndp3-customer-allocation-editor">'+editCustomerRows.map(item=>{const ordered=Math.max(0,n(item.package_count)),assigned=Math.max(0,n(editAllocationDraft[String(item.id)])),d=demand(item.product_id,item.variant_id);return '<article class="ndp3-customer-allocation-row"><div class="ndp3-customer-allocation-copy"><strong>'+e(item.customer_name||'Купац није повезан')+'</strong><small>Поруџбина #'+e(item.porudzbina_id||'—')+' · Наручено: '+f(ordered)+' паковања</small><small>Додељено: '+f(assigned)+' паковања · '+e(qty(assigned,d))+'</small></div><div class="ndp3-customer-allocation-controls"><button type="button" data-action="customer-allocation-step" data-item-id="'+e(item.id)+'" data-delta="-1" '+(!writable||s.busy||assigned<=0?'disabled':'')+' aria-label="Смањи количину">−</button><input type="number" inputmode="numeric" pattern="[0-9]*" min="0" max="'+f(ordered)+'" step="1" data-customer-allocation-count data-item-id="'+e(item.id)+'" value="'+f(assigned)+'" '+(!writable||s.busy?'disabled':'')+'><button type="button" data-action="customer-allocation-step" data-item-id="'+e(item.id)+'" data-delta="1" '+(!writable||s.busy||assigned>=ordered?'disabled':'')+' aria-label="Повећај количину">+</button></div></article>';}).join('')+'</div><div class="ndp3-customer-allocation-total"><span>'+(editAllocationMode==='confirmed'?'Газдинство потврдило':'Укупно додељено газдинству')+'</span><b>'+f(editAllocationMode==='confirmed'?n(editAllocationRow.potvrdjeno_pakovanja):n(editAllocationRow.naruceno_pakovanja))+' паковања</b></div><div class="ndp3-customer-allocation-total"><span>Распоређено купцима</span><b>'+f(editCustomerTotal)+' паковања</b></div>'+(editAllocationMode==='confirmed'?'<div class="ndp3-note '+(editCustomerTotal>n(editAllocationRow.potvrdjeno_pakovanja)?'error':'')+'">Потврђено: '+f(editAllocationRow.potvrdjeno_pakovanja)+' пак. · Распоређено: '+f(editCustomerTotal)+' пак. · Још није распоређено: <b>'+f(Math.max(0,n(editAllocationRow.potvrdjeno_pakovanja)-editCustomerTotal))+' пак.</b><br>Од првобитно требованих '+f(editAllocationRow.naruceno_pakovanja)+' паковања, газдинство још није потврдило '+f(Math.max(0,n(editAllocationRow.naruceno_pakovanja)-n(editAllocationRow.potvrdjeno_pakovanja)))+' пак.</div>':'')+'<div class="ndp3-note">„Наручено“ код купца остаје непромењено. Мењаш само „Додељено“. Збир не може премашити наруџбине купаца нити количину већ додељену другим газдинствима.</div><div class="ndp3-actions"><button class="ndp3-btn primary" data-action="save-allocation-edit" '+(!writable||s.busy||!editCustomerRows.length||editCustomerTotal<1||(editAllocationMode==='confirmed'&&editCustomerTotal>n(editAllocationRow.potvrdjeno_pakovanja))?'disabled':'')+'>'+(s.busy?'Чувам…':editAllocationMode==='confirmed'?'Сачувај расподелу купцима':'Сачувај расподелу')+'</button><button class="ndp3-btn" data-action="close-allocation-edit">Откажи</button></div></section></div>':'')+
   (s.transferOpen?(()=>{const source=s.allocations.find(x=>String(x.id)===String(s.transferDraft?.sourceId));const candidates=source?transferCandidates(source):[];const available=source?Math.max(0,n(source.naruceno_pakovanja)-n(source.potvrdjeno_pakovanja)):0;const count=Number(s.transferDraft?.packages)||0;return '<div class="ndp3-modal"><section class="ndp3-modal-dialog" role="dialog" aria-modal="true" aria-label="Пренос непотврђене количине"><header class="ndp3-modal-head"><div><div class="ndp3-kicker">ПРЕРАСПОДЕЛА · ТУРА #'+e(tourId)+'</div><h2>Пренеси непотврђену количину</h2></div><button class="ndp3-btn" data-action="close-transfer">Затвори</button></header>'+(source?'<div class="ndp3-note">Изворно газдинство: <b>'+e(farm(source.gazdinstvo_id)?.name||'Газдинство')+'</b><br>Производ: <b>'+e(prod(source.product_id)?.name||'Производ')+'</b> · '+e(variant(source.variant_id)?.name||variant(source.variant_id)?.size_label||'Паковање')+'<br>Потврђено и задржано: <b>'+f(source.potvrdjeno_pakovanja)+' пак.</b><br>На располагању за пренос: <b>'+f(available)+' пак.</b></div><label>Циљно газдинство<select class="ndp3-select" data-transfer-target>'+candidates.map(ff=>'<option value="'+e(ff.id)+'" '+(String(ff.id)===String(s.transferDraft?.targetFarmId)?'selected':'')+'>'+e(ff.name)+'</option>').join('')+'</select></label><label class="ndp3-mt-10">Количина за пренос (паковања)<input type="number" inputmode="numeric" pattern="[0-9]*" data-transfer-count min="1" max="'+f(available)+'" step="1" value="'+e(count||Math.min(available,1))+'"></label><div class="ndp3-note">Пренос се извршава атомски. Потврђена и преузета количина остаје код изворног газдинства. Циљни захтев се враћа на „није послато“. Изворни захтев се враћа на тај статус само ако му је остала непотврђена количина. Viber поруке се не шаљу аутоматски.</div><div class="ndp3-actions"><button class="ndp3-btn primary" data-action="confirm-transfer" '+(!writable||s.busy||!candidates.length||!Number.isInteger(count)||count<1||count>available?'disabled':'')+'>'+(s.busy?'Преносим…':'Потврди пренос')+'</button><button class="ndp3-btn" data-action="close-transfer">Откажи</button></div>':'<div class="ndp3-stage-empty">Изворна расподела више није доступна.</div>')+'</section></div>';})():'')+
   bulkMessagesHtml+
   (s.preparedMessage?'<div class="ndp3-modal"><section class="ndp3-modal-dialog" role="dialog" aria-modal="true" aria-label="Порука за газдинство"><header class="ndp3-modal-head"><div><div class="ndp3-kicker">ТРЕБОВАЊЕ · ТУРА #'+e(tourId)+'</div><h2>Порука за '+e(s.preparedMessageFarmName||'газдинство')+'</h2></div><button class="ndp3-btn" data-action="close-prepared-message">Затвори</button></header><p>Ово је порука само за изабрано газдинство. Копирај је и пошаљи ручно преко Viber-а или другог канала.</p><textarea class="ndp3-message" data-prepared-message readonly>'+e(s.preparedMessage)+'</textarea><div class="ndp3-actions"><button class="ndp3-btn primary" data-action="copy-prepared-message">Копирај поруку</button><button class="ndp3-btn" data-action="close-prepared-message">Затвори</button></div></section></div>':'')+
   '<div class="ndp3-foot">Подаци се читају и чувају у постојећој бази. Назив производа преузима се из евиденције производа. Укупна количина се рачуна множењем броја паковања и величине паковања.</div>';
  mountAnalyticsPanel?.();
 }

 host.addEventListener('click',ev=>{
  const open=ev.target.closest('[data-package-summary-open]');
  if(open){s.packageSummaryKey=open.dataset.packageSummaryOpen;render();return;}
  if(ev.target.closest('button[data-package-summary-close]')||ev.target.classList.contains('ndp3-package-sheet-backdrop')){s.packageSummaryKey=null;render();return;}
 });
 host.addEventListener('keydown',ev=>{if(ev.key==='Escape'&&s.packageSummaryKey){s.packageSummaryKey=null;render();}});
 render();
 return render;
}