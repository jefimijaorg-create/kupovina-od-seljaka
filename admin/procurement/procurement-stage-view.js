/*
 * NARUČИ ДОМАЋЕ — PROCUREMENT STAGE VIEW
 * Version: 1.1.0
 * Updated: 2026-11-19
 * Description: Adds the multi-farm allocation sheet while preserving existing confirmation and pickup flows.
 * Scope: Existing ADMIN Workspace only.
 */
export function renderProcurementStageView(ctx){
 const {s,host,tourId,client,n,f,e,key,qty,prod,variant,farm,demand,allocated,ordered,allocationsFor,totalNeeded,totalOrdered,totalRemaining,totalCollected,offer,allocation,canConfirmProcurement,canCollectProcurement,buildAllocationSheetHtml,mountAnalyticsPanel}=ctx;
 function render(){
  if(s.disposed)return;
  const writable=s.tour?.status==='processing';
  const requestRows=s.allocations.filter(x=>x.viber_status==='not_sent'&&n(x.naruceno_pakovanja)>0&&n(x.potvrdjeno_pakovanja)===0&&n(x.preuzeto_pakovanja)===0);
  const confirmRows=s.allocations.filter(x=>canConfirmProcurement(x));
  const collectRows=s.allocations.filter(x=>canCollectProcurement(x));
  const unassigned=s.demands.filter(d=>d.valid&&Math.max(0,d.packages-allocated(d.productId,d.variantId))>0);
  const rows=s.stage==='request'?requestRows:s.stage==='confirm'?confirmRows:collectRows;
  const sourceSummary=d=>{const totals=new Map();(d?.sourceOrders||[]).forEach(x=>{const id=x.orderId===null||x.orderId===undefined?'без броја':String(x.orderId);totals.set(id,(totals.get(id)||0)+n(x.packageCount));});return [...totals].map(([id,count])=>(id==='без броја'?'Изворна ставка':'Поруџбина #'+id)+' · '+f(count)+' пак.').join(' · ')||'Извор поруџбине није доступан';};
  const stageTitle=s.stage==='request'?'Чека захтев':s.stage==='confirm'?'Чека потврду':'Чека преузимање';
  const lineHtml=row=>{
   const d=demand(row.product_id,row.variant_id),p=prod(row.product_id),v=variant(row.variant_id),ff=farm(row.gazdinstvo_id);
   const requested=n(row.naruceno_pakovanja),confirmed=n(row.potvrdjeno_pakovanja),collected=n(row.preuzeto_pakovanja);
   let values='<span><b>'+qty(requested,d)+'</b>Захтевано</span>';
   if(confirmed>0)values+='<span><b>'+qty(confirmed,d)+'</b>Потврђено</span>';
   if(collected>0)values+='<span><b>'+qty(collected,d)+'</b>Преузето</span>';
   let controls='';
   if(s.stage==='request'){
    controls='<div class="ndp3-stage-actions"><button class="ndp3-btn primary" data-action="mark-sent" data-id="'+e(row.id)+'" '+(!writable||s.busy?'disabled':'')+'>Потврди слање захтева</button></div>';
   }else if(s.stage==='confirm'){
    const initial=confirmed>0?confirmed:requested;
    controls='<div class="ndp3-stage-input"><label>Потврђена количина (паковања)<input type="number" min="0" max="'+f(requested)+'" step="1" data-field="potvrdjeno_pakovanja" data-id="'+e(row.id)+'" value="'+f(initial)+'" '+(!writable||s.busy||!canConfirmProcurement(row)?'disabled':'')+'></label><div><div class="ndp3-stage-line-meta">Преостало за потврду: <strong>'+f(Math.max(0,requested-confirmed))+' паковања</strong></div><div class="ndp3-stage-actions"><button class="ndp3-btn primary" data-action="save-field" data-id="'+e(row.id)+'" '+(!writable||s.busy||!canConfirmProcurement(row)?'disabled':'')+'>Сачувај потврду</button></div></div></div>';
   }else{
    controls='<div class="ndp3-stage-input"><label>Стварно преузето (паковања)<input type="number" min="'+f(collected)+'" max="'+f(confirmed)+'" step="1" data-field="preuzeto_pakovanja" data-id="'+e(row.id)+'" value="'+f(collected)+'" '+(!writable||s.busy||!canCollectProcurement(row)?'disabled':'')+'></label><div><div class="ndp3-stage-line-meta">Преостало за преузимање: <strong>'+f(Math.max(0,confirmed-collected))+' паковања</strong></div><div class="ndp3-stage-actions"><button class="ndp3-btn primary" data-action="save-field" data-id="'+e(row.id)+'" '+(!writable||s.busy||!canCollectProcurement(row)?'disabled':'')+'>Евидентирај преузимање</button></div></div></div>';
   }
   return '<article class="ndp3-stage-line"><div class="ndp3-stage-line-title">'+e(p?.name||'Производ')+' · '+e(v?.name||v?.size_label||'Паковање')+'</div><div class="ndp3-stage-line-meta">'+e(ff?.name||'Газдинство није пронађено')+' · '+(d?f(d.packageSize)+' '+e(d.packageUnit)+' по паковању':'Подаци о паковању нису доступни')+'</div><div class="ndp3-stage-line-meta">Извор: '+e(sourceSummary(d))+'</div><div class="ndp3-stage-values">'+values+'</div>'+controls+'</article>';
  };
  const groupedRows=()=>{
   const groups=new Map();
   for(const row of rows){
    const groupKey=s.view==='farms'?String(row.gazdinstvo_id):key(row.product_id,row.variant_id);
    if(!groups.has(groupKey))groups.set(groupKey,[]);
    groups.get(groupKey).push(row);
   }
   return [...groups.entries()].map(([groupKey,groupRows])=>{
    const first=groupRows[0],title=s.view==='farms'?(farm(first.gazdinstvo_id)?.name||'Газдинство #'+first.gazdinstvo_id):(prod(first.product_id)?.name||'Производ')+' · '+(variant(first.variant_id)?.name||variant(first.variant_id)?.size_label||'Паковање');
    let actions='';
    if(s.stage==='request'&&s.view==='farms'){
     actions='<div class="ndp3-stage-actions"><button class="ndp3-btn" data-action="prepare-farm" data-farm-id="'+e(first.gazdinstvo_id)+'" '+(!writable||s.busy?'disabled':'')+'>Припреми Viber поруку</button><button class="ndp3-btn primary" data-action="mark-farm-sent" data-farm-id="'+e(first.gazdinstvo_id)+'" '+(!writable||s.busy?'disabled':'')+'>Потврди да је захтев послат</button></div>';
    }
    return '<section class="ndp3-stage-group"><header><strong>'+e(title)+'</strong><span class="ndp3-chip">'+groupRows.length+' ставки</span></header>'+groupRows.map(lineHtml).join('')+actions+'</section>';
   }).join('');
  };
  const unassignedHtml=unassigned.length?'<section class="ndp3-stage-group"><header><strong>Производи без додељеног газдинства</strong><span class="ndp3-chip amber">'+unassigned.length+' ставки</span></header>'+unassigned.map(d=>{
   const remaining=Math.max(0,d.packages-allocated(d.productId,d.variantId));
   return '<article class="ndp3-stage-line"><div class="ndp3-stage-line-title">'+e(prod(d.productId)?.name||'Производ')+' · '+e(variant(d.variantId)?.name||variant(d.variantId)?.size_label||'Паковање')+'</div><div class="ndp3-stage-line-meta">'+f(d.packageSize)+' '+e(d.packageUnit)+' по паковању</div><div class="ndp3-stage-line-meta">Извор: '+e(sourceSummary(d))+'</div><div class="ndp3-stage-values"><span><b>'+f(d.packages)+'</b>Потребно</span><span><b>'+f(remaining)+'</b>Није додељено</span></div></article>';
  }).join('')+'</section>':'';
  const contentRows=groupedRows();
  const phaseContent=s.stage==='request'?(unassignedHtml+contentRows||'<div class="ndp3-stage-empty">Све потребне количине су додељене или већ имају захтев. Нема ставки које чекају захтев.</div>'):
   (contentRows||'<div class="ndp3-stage-empty">'+(s.stage==='confirm'?'Нема послатих захтева који чекају потврду.':'Нема потврђених количина које чекају преузимање.')+'</div>');
  const invalidDemandCount=s.demands.filter(x=>!x.valid).length;
  const invalidSourceCount=s.items.filter(x=>!x.product_id||!x.variant_id).length;
  const demandWarning=(invalidDemandCount||invalidSourceCount)?'<div class="ndp3-note error">Пажња: '+invalidDemandCount+' невалидних комбинација производа/варијанте и '+invalidSourceCount+' изворних ставки без производа или варијанте нису укључене у збирове.</div>':'';
  const farmCatalog=s.demands.filter(d=>d.valid&&d.packages>ordered(d.productId,d.variantId)&&offer(d.productId,d.variantId)).map(d=>{
   const p=prod(d.productId),v=variant(d.variantId),al=allocation(d.productId,d.variantId,s.farmId),locked=!!al&&(al.viber_status==='sent'||al.viber_status==='replied'||n(al.potvrdjeno_pakovanja)>0||n(al.preuzeto_pakovanja)>0),pendingItem=s.cart.find(x=>key(x.productId,x.variantId)===key(d.productId,d.variantId));
   const pendingCount=pendingItem?.count||0,alreadyRequested=ordered(d.productId,d.variantId);
   const canRequest=Math.max(0,d.packages-alreadyRequested),remaining=Math.max(0,canRequest-pendingCount);
   const draftKey=key(d.productId,d.variantId),count=Object.prototype.hasOwnProperty.call(s.draftCounts,draftKey)?s.draftCounts[draftKey]:remaining;
   return '<article class="ndp3-product"><div class="ndp3-row"><div><strong>'+e(p?.name||'Производ')+'</strong><small>'+e(v?.name||v?.size_label||'Варијанта')+' · '+f(d.packageSize)+' '+e(d.packageUnit)+' по паковању</small></div><span class="ndp3-chip">'+qty(d.packages,d)+'</span></div><div class="ndp3-allocation-recap"><span><b>'+f(d.packages)+'</b>Потребно</span>'+(alreadyRequested>0?'<span><b>'+f(alreadyRequested)+'</b>Већ захтевано</span>':'')+(canRequest>0?'<span><b>'+f(canRequest)+'</b>Преостало за захтев</span>':'')+(pendingCount>0?'<span><b>'+f(pendingCount)+'</b>У корпи</span>':'')+'</div><p>Приказано је само паковање које изабрано газдинство стварно нуди.</p><div class="ndp3-row"><span class="ndp3-meta">Количина за захтев</span><div class="ndp3-stepper"><button class="ndp3-btn minus" data-action="step" data-delta="-1" data-p="'+e(d.productId)+'" data-v="'+e(d.variantId)+'" aria-label="Умањи">−</button><output>'+f(count)+'</output><button class="ndp3-btn plus" data-action="step" data-delta="1" data-p="'+e(d.productId)+'" data-v="'+e(d.variantId)+'" aria-label="Увећај" '+(locked||remaining<=count?'disabled':'')+'>+</button></div></div><div class="ndp3-actions"><button class="ndp3-btn" data-action="fill-all" data-p="'+e(d.productId)+'" data-v="'+e(d.variantId)+'" '+(!writable||locked||remaining<=0?'disabled':'')+'>Све преостало</button><button class="ndp3-btn primary" data-action="add" data-p="'+e(d.productId)+'" data-v="'+e(d.variantId)+'" '+(!writable||locked||count<=0||count>remaining?'disabled':'')+'>Додај у захтев</button></div></article>';
  }).join('')||'<div class="ndp3-empty">Ово газдинство нема активну понуду за преостале производе и паковања ове туре.</div>';
  const cartHtml=s.cart.length?s.cart.map((x,i)=>{const d=demand(x.productId,x.variantId);return '<div class="ndp3-item"><div class="ndp3-row"><div><div class="ndp3-item-title">'+e(prod(x.productId)?.name)+' · '+e(variant(x.variantId)?.name||variant(x.variantId)?.size_label)+'</div><div class="ndp3-meta">'+f(x.count)+' паковања · '+qty(x.count,d)+'</div></div><div class="ndp3-stepper"><button class="ndp3-btn minus" data-action="cart-step" data-i="'+i+'" data-delta="-1">−</button><output>'+f(x.count)+'</output><button class="ndp3-btn plus" data-action="cart-step" data-i="'+i+'" data-delta="1">+</button></div></div><div class="ndp3-actions"><button class="ndp3-btn" data-action="remove" data-i="'+i+'">Уклони</button></div></div>';}).join(''):'<div class="ndp3-empty">Корпа је празна. Изабери производ и додај количину.</div>';
  host.innerHTML='<header class="ndp3-head"><div><div class="ndp3-kicker">ОПЕРАТИВНА ТАБЛА · ТУРА #'+e(tourId)+'</div><h1>Набавка</h1><p>'+e(s.tour?.naziv||'Тура')+' · Сви производи и паковања из базе</p></div><button class="ndp3-btn" data-action="back">← Назад</button></header>'+
   '<nav class="ndp3-phase-tabs" aria-label="Фазе набавке"><button class="ndp3-phase-tab" data-stage="request" aria-selected="'+(s.stage==='request')+'">Чека захтев<small>'+(requestRows.length+unassigned.length)+' ставки</small></button><button class="ndp3-phase-tab" data-stage="confirm" aria-selected="'+(s.stage==='confirm')+'">Чека потврду<small>'+confirmRows.length+' ставки</small></button><button class="ndp3-phase-tab" data-stage="collect" aria-selected="'+(s.stage==='collect')+'">Чека преузимање<small>'+collectRows.length+' ставки</small></button></nav>'+
   '<div class="ndp3-view-switch"><button type="button" data-view="products" aria-pressed="'+(s.view==='products')+'">По производима</button><button type="button" data-view="farms" aria-pressed="'+(s.view==='farms')+'">По газдинствима</button></div>'+
   (s.stage==='request'?'<button class="ndp3-btn primary ndp3-request-launch" data-action="open-request" '+(!writable?'disabled':'')+'>Подеси захтев</button>':'')+
   '<section class="ndp3-kpis"><div class="ndp3-kpi"><b>'+totalNeeded()+'</b><span>УКУПНО ПОТРЕБНО</span></div>'+(s.demands.some(d=>ordered(d.productId,d.variantId)>0)?'<div class="ndp3-kpi"><b>'+totalOrdered()+'</b><span>ЗАХТЕВАНО</span></div>':'')+'<div class="ndp3-kpi"><b>'+totalRemaining()+'</b><span>МОЖЕ ЈОШ ДА СЕ ЗАХТЕВА</span></div>'+(s.demands.some(d=>allocationsFor(d.productId,d.variantId).some(x=>n(x.preuzeto_pakovanja)>0))?'<div class="ndp3-kpi"><b>'+totalCollected()+'</b><span>ПРЕУЗЕТО</span></div>':'')+'</section>'+
   (s.notice?'<div class="ndp3-note '+(s.error?'error':'')+'" role="status">'+e(s.notice)+'</div>':'')+(!writable?'<div class="ndp3-note">Тура није у статусу processing. Приказ је само за читање.</div>':'')+demandWarning+
   '<section class="ndp3-panel"><div class="ndp3-row"><h2>'+stageTitle+'</h2><span class="ndp3-chip">'+(s.view==='products'?'Груписано по производима':'Груписано по газдинствима')+'</span></div>'+phaseContent+'</section>'+
   '<div class="ndp3-modal" '+(s.requestOpen?'':'hidden')+'><section class="ndp3-modal-dialog" role="dialog" aria-modal="true" aria-label="Подеси захтев"><header class="ndp3-modal-head"><div><div class="ndp3-kicker">ГРУПНИ ЗАХТЕВ · ТУРА #'+e(tourId)+'</div><h2>Подеси захтев за више газдинстава</h2></div><button class="ndp3-btn" data-action="close-request">Затвори</button></header>'+buildAllocationSheetHtml()+'<div class="ndp3-actions"><button class="ndp3-btn primary" data-action="save-multi-allocation" '+(!writable||s.busy?'disabled':'')+'>'+(s.busy?'Чувам…':'Сачувај расподелу и припреми поруке')+'</button></div></section></div>'+
   '<div class="ndp3-foot">Подаци се читају и уписују у постојеће Supabase табеле. Назив производа долази преко product_id → products.name. Количине се рачунају из package_count × package_size.</div>';
  mountAnalyticsPanel?.();
 }
 render();
 return render;
}