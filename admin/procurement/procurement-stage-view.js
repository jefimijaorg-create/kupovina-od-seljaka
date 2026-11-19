/*
 * NARUČИ ДОМАЋЕ — PROCUREMENT STAGE VIEW
 * Version: 1.8.8
 * Updated: 2026-11-19
 * Description: Shows per-farm customer names and their allocated package quantities in the procurement request view.
 * Scope: Existing ADMIN Workspace only.
 */
export function renderProcurementStageView(ctx){
 const {s,host,tourId,client,n,f,e,key,qty,prod,variant,farm,demand,allocated,ordered,allocationsFor,totalNeeded,totalOrdered,totalRemaining,totalCollected,offer,allocation,canConfirmProcurement,canCollectProcurement,history=[],editAllocationRow=null,editAllocationDraft={},buildAllocationSheetHtml,mountAnalyticsPanel}=ctx;
 function render(){
  if(s.disposed)return;
  const writable=s.tour?.status==='processing';
  const requestRows=s.allocations.filter(x=>x.viber_status==='not_sent'&&n(x.naruceno_pakovanja)>n(x.potvrdjeno_pakovanja));
  const requestDemandCount=requestRows.length;
  const confirmRows=s.allocations.filter(x=>canConfirmProcurement(x));
  const collectRows=s.allocations.filter(x=>canCollectProcurement(x));
  const rows=s.stage==='confirm'?confirmRows:s.stage==='collect'?collectRows:[];
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
  const stageTitle=s.stage==='request'?'Требовање':s.stage==='confirm'?'Потврда':s.stage==='collect'?'Преузимање':'Историја промена';
  const lineHtml=row=>{
   const d=demand(row.product_id,row.variant_id),p=prod(row.product_id),v=variant(row.variant_id),ff=farm(row.gazdinstvo_id);
   const requested=n(row.naruceno_pakovanja),confirmed=n(row.potvrdjeno_pakovanja),collected=n(row.preuzeto_pakovanja);
   let values='<span><b>'+packageLabel(requested)+'</b><small>'+e(amountLabel(requested,d))+'</small><small class="ndp3-value-label">Захтевано</small></span>';
   if(confirmed>0)values+='<span><b>'+packageLabel(confirmed)+'</b><small>'+e(amountLabel(confirmed,d))+'</small><small class="ndp3-value-label">Потврђено</small></span>';
   if(collected>0)values+='<span><b>'+packageLabel(collected)+'</b><small>'+e(amountLabel(collected,d))+'</small><small class="ndp3-value-label">Преузето</small></span>';
   let controls='';
   if(s.stage==='request'){
    controls='<div class="ndp3-stage-actions"><button class="ndp3-btn primary" data-action="mark-sent" data-id="'+e(row.id)+'" '+(!writable||s.busy?'disabled':'')+'>Потврди слање требовања</button></div>';
   }else if(s.stage==='confirm'){
    const initial=confirmed>0?confirmed:requested;
    controls='<div class="ndp3-stage-input"><label>Потврђена количина (паковања)<input type="number" inputmode="numeric" pattern="[0-9]*" min="0" max="'+f(requested)+'" step="1" data-field="potvrdjeno_pakovanja" data-id="'+e(row.id)+'" value="'+f(initial)+'" '+(!writable||s.busy||!canConfirmProcurement(row)?'disabled':'')+'></label><div><div class="ndp3-stage-line-meta">Преостало за потврду: <strong>'+f(Math.max(0,requested-confirmed))+' паковања</strong></div><div class="ndp3-stage-actions"><button class="ndp3-btn primary" data-action="save-field" data-id="'+e(row.id)+'" '+(!writable||s.busy||!canConfirmProcurement(row)?'disabled':'')+'>Сачувај потврду</button>'+(requested>confirmed&&transferCandidates(row).length?'<button class="ndp3-btn" data-action="open-transfer" data-id="'+e(row.id)+'" '+(!writable||s.busy?'disabled':'')+'>Пренеси непотврђено</button>':'')+'</div></div></div>';
   }else{
    controls='<div class="ndp3-stage-input"><label>Стварно преузето (паковања)<input type="number" inputmode="numeric" pattern="[0-9]*" min="'+f(collected)+'" max="'+f(confirmed)+'" step="1" data-field="preuzeto_pakovanja" data-id="'+e(row.id)+'" value="'+f(collected)+'" '+(!writable||s.busy||!canCollectProcurement(row)?'disabled':'')+'></label><div><div class="ndp3-stage-line-meta">Преостало за преузимање: <strong>'+f(Math.max(0,confirmed-collected))+' паковања</strong></div><div class="ndp3-stage-actions"><button class="ndp3-btn primary" data-action="save-field" data-id="'+e(row.id)+'" '+(!writable||s.busy||!canCollectProcurement(row)?'disabled':'')+'>Евидентирај преузимање</button></div></div></div>';
   }
   const lineTitle=s.view==='farms'?(p?.name||'Производ')+' · '+(v?.name||v?.size_label||'Паковање'):(ff?.name||'Газдинство није пронађено');
   return '<article class="ndp3-stage-line"><div class="ndp3-stage-line-title">'+e(lineTitle)+'</div><div class="ndp3-stage-line-meta">'+e(ff?.name||'Газдинство није пронађено')+' · '+(d?f(d.packageSize)+' '+e(d.packageUnit)+' по паковању':'Подаци о паковању нису доступни')+'</div><div class="ndp3-stage-line-meta">Извор: '+e(sourceSummary(d))+'</div><div class="ndp3-stage-values">'+values+'</div>'+controls+'</article>';
  };
  const groupedRows=()=>{
   const groups=new Map();
   for(const row of rows){
    const groupKey=s.view==='farms'?String(row.gazdinstvo_id):String(row.product_id);
    if(!groups.has(groupKey))groups.set(groupKey,[]);
    groups.get(groupKey).push(row);
   }
   return [...groups.entries()].map(([groupKey,groupRows])=>{
    const first=groupRows[0],title=s.view==='farms'?(farm(first.gazdinstvo_id)?.name||'Газдинство #'+first.gazdinstvo_id):(prod(first.product_id)?.name||'Производ');
    let actions='';
    if(s.stage==='request'&&s.view==='farms'){
     actions='<div class="ndp3-stage-actions"><button class="ndp3-btn" data-action="prepare-farm" data-farm-id="'+e(first.gazdinstvo_id)+'" '+(!writable||s.busy?'disabled':'')+'>Отвори Viber и копирај требовање</button><button class="ndp3-btn primary" data-action="mark-farm-sent" data-farm-id="'+e(first.gazdinstvo_id)+'" '+(!writable||s.busy?'disabled':'')+'>Потврди слање требовања</button></div>';
    }
    let body='';
    if(s.view==='farms'){
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
    return '<section class="ndp3-stage-group"><header><strong>'+e(title)+'</strong><span class="ndp3-chip">'+(s.view==='farms'?groupRows.length+' ставки':new Set(groupRows.map(x=>String(x.variant_id))).size+' амбалаже')+'</span></header>'+body+actions+'</section>';
   }).join('');
  };
  const requestProductsHtml=(()=>{
   const groups=new Map();
   for(const d of s.demands.filter(x=>x.valid && x.productId)){
    const id=String(d.productId);
    if(!groups.has(id))groups.set(id,[]);
    groups.get(id).push(d);
   }
   const demandedProductsHtml=groups.size
    ? '<div class="ndp3-request-intro">Сваки производ са поруџбинама приказан је као једна целина. Испод су све амбалаже, постојеће доделе газдинствима и количине које још треба распоредити.</div><div class="ndp3-request-product-action"><button class="ndp3-btn primary" type="button" data-action="open-request" '+(!writable||s.busy?'disabled':'')+'>Отвори требовање за целу туру</button></div><section class="ndp3-request-products">'+[...groups.entries()].map(([productId,items])=>{
    const p=prod(productId);
    const remainingAll=items.reduce((sum,d)=>sum+Math.max(0,d.packages-allocated(d.productId,d.variantId)),0);
    const allAssigned=items.every(d=>Math.max(0,d.packages-allocated(d.productId,d.variantId))===0);
    const allocationReady=items.every(d=>d.allocatable===true);
    return '<article class="ndp3-request-product-card"><header class="ndp3-request-product-head"><div><strong>'+e(p?.name||'Производ')+'</strong><div class="ndp3-request-product-total">'+(allAssigned?'Све потребне количине су распоређене':f(remainingAll)+' паковања преостало за расподелу')+'</div></div><span class="ndp3-chip '+(allAssigned?'green':'amber')+'">'+(allAssigned?'Распоређено':'У току')+'</span></header>'+items.map(d=>{
     const remaining=Math.max(0,d.packages-allocated(d.productId,d.variantId)),v=variant(d.variantId),assigned=allocationsFor(d.productId,d.variantId);
     const assignmentHtml=assigned.length?'<div class="ndp3-request-allocation-list">'+assigned.map(row=>{
      const ff=farm(row.gazdinstvo_id),requested=n(row.naruceno_pakovanja),confirmed=n(row.potvrdjeno_pakovanja),collected=n(row.preuzeto_pakovanja),sent=row.viber_status==='sent';
      const state=collected>=confirmed&&confirmed>0?'Преузето':confirmed>0?'Делимично потврђено':sent?'Чека потврду':'Чека слање';
      const canSend=row.viber_status==='not_sent'&&requested>confirmed;
      const customerTotals=new Map();
      for(const item of s.items.filter(source=>String(source.product_id)===String(d.productId)&&String(source.variant_id)===String(d.variantId))){
       for(const farmShare of (item.farm_allocations||[]).filter(share=>String(share.gazdinstvo_id)===String(row.gazdinstvo_id))){
        const customerKey=item.customer_id===null||item.customer_id===undefined?'missing:'+String(item.id):String(item.customer_id);
        const current=customerTotals.get(customerKey)||{name:item.customer_name||'Купац није повезан',packages:0};
        current.packages+=n(farmShare.broj_pakovanja);
        customerTotals.set(customerKey,current);
       }
      }
      const customerBreakdown=customerTotals.size
       ? '<div class="ndp3-customer-breakdown"><b>Купци и њихове количине</b>'+[...customerTotals.values()].map(customer=>'<span><strong>'+e(customer.name)+'</strong><small>'+f(customer.packages)+' × '+f(d.packageSize)+' '+e(d.packageUnit)+' ('+e(qty(customer.packages,d))+')</small></span>').join('')+'</div>'
       : '<div class="ndp3-customer-breakdown"><small>Појединачна расподела купаца за ово газдинство није евидентирана.</small></div>';
      return '<div class="ndp3-request-allocation"><div><strong>'+e(ff?.name||'Газдинство #'+row.gazdinstvo_id)+' · '+f(requested)+' пак.</strong><small>'+e(state)+' · Потврђено '+f(confirmed)+' · Преузето '+f(collected)+'</small>'+customerBreakdown+'</div>'+(row.viber_status==='not_sent'&&confirmed===0&&collected===0?'<button class="ndp3-btn" type="button" data-action="edit-allocation" data-id="'+e(row.id)+'" '+(!writable||s.busy?'disabled':'')+'>Уреди доделу</button>':'')+(canSend?'<button class="ndp3-btn" type="button" data-action="mark-sent" data-id="'+e(row.id)+'" '+(!writable||s.busy?'disabled':'')+'>Потврди слање</button>':'')+'</div>';
     }).join('')+'</div>':'<div class="ndp3-request-product-total">Још нема додела газдинствима.</div>';
     return '<div class="ndp3-request-package-row"><div><b>'+e(v?.name||v?.size_label||d.packagingLabel||'Амбалажа')+'</b>'+(!d.allocatable?'<small class="ndp3-note error">Амбалажа није повезана са варијантом производа. Количина је приказана, али расподела је блокирана док се веза не исправи.</small>':'')+'<small>Потребно: '+packageLabel(d.packages)+' · Распоређено: '+packageLabel(allocated(d.productId,d.variantId))+' · Преостало: '+packageLabel(remaining)+'</small><small>'+f(d.packageSize)+' '+e(d.packageUnit)+' по паковању · Укупно потребно: '+e(amountLabel(d.packages,d))+' · Извор: '+e(sourceSummary(d))+'</small>'+assignmentHtml+'</div><div class="ndp3-request-package-count">'+f(remaining)+' <small>преостало</small></div></div>';
    }).join('')+(remainingAll>0&&allocationReady?'<div class="ndp3-request-product-action"><button class="ndp3-btn primary" type="button" data-action="open-request" data-product-id="'+e(productId)+'" '+(!writable||s.busy?'disabled':'')+'>Требуј преостало по газдинствима</button></div>':(!allocationReady?'<div class="ndp3-request-product-total">Расподела није доступна док се не повеже недостајућа амбалажа.</div>':''))+'</article>';
   }).join('')+'</section>'
    : '<div class="ndp3-stage-empty">На овој тури нема производа са исправним подацима о амбалажи.</div>';
   return demandedProductsHtml;
  })();
  const requestFarmsHtml=(()=>{
   const groups=new Map();
   for(const row of requestRows){const id=String(row.gazdinstvo_id);if(!groups.has(id))groups.set(id,[]);groups.get(id).push(row);}
   if(!groups.size)return '<div class="ndp3-stage-empty">Нема захтева који чекају слање газдинствима.</div>';
   return '<div class="ndp3-request-intro">Захтеви су груписани по газдинству. За свако газдинство можеш да припремиш заједничку поруку и евидентираш слање тек након што је стварно послата.</div>'+[...groups.entries()].map(([farmId,farmRows])=>{
    const ff=farm(farmId);
    const body=farmRows.map(row=>{
     const d=demand(row.product_id,row.variant_id),p=prod(row.product_id),v=variant(row.variant_id),count=n(row.naruceno_pakovanja),confirmed=n(row.potvrdjeno_pakovanja);
     return '<article class="ndp3-stage-line"><div class="ndp3-stage-line-title">'+e(p?.name||'Производ')+' · '+e(v?.name||v?.size_label||'Амбалажа')+'</div><div class="ndp3-stage-line-meta">Захтевано: <strong>'+f(count)+' паковања</strong> · Чека потврду: <strong>'+f(Math.max(0,count-confirmed))+' паковања</strong></div><div class="ndp3-stage-line-meta">'+e(amountLabel(count,d))+' · '+(d?f(d.packageSize)+' '+e(d.packageUnit)+' по паковању':'Подаци о паковању нису доступни')+'</div></article>';
    }).join('');
    return '<section class="ndp3-stage-group"><header><strong>'+e(ff?.name||'Газдинство #'+farmId)+'</strong><span class="ndp3-chip amber">'+farmRows.length+' захтева</span></header>'+body+'<div class="ndp3-stage-actions"><button class="ndp3-btn" data-action="prepare-farm" data-farm-id="'+e(farmId)+'" '+(!writable||s.busy?'disabled':'')+'>Припреми Viber поруку</button><button class="ndp3-btn primary" data-action="mark-farm-sent" data-farm-id="'+e(farmId)+'" '+(!writable||s.busy?'disabled':'')+'>Потврди да је захтев послат</button></div></section>';
   }).join('');
  })();
  const contentRows=groupedRows();
  const phaseContent=s.stage==='history'?historyHtml():s.stage==='request'?(s.view==='farms'?requestFarmsHtml:requestProductsHtml):
   (contentRows||'<div class="ndp3-stage-empty">'+(s.stage==='confirm'?'Нема послатих требовања која чекају потврду.':'Нема потврђених количина које чекају преузимање.')+'</div>');
  const invalidDemandCount=s.demands.filter(x=>!x.valid).length;
  const invalidSourceCount=s.items.filter(x=>!x.product_id).length;
  const missingVariantCount=s.demands.filter(x=>x.valid&&!x.allocatable).length;
  const demandWarning=(invalidDemandCount||invalidSourceCount||missingVariantCount)?'<div class="ndp3-note error">Пажња: '+invalidDemandCount+' невалидних комбинација и '+invalidSourceCount+' ставки без производа нису укључене у збирове. '+missingVariantCount+' производа имају поруџбину, али им недостаје повезана амбалажа; приказани су, али расподела је блокирана.</div>':'';
  host.innerHTML='<header class="ndp3-head"><div><div class="ndp3-kicker">ОПЕРАТИВНА ТАБЛА · ТУРА #'+e(tourId)+'</div><h1>Набавка</h1><p>'+e(s.tour?.naziv||'Тура')+' · Сви производи и паковања из базе</p></div><button class="ndp3-btn" data-action="back">← Назад</button></header>'+
   '<nav class="ndp3-phase-tabs" aria-label="Фазе набавке"><button class="ndp3-phase-tab" data-stage="request" aria-selected="'+(s.stage==='request')+'" >Требовање<small>'+(requestDemandCount)+' ставки</small></button><button class="ndp3-phase-tab" data-stage="confirm" aria-selected="'+(s.stage==='confirm')+'">Потврда<small>'+confirmRows.length+' ставки</small></button><button class="ndp3-phase-tab" data-stage="collect" aria-selected="'+(s.stage==='collect')+'">Преузимање<small>'+collectRows.length+' ставки</small></button><button class="ndp3-phase-tab" data-stage="history" aria-selected="'+(s.stage==='history')+'">Историја<small>'+history.length+'</small></button></nav>'+
   '<div class="ndp3-view-switch"><button type="button" data-view="products" aria-pressed="'+(s.view==='products')+'">По производима</button><button type="button" data-view="farms" aria-pressed="'+(s.view==='farms')+'">По газдинствима</button></div>'+
   
   '<section class="ndp3-kpis"><div class="ndp3-kpi"><b>'+totalNeeded()+'</b><span>УКУПНО ПОТРЕБНО</span></div>'+(s.demands.some(d=>ordered(d.productId,d.variantId)>0)?'<div class="ndp3-kpi"><b>'+totalOrdered()+'</b><span>ЗАХТЕВАНО</span></div>':'')+'<div class="ndp3-kpi"><b>'+totalRemaining()+'</b><span>МОЖЕ ЈОШ ДА СЕ ЗАХТЕВА</span></div>'+(s.demands.some(d=>allocationsFor(d.productId,d.variantId).some(x=>n(x.preuzeto_pakovanja)>0))?'<div class="ndp3-kpi"><b>'+totalCollected()+'</b><span>ПРЕУЗЕТО</span></div>':'')+'</section>'+
   (s.notice?'<div class="ndp3-note '+(s.error?'error':'')+'" role="status">'+e(s.notice)+'</div>':'')+(!writable?'<div class="ndp3-note">Тура није у статусу processing. Приказ је само за читање.</div>':'')+demandWarning+
   '<section class="ndp3-panel"><div class="ndp3-row"><h2>'+stageTitle+'</h2><span class="ndp3-chip">'+(s.stage==='history'?'Непроменљива евиденција':s.view==='products'?'Груписано по производима':'Груписано по газдинствима')+'</span></div>'+phaseContent+'</section>'+
   '<div class="ndp3-modal" '+(s.requestOpen?'':'hidden')+'><section class="ndp3-modal-dialog" role="dialog" aria-modal="true" aria-label="Подеси требовање"><header class="ndp3-modal-head"><div><div class="ndp3-kicker">ТРЕБОВАЊЕ · ТУРА #'+e(tourId)+'</div><h2>Требовање: '+e(s.requestProductId?prod(s.requestProductId)?.name||'Изабрани производ':'Цела тура')+'</h2></div><button class="ndp3-btn" data-action="close-request">Затвори</button></header>'+buildAllocationSheetHtml()+'<div class="ndp3-actions"><button class="ndp3-btn primary" data-action="save-multi-allocation" '+(!writable||s.busy?'disabled':'')+'>'+(s.busy?'Чувам…':'Сачувај расподелу и припреми поруке')+'</button></div></section></div>'+
   (editAllocationRow?'<div class="ndp3-modal"><section class="ndp3-modal-dialog" role="dialog" aria-modal="true" aria-label="Расподела по купцима"><header class="ndp3-modal-head"><div><div class="ndp3-kicker">РАСПОДЕЛА ПО КУПЦИМА · ТУРА #'+e(tourId)+'</div><h2>Колико додељујеш газдинству?</h2></div><button class="ndp3-btn" data-action="close-allocation-edit">Затвори</button></header><div class="ndp3-note"><b>'+e(farm(editAllocationRow.gazdinstvo_id)?.name||'Газдинство')+'</b><br>'+e(prod(editAllocationRow.product_id)?.name||'Производ')+' · '+e(variant(editAllocationRow.variant_id)?.name||variant(editAllocationRow.variant_id)?.size_label||'Амбалажа')+'<br>Укупна додела се аутоматски сабира из количина купаца.</div><div class="ndp3-customer-allocation-editor">'+editCustomerRows.map(item=>{const ordered=Math.max(0,n(item.package_count)),assigned=Math.max(0,n(editAllocationDraft[String(item.id)])),d=demand(item.product_id,item.variant_id);return '<article class="ndp3-customer-allocation-row"><div class="ndp3-customer-allocation-copy"><strong>'+e(item.customer_name||'Купац није повезан')+'</strong><small>Поруџбина #'+e(item.porudzbina_id||'—')+' · Наручено: '+f(ordered)+' паковања</small><small>Додељено: '+f(assigned)+' паковања · '+e(qty(assigned,d))+'</small></div><div class="ndp3-customer-allocation-controls"><button type="button" data-action="customer-allocation-step" data-item-id="'+e(item.id)+'" data-delta="-1" '+(!writable||s.busy||assigned<=0?'disabled':'')+' aria-label="Смањи количину">−</button><input type="number" inputmode="numeric" pattern="[0-9]*" min="0" max="'+f(ordered)+'" step="1" data-customer-allocation-count data-item-id="'+e(item.id)+'" value="'+f(assigned)+'" '+(!writable||s.busy?'disabled':'')+'><button type="button" data-action="customer-allocation-step" data-item-id="'+e(item.id)+'" data-delta="1" '+(!writable||s.busy||assigned>=ordered?'disabled':'')+' aria-label="Повећај количину">+</button></div></article>';}).join('')+'</div><div class="ndp3-customer-allocation-total"><span>Укупно додељено газдинству</span><b>'+f(editCustomerTotal)+' паковања</b></div><div class="ndp3-note">„Наручено“ код купца остаје непромењено. Мењаш само „Додељено“. Збир не може премашити наруџбине купаца нити количину већ додељену другим газдинствима.</div><div class="ndp3-actions"><button class="ndp3-btn primary" data-action="save-allocation-edit" '+(!writable||s.busy||!editCustomerRows.length||editCustomerTotal<1?'disabled':'')+'>'+(s.busy?'Чувам…':'Сачувај расподелу')+'</button><button class="ndp3-btn" data-action="close-allocation-edit">Откажи</button></div></section></div>':'')+
   (s.transferOpen?(()=>{const source=s.allocations.find(x=>String(x.id)===String(s.transferDraft?.sourceId));const candidates=source?transferCandidates(source):[];const available=source?Math.max(0,n(source.naruceno_pakovanja)-n(source.potvrdjeno_pakovanja)):0;const count=Number(s.transferDraft?.packages)||0;return '<div class="ndp3-modal"><section class="ndp3-modal-dialog" role="dialog" aria-modal="true" aria-label="Пренос непотврђене количине"><header class="ndp3-modal-head"><div><div class="ndp3-kicker">ПРЕРАСПОДЕЛА · ТУРА #'+e(tourId)+'</div><h2>Пренеси непотврђену количину</h2></div><button class="ndp3-btn" data-action="close-transfer">Затвори</button></header>'+(source?'<div class="ndp3-note">Изворно газдинство: <b>'+e(farm(source.gazdinstvo_id)?.name||'Газдинство')+'</b><br>Производ: <b>'+e(prod(source.product_id)?.name||'Производ')+'</b> · '+e(variant(source.variant_id)?.name||variant(source.variant_id)?.size_label||'Паковање')+'<br>Потврђено и задржано: <b>'+f(source.potvrdjeno_pakovanja)+' пак.</b><br>На располагању за пренос: <b>'+f(available)+' пак.</b></div><label>Циљно газдинство<select class="ndp3-select" data-transfer-target>'+candidates.map(ff=>'<option value="'+e(ff.id)+'" '+(String(ff.id)===String(s.transferDraft?.targetFarmId)?'selected':'')+'>'+e(ff.name)+'</option>').join('')+'</select></label><label class="ndp3-mt-10">Количина за пренос (паковања)<input type="number" inputmode="numeric" pattern="[0-9]*" data-transfer-count min="1" max="'+f(available)+'" step="1" value="'+e(count||Math.min(available,1))+'"></label><div class="ndp3-note">Пренос се извршава атомски. Потврђена и преузета количина остаје код изворног газдинства. Циљни захтев се враћа на „није послато“. Изворни захтев се враћа на тај статус само ако му је остала непотврђена количина. Viber поруке се не шаљу аутоматски.</div><div class="ndp3-actions"><button class="ndp3-btn primary" data-action="confirm-transfer" '+(!writable||s.busy||!candidates.length||!Number.isInteger(count)||count<1||count>available?'disabled':'')+'>'+(s.busy?'Преносим…':'Потврди пренос')+'</button><button class="ndp3-btn" data-action="close-transfer">Откажи</button></div>':'<div class="ndp3-stage-empty">Изворна расподела више није доступна.</div>')+'</section></div>';})():'')+
   (s.preparedMessage?'<div class="ndp3-modal"><section class="ndp3-modal-dialog" role="dialog" aria-modal="true" aria-label="Порука за газдинство"><header class="ndp3-modal-head"><div><div class="ndp3-kicker">ТРЕБОВАЊЕ · ТУРА #'+e(tourId)+'</div><h2>Порука за '+e(s.preparedMessageFarmName||'газдинство')+'</h2></div><button class="ndp3-btn" data-action="close-prepared-message">Затвори</button></header><p>Ово је порука само за изабрано газдинство. Копирај је и пошаљи ручно преко Viber-а или другог канала.</p><textarea class="ndp3-message" data-prepared-message readonly>'+e(s.preparedMessage)+'</textarea><div class="ndp3-actions"><button class="ndp3-btn primary" data-action="copy-prepared-message">Копирај поруку</button><button class="ndp3-btn" data-action="close-prepared-message">Затвори</button></div></section></div>':'')+
   '<div class="ndp3-foot">Подаци се читају и чувају у постојећој бази. Назив производа преузима се из евиденције производа. Укупна количина се рачуна множењем броја паковања и величине паковања.</div>';
  mountAnalyticsPanel?.();
 }
 render();
 return render;
}