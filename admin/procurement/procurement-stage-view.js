/*
 * NARUČИ ДОМАЋЕ — PROCUREMENT STAGE VIEW
 * Version: 1.4.0
 * Updated: 2026-11-19
 * Description: Improves procurement stage hierarchy, package-count emphasis and mobile numeric inputs.
 * Scope: Existing ADMIN Workspace only.
 */
export function renderProcurementStageView(ctx){
 const {s,host,tourId,client,n,f,e,key,qty,prod,variant,farm,demand,allocated,ordered,allocationsFor,totalNeeded,totalOrdered,totalRemaining,totalCollected,offer,allocation,canConfirmProcurement,canCollectProcurement,history=[],buildAllocationSheetHtml,mountAnalyticsPanel}=ctx;
 function render(){
  if(s.disposed)return;
  const writable=s.tour?.status==='processing';
  const requestRows=s.allocations.filter(x=>x.viber_status==='not_sent'&&n(x.naruceno_pakovanja)>n(x.potvrdjeno_pakovanja));
  const confirmRows=s.allocations.filter(x=>canConfirmProcurement(x));
  const collectRows=s.allocations.filter(x=>canCollectProcurement(x));
  const unassigned=s.demands.filter(d=>d.valid&&Math.max(0,d.packages-allocated(d.productId,d.variantId))>0);
  const rows=s.stage==='request'?requestRows:s.stage==='confirm'?confirmRows:s.stage==='collect'?collectRows:[];
  const transferCandidates=row=>{const ids=[...new Set(s.offers.filter(o=>o.is_active===true&&String(o.product_id)===String(row.product_id)&&String(o.variant_id)===String(row.variant_id)&&String(o.gazdinstvo_id)!==String(row.gazdinstvo_id)).map(o=>String(o.gazdinstvo_id)))];return ids.map(id=>farm(id)).filter(Boolean);};
  const sourceSummary=d=>{const totals=new Map();(d?.sourceOrders||[]).forEach(x=>{const id=x.orderId===null||x.orderId===undefined?'без броја':String(x.orderId);totals.set(id,(totals.get(id)||0)+n(x.packageCount));});return [...totals].map(([id,count])=>(id==='без броја'?'Изворна ставка':'Поруџбина #'+id)+' · '+f(count)+' пак.').join(' · ')||'Извор поруџбине није доступан';};
  const historyHtml=()=>{
   if(!history.length)return '<div class="ndp3-stage-empty">Нема забележених промена за ову туру.</div>';
   const label={INSERT:'Креирана додела',UPDATE:'Измењена додела',DELETE:'Обрисана додела'};
   const fields=[['broj_pakovanja','Додељено'],['naruceno_pakovanja','Захтевано'],['potvrdjeno_pakovanja','Потврђено'],['preuzeto_pakovanja','Преузето'],['viber_status','Статус слања'],['nabavna_cena','Набавна цена']];
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
  const amountLabel=(count,d)=>qty(count,d);
  const stageTitle=s.stage==='request'?'Захтев':s.stage==='confirm'?'Потврда':s.stage==='collect'?'Преузимање':'Историја промена';
  const lineHtml=row=>{
   const d=demand(row.product_id,row.variant_id),p=prod(row.product_id),v=variant(row.variant_id),ff=farm(row.gazdinstvo_id);
   const requested=n(row.naruceno_pakovanja),confirmed=n(row.potvrdjeno_pakovanja),collected=n(row.preuzeto_pakovanja);
   let values='<span><b>'+packageLabel(requested)+'</b><small>'+e(amountLabel(requested,d))+'</small><small class="ndp3-value-label">Захтевано</small></span>';
   if(confirmed>0)values+='<span><b>'+packageLabel(confirmed)+'</b><small>'+e(amountLabel(confirmed,d))+'</small><small class="ndp3-value-label">Потврђено</small></span>';
   if(collected>0)values+='<span><b>'+packageLabel(collected)+'</b><small>'+e(amountLabel(collected,d))+'</small><small class="ndp3-value-label">Преузето</small></span>';
   let controls='';
   if(s.stage==='request'){
    controls='<div class="ndp3-stage-actions"><button class="ndp3-btn primary" data-action="mark-sent" data-id="'+e(row.id)+'" '+(!writable||s.busy?'disabled':'')+'>Потврди слање захтева</button></div>';
   }else if(s.stage==='confirm'){
    const initial=confirmed>0?confirmed:requested;
    controls='<div class="ndp3-stage-input"><label>Потврђена количина (паковања)<input type="number" inputmode="numeric" pattern="[0-9]*" min="0" max="'+f(requested)+'" step="1" data-field="potvrdjeno_pakovanja" data-id="'+e(row.id)+'" value="'+f(initial)+'" '+(!writable||s.busy||!canConfirmProcurement(row)?'disabled':'')+'></label><div><div class="ndp3-stage-line-meta">Преостало за потврду: <strong>'+f(Math.max(0,requested-confirmed))+' паковања</strong></div><div class="ndp3-stage-actions"><button class="ndp3-btn primary" data-action="save-field" data-id="'+e(row.id)+'" '+(!writable||s.busy||!canConfirmProcurement(row)?'disabled':'')+'>Сачувај потврду</button>'+(requested>confirmed&&transferCandidates(row).length?'<button class="ndp3-btn" data-action="open-transfer" data-id="'+e(row.id)+'" '+(!writable||s.busy?'disabled':'')+'>Пренеси непотврђено</button>':'')+'</div></div></div>';
   }else{
    controls='<div class="ndp3-stage-input"><label>Стварно преузето (паковања)<input type="number" inputmode="numeric" pattern="[0-9]*" min="'+f(collected)+'" max="'+f(confirmed)+'" step="1" data-field="preuzeto_pakovanja" data-id="'+e(row.id)+'" value="'+f(collected)+'" '+(!writable||s.busy||!canCollectProcurement(row)?'disabled':'')+'></label><div><div class="ndp3-stage-line-meta">Преостало за преузимање: <strong>'+f(Math.max(0,confirmed-collected))+' паковања</strong></div><div class="ndp3-stage-actions"><button class="ndp3-btn primary" data-action="save-field" data-id="'+e(row.id)+'" '+(!writable||s.busy||!canCollectProcurement(row)?'disabled':'')+'>Евидентирај преузимање</button></div></div></div>';
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
   return '<article class="ndp3-stage-line"><div class="ndp3-stage-line-title">'+e(prod(d.productId)?.name||'Производ')+' · '+e(variant(d.variantId)?.name||variant(d.variantId)?.size_label||'Паковање')+'</div><div class="ndp3-stage-line-meta">'+f(d.packageSize)+' '+e(d.packageUnit)+' по паковању</div><div class="ndp3-stage-line-meta">Извор: '+e(sourceSummary(d))+'</div><div class="ndp3-stage-values"><span><b>'+packageLabel(d.packages)+'</b><small>'+e(amountLabel(d.packages,d))+'</small><small class="ndp3-value-label">Потребно</small></span><span><b>'+packageLabel(remaining)+'</b><small>'+e(amountLabel(remaining,d))+'</small><small class="ndp3-value-label">Није додељено</small></span></div></article>';
  }).join('')+'</section>':'';
  const contentRows=groupedRows();
  const phaseContent=s.stage==='history'?historyHtml():s.stage==='request'?(unassignedHtml+contentRows||'<div class="ndp3-stage-empty">Све потребне количине су додељене или већ имају захтев. Нема ставки које чекају захтев.</div>'):
   (contentRows||'<div class="ndp3-stage-empty">'+(s.stage==='confirm'?'Нема послатих захтева који чекају потврду.':'Нема потврђених количина које чекају преузимање.')+'</div>');
  const invalidDemandCount=s.demands.filter(x=>!x.valid).length;
  const invalidSourceCount=s.items.filter(x=>!x.product_id||!x.variant_id).length;
  const demandWarning=(invalidDemandCount||invalidSourceCount)?'<div class="ndp3-note error">Пажња: '+invalidDemandCount+' невалидних комбинација производа/варијанте и '+invalidSourceCount+' изворних ставки без производа или варијанте нису укључене у збирове.</div>':'';
  host.innerHTML='<style>.ndp3-history-list{display:grid;gap:9px}.ndp3-modal-dialog label{display:grid;gap:7px;color:#cbd6e5;font-size:12px;font-weight:800}.ndp3-modal-dialog .ndp3-select{min-height:48px}.ndp3-history-item{padding:12px;border:1px solid var(--line);border-radius:12px;background:#0b192d}.ndp3-history-item>header{display:flex;justify-content:space-between;gap:8px;align-items:center;margin-bottom:8px}.ndp3-history-item time{font-size:10px;color:var(--muted)}.ndp3-history-changes{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin-top:9px}.ndp3-history-changes span{padding:7px;border-radius:8px;background:#091426;min-width:0}.ndp3-history-changes small{display:block;color:var(--muted);font-size:9px}.ndp3-history-changes b{display:block;font-size:10px;overflow-wrap:anywhere}@media(max-width:420px){.ndp3-history-changes{grid-template-columns:1fr}}</style><header class="ndp3-head"><div><div class="ndp3-kicker">ОПЕРАТИВНА ТАБЛА · ТУРА #'+e(tourId)+'</div><h1>Набавка</h1><p>'+e(s.tour?.naziv||'Тура')+' · Сви производи и паковања из базе</p></div><button class="ndp3-btn" data-action="back">← Назад</button></header>'+
   '<nav class="ndp3-phase-tabs" aria-label="Фазе набавке"><button class="ndp3-phase-tab" data-stage="request" aria-selected="'+(s.stage==='request')+'">Захтев<small>'+(requestRows.length+unassigned.length)+' ставки</small></button><button class="ndp3-phase-tab" data-stage="confirm" aria-selected="'+(s.stage==='confirm')+'">Потврда<small>'+confirmRows.length+' ставки</small></button><button class="ndp3-phase-tab" data-stage="collect" aria-selected="'+(s.stage==='collect')+'">Преузимање<small>'+collectRows.length+' ставки</small></button><button class="ndp3-phase-tab" data-stage="history" aria-selected="'+(s.stage==='history')+'">Историја<small>'+history.length+'</small></button></nav>'+
   '<div class="ndp3-view-switch"><button type="button" data-view="products" aria-pressed="'+(s.view==='products')+'">По производима</button><button type="button" data-view="farms" aria-pressed="'+(s.view==='farms')+'">По газдинствима</button></div>'+
   (s.stage==='request'?'<button class="ndp3-btn primary ndp3-request-launch" data-action="open-request" '+(!writable?'disabled':'')+'>Подеси захтев</button>':'')+
   '<section class="ndp3-kpis"><div class="ndp3-kpi"><b>'+totalNeeded()+'</b><span>УКУПНО ПОТРЕБНО</span></div>'+(s.demands.some(d=>ordered(d.productId,d.variantId)>0)?'<div class="ndp3-kpi"><b>'+totalOrdered()+'</b><span>ЗАХТЕВАНО</span></div>':'')+'<div class="ndp3-kpi"><b>'+totalRemaining()+'</b><span>МОЖЕ ЈОШ ДА СЕ ЗАХТЕВА</span></div>'+(s.demands.some(d=>allocationsFor(d.productId,d.variantId).some(x=>n(x.preuzeto_pakovanja)>0))?'<div class="ndp3-kpi"><b>'+totalCollected()+'</b><span>ПРЕУЗЕТО</span></div>':'')+'</section>'+
   (s.notice?'<div class="ndp3-note '+(s.error?'error':'')+'" role="status">'+e(s.notice)+'</div>':'')+(!writable?'<div class="ndp3-note">Тура није у статусу processing. Приказ је само за читање.</div>':'')+demandWarning+
   '<section class="ndp3-panel"><div class="ndp3-row"><h2>'+stageTitle+'</h2><span class="ndp3-chip">'+(s.stage==='history'?'Непроменљива евиденција':s.view==='products'?'Груписано по производима':'Груписано по газдинствима')+'</span></div>'+phaseContent+'</section>'+
   '<div class="ndp3-modal" '+(s.requestOpen?'':'hidden')+'><section class="ndp3-modal-dialog" role="dialog" aria-modal="true" aria-label="Подеси захтев"><header class="ndp3-modal-head"><div><div class="ndp3-kicker">ГРУПНИ ЗАХТЕВ · ТУРА #'+e(tourId)+'</div><h2>Подеси захтев за више газдинстава</h2></div><button class="ndp3-btn" data-action="close-request">Затвори</button></header>'+buildAllocationSheetHtml()+'<div class="ndp3-actions"><button class="ndp3-btn primary" data-action="save-multi-allocation" '+(!writable||s.busy?'disabled':'')+'>'+(s.busy?'Чувам…':'Сачувај расподелу и припреми поруке')+'</button></div></section></div>'+
   (s.transferOpen?(()=>{const source=s.allocations.find(x=>String(x.id)===String(s.transferDraft?.sourceId));const candidates=source?transferCandidates(source):[];const available=source?Math.max(0,n(source.naruceno_pakovanja)-n(source.potvrdjeno_pakovanja)):0;const count=Number(s.transferDraft?.packages)||0;return '<div class="ndp3-modal"><section class="ndp3-modal-dialog" role="dialog" aria-modal="true" aria-label="Пренос непотврђене количине"><header class="ndp3-modal-head"><div><div class="ndp3-kicker">ПРЕРАСПОДЕЛА · ТУРА #'+e(tourId)+'</div><h2>Пренеси непотврђену количину</h2></div><button class="ndp3-btn" data-action="close-transfer">Затвори</button></header>'+(source?'<div class="ndp3-note">Изворно газдинство: <b>'+e(farm(source.gazdinstvo_id)?.name||'Газдинство')+'</b><br>Производ: <b>'+e(prod(source.product_id)?.name||'Производ')+'</b> · '+e(variant(source.variant_id)?.name||variant(source.variant_id)?.size_label||'Паковање')+'<br>Потврђено и задржано: <b>'+f(source.potvrdjeno_pakovanja)+' пак.</b><br>На располагању за пренос: <b>'+f(available)+' пак.</b></div><label>Циљно газдинство<select class="ndp3-select" data-transfer-target>'+candidates.map(ff=>'<option value="'+e(ff.id)+'" '+(String(ff.id)===String(s.transferDraft?.targetFarmId)?'selected':'')+'>'+e(ff.name)+'</option>').join('')+'</select></label><label style="margin-top:10px">Количина за пренос (паковања)<input type="number" inputmode="numeric" pattern="[0-9]*" data-transfer-count min="1" max="'+f(available)+'" step="1" value="'+e(count||Math.min(available,1))+'"></label><div class="ndp3-note">Пренос се извршава атомски. Потврђена и преузета количина остаје код изворног газдинства. Циљни захтев се враћа на „није послато“. Изворни захтев се враћа на тај статус само ако му је остала непотврђена количина. Viber поруке се не шаљу аутоматски.</div><div class="ndp3-actions"><button class="ndp3-btn primary" data-action="confirm-transfer" '+(!writable||s.busy||!candidates.length||!Number.isInteger(count)||count<1||count>available?'disabled':'')+'>'+(s.busy?'Преносим…':'Потврди пренос')+'</button><button class="ndp3-btn" data-action="close-transfer">Откажи</button></div>':'<div class="ndp3-stage-empty">Изворна расподела више није доступна.</div>')+'</section></div>';})():'')+
   '<div class="ndp3-foot">Подаци се читају и уписују у постојеће Supabase табеле. Назив производа долази преко product_id → products.name. Количине се рачунају из package_count × package_size.</div>';
  mountAnalyticsPanel?.();
 }
 render();
 return render;
}