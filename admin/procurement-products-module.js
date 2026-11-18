/*
 * NARUČI DOMAĆE — OPERATIVNA NABAVKA
 * Version: 3.7.0
 * Updated: 2026-11-18
 * Description: Adds three operational procurement stages, product/farm views, farm-wide request preparation and quantity-only confirmation/collection.
 * Scope: Existing ADMIN Workspace, existing Supabase schema and RLS only. No legacy panel dependency and no schema changes.
 */
import { loadProcurementData } from './data/admin-repository.js?v=1.0.2';
import { buildProcurementDemands, buildProcurementPackagingSummary } from './procurement/procurement-calculations.js?v=1.3.0';
import { mountTourAnalyticsPanel } from './tour-analytics-engine.js?v=1.0.0';
import { getProcurementStage, canMarkProcurementSent, canConfirmProcurement, canCollectProcurement, validateProcurementCounts, validateAllocationCount } from './procurement-workflow.js?v=1.0.2';

const n=v=>Number.isFinite(Number(v))?Number(v):0;
const f=v=>n(v).toLocaleString('sr-RS',{maximumFractionDigits:2});
const e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const key=(p,v)=>String(p)+'::'+String(v);
const CSS=`
.ndp3{--bg:#091426;--panel:#111f34;--line:#293c57;--muted:#9aabc1;--gold:#ffc18d;background:var(--bg);color:#eef3fa;border:1px solid var(--line);border-radius:20px;padding:12px;min-height:75vh;font-family:inherit}
.ndp3 *{box-sizing:border-box}.ndp3-head,.ndp3-row{display:flex;align-items:center;justify-content:space-between;gap:10px}.ndp3-head{margin-bottom:12px}.ndp3 h1{font-size:25px;margin:3px 0}.ndp3 h2{font-size:16px;margin:0 0 10px}.ndp3 p{color:var(--muted);font-size:12px;margin:5px 0}.ndp3-kicker{font-size:10px;letter-spacing:.13em;font-weight:900;color:var(--gold)}
.ndp3-select,.ndp3 input,.ndp3 textarea{width:100%;min-height:48px;background:#081224;color:#f3f6fb;border:1px solid #3a4e6c;border-radius:12px;padding:10px;font:inherit}.ndp3 label{display:grid;gap:6px;font-size:11px;color:#cbd6e5;font-weight:800}
.ndp3-btn{min-height:46px;padding:9px 13px;border:1px solid #405572;border-radius:12px;background:#1a2d47;color:#e8f1fc;font-weight:850;cursor:pointer}.ndp3-btn.primary{background:#92572f;border-color:#c27b49;color:#fff}.ndp3-btn:disabled{opacity:.45;cursor:not-allowed}.ndp3-btn.plus{min-width:46px;min-height:46px;font-size:22px;padding:4px}.ndp3-btn.minus{min-width:46px;min-height:46px;font-size:22px;padding:4px}
.ndp3-kpis{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin:12px 0}.ndp3-kpi{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:11px;min-width:0}.ndp3-kpi b{display:block;font-size:clamp(17px,4vw,23px);color:var(--gold);overflow-wrap:anywhere}.ndp3-kpi span{font-size:10px;color:var(--muted)}
.ndp3-panel{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:12px;margin:11px 0}.ndp3-toolbar{display:grid;grid-template-columns:1fr;gap:9px}.ndp3-status{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}.ndp3-chip{display:inline-flex;align-items:center;padding:5px 9px;border-radius:99px;background:#20344e;color:#cbd8e8;font-size:10px;font-weight:850}.ndp3-chip.blue{background:#183c65;color:#9ed0ff}.ndp3-chip.green{background:#174332;color:#a5e8c4}.ndp3-chip.red{background:#4b252c;color:#ffb6bd}.ndp3-chip.amber{background:#4b351e;color:#ffcf96}
.ndp3-category{font-size:11px;color:var(--gold);font-weight:900;letter-spacing:.1em;margin:15px 0 7px;text-transform:uppercase}.ndp3-product{border-top:1px solid var(--line);padding:12px 0}.ndp3-product:first-child{border-top:0}.ndp3-product strong{font-size:14px}.ndp3-product small{display:block;color:var(--muted);font-size:11px;margin-top:4px}.ndp3-coverage{height:7px;background:#26364d;border-radius:99px;overflow:hidden;margin-top:9px}.ndp3-coverage i{display:block;height:100%;background:#36a878;border-radius:99px}
.ndp3-stepper{display:flex;align-items:center;gap:8px}.ndp3-stepper output{min-width:35px;text-align:center;font-size:16px;font-weight:900;font-variant-numeric:tabular-nums}.ndp3-tabs{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin:12px 0}.ndp3-tab{min-height:48px;border-radius:12px;border:1px solid var(--line);background:#0c192d;color:#b7c5d8;font-weight:900}.ndp3-tab[aria-selected=true]{background:#253b58;color:#fff;border-color:#7590b3}
.ndp3-item{padding:11px 0;border-top:1px solid var(--line)}.ndp3-item:first-child{border-top:0}.ndp3-item-title{font-size:13px;font-weight:900}.ndp3-meta{font-size:10px;color:var(--muted);margin-top:4px}.ndp3-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}.ndp3-actions>*{flex:1 1 125px}.ndp3-empty{padding:15px;border:1px dashed #405572;border-radius:12px;color:var(--muted);font-size:12px}.ndp3-note{padding:11px;border-radius:12px;background:#18334a;color:#c9e2f5;font-size:12px;margin:10px 0}.ndp3-note.error{background:#48272e;color:#ffc4c9}.ndp3-message{min-height:125px;white-space:pre-wrap}.ndp3-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin:9px 0}.ndp3-grid span{background:#09172a;padding:8px;border-radius:10px;font-size:10px;color:var(--muted)}.ndp3-grid b{display:block;color:#fff;font-size:15px}.ndp3-record-inputs{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:8px}.ndp3-record-inputs label{font-size:10px}.ndp3-foot{font-size:10px;color:var(--muted);margin:12px 0}
@media(min-width:760px){.ndp3{padding:19px}.ndp3-toolbar{grid-template-columns:minmax(260px,.8fr) 1.2fr;align-items:end}.ndp3-kpis{grid-template-columns:repeat(4,minmax(0,1fr))}.ndp3-work{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(320px,.8fr);gap:12px}.ndp3-side{position:sticky;top:10px;align-self:start}}
@media(max-width:390px){.ndp3{padding:9px}.ndp3-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}

.ndp3-package-group{margin:12px 0;padding:12px;border:1px solid var(--line);border-radius:13px;background:rgba(8,20,37,.55)}
.ndp3-package-group>header{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;margin-bottom:10px}
.ndp3-package-group>header strong{font-size:13px}
.ndp3-package-group>header small{display:block;color:var(--muted);font-size:10px;margin-top:4px}
.ndp3-package-totals,.ndp3-package-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin:8px 0}
.ndp3-package-totals span,.ndp3-package-metrics span{display:block;min-width:0;padding:7px;border-radius:9px;background:#09172a;color:var(--muted);font-size:9px}
.ndp3-package-totals b,.ndp3-package-metrics b{display:block;color:#fff;font-size:14px;font-variant-numeric:tabular-nums}
.ndp3-package-metrics{grid-template-columns:repeat(3,minmax(0,1fr))}
.ndp3-package-warning{margin-top:7px;color:#fecaca;font-size:10px}
.ndp3-request-launch{width:100%;min-height:54px;margin:0 0 12px;font-size:15px}.ndp3-modal{position:fixed;inset:0;z-index:9999;background:rgba(2,8,20,.82);display:flex;align-items:flex-end;justify-content:center;padding:12px}.ndp3-modal[hidden]{display:none!important}.ndp3-modal-dialog{width:100%;max-width:760px;max-height:92dvh;overflow:auto;background:#0b192d;border:1px solid #405572;border-radius:20px;padding:14px;box-shadow:0 20px 70px #0009}.ndp3-modal-head{display:flex;justify-content:space-between;align-items:center;gap:10px;position:sticky;top:-14px;background:#0b192d;padding:8px 0 12px;z-index:2}@media(min-width:760px){.ndp3-modal{align-items:center}.ndp3-modal-dialog{max-height:88dvh}}
.ndp3-allocation-recap{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin:9px 0}
.ndp3-allocation-recap span{padding:8px;border-radius:9px;background:#09172a;color:var(--muted);font-size:9px}
.ndp3-allocation-recap b{display:block;color:#fff;font-size:14px;font-variant-numeric:tabular-nums}
@media(min-width:760px){.ndp3-package-totals{grid-template-columns:repeat(3,minmax(90px,1fr))}.ndp3-package-metrics{grid-template-columns:repeat(6,minmax(0,1fr))}}
`;
export async function mountProcurementProductsModule({root,core,tourId,onBack}){
 if(!root||!core?.client||!tourId)throw new Error('Недостаје ADMIN контекст или ID туре.');
 if(!['admin','super_admin'].includes(core.getState?.()?.role))throw new Error('Немате дозволу за управљање набавком.');
 const client=core.client,style=document.createElement('style');style.textContent=CSS;style.dataset.ndProcurementProducts='3.7.0';document.head.appendChild(style);
 const s={disposed:false,busy:false,analyticsHandle:null,preparedSentIds:new Set(),requestOpen:false,stage:'request',view:'products',tour:null,items:[],products:[],variants:[],demands:[],farms:[],offers:[],allocations:[],farmId:'',cart:[],draftCounts:{},tab:'basket',notice:'',error:false};
 root.innerHTML='<section class="ndp3"><div class="ndp3-empty">Учитавам потребе туре…</div></section>';const host=root.querySelector('.ndp3');
 const prod=id=>s.products.find(x=>String(x.id)===String(id)),variant=id=>s.variants.find(x=>String(x.id)===String(id)),farm=id=>s.farms.find(x=>String(x.id)===String(id));
 const demand=(p,v)=>s.demands.find(x=>key(x.productId,x.variantId)===key(p,v));
 const allocation=(p,v,fid)=>s.allocations.find(x=>key(x.product_id,x.variant_id)===key(p,v)&&String(x.gazdinstvo_id)===String(fid));
 const offer=(p,v,fid=s.farmId)=>s.offers.find(x=>key(x.product_id,x.variant_id)===key(p,v)&&String(x.gazdinstvo_id)===String(fid)&&x.is_active===true);
 const allocationsFor=(p,v)=>s.allocations.filter(x=>key(x.product_id,x.variant_id)===key(p,v));
 const allocated=(p,v)=>allocationsFor(p,v).reduce((a,x)=>a+n(x.broj_pakovanja),0);
 const ordered=(p,v)=>allocationsFor(p,v).reduce((a,x)=>a+n(x.naruceno_pakovanja),0);
 const pending=(p,v)=>s.cart.filter(x=>key(x.productId,x.variantId)===key(p,v)).reduce((a,x)=>a+n(x.count),0);
 const qty=(packages,d)=>d?f(packages*n(d.packageSize))+' '+e(d.packageUnit):f(packages)+' пак.';
 const rowsForFarm=()=>s.allocations.filter(x=>String(x.gazdinstvo_id)===String(s.farmId));
 const setNote=(v,err=false)=>{s.notice=v;s.error=err;render();};
 async function load(){
  const d=await loadProcurementData({client,tourId});
  Object.assign(s,{tour:d.tour,items:d.items,products:d.products,variants:d.variants,farms:d.farms,offers:d.relevantOffers,allocations:d.allocations});
  s.demands=buildProcurementDemands({items:s.items,products:s.products,variants:s.variants});
 }
 function unitTotals(selector){
  const map=new Map();
  for(const d of s.demands){if(!d.valid)continue;const unit=d.packageUnit||'пак.';const count=selector(d);map.set(unit,(map.get(unit)||0)+count*n(d.packageSize));}
  return [...map].map(([u,v])=>f(v)+' '+u).join(' · ')||'0';
 }
 const totalNeeded=()=>unitTotals(d=>d.packages);
 const totalOrdered=()=>unitTotals(d=>ordered(d.productId,d.variantId));
 const totalCollected=()=>unitTotals(d=>allocationsFor(d.productId,d.variantId).reduce((a,x)=>a+n(x.preuzeto_pakovanja),0));
 const totalRemaining=()=>unitTotals(d=>Math.max(0,d.packages-ordered(d.productId,d.variantId)));
 function message(){
  const ff=farm(s.farmId),rows=rowsForFarm().filter(x=>n(x.naruceno_pakovanja)>0);
  return 'Поштовани'+(ff?.name?' '+ff.name:'')+',\n\nМолимо вас да потврдите захтев за туру #'+tourId+':\n'+rows.map(x=>{const d=demand(x.product_id,x.variant_id);return '• '+(prod(x.product_id)?.name||'Производ')+' — '+(variant(x.variant_id)?.name||variant(x.variant_id)?.size_label||'Варијанта')+': '+f(x.naruceno_pakovanja)+' паковања ('+qty(x.naruceno_pakovanja,d)+')';}).join('\n')+'\n\nМолимо потврдите количине које можете да припремите. Хвала!';
 }
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
   '<div class="ndp3-modal" '+(s.requestOpen?'':'hidden')+'><section class="ndp3-modal-dialog" role="dialog" aria-modal="true" aria-label="Подеси захтев"><header class="ndp3-modal-head"><div><div class="ndp3-kicker">ГРУПНИ ЗАХТЕВ · ТУРА #'+e(tourId)+'</div><h2>Подеси захтев</h2></div><button class="ndp3-btn" data-action="close-request">Затвори</button></header><label>Прво изабери газдинство<select class="ndp3-select" data-farm><option value="">Изабери газдинство</option>'+s.farms.filter(ff=>s.offers.some(o=>String(o.gazdinstvo_id)===String(ff.id)&&o.is_active===true)).map(x=>'<option value="'+e(x.id)+'" '+(String(x.id)===String(s.farmId)?'selected':'')+'>'+e(x.name)+'</option>').join('')+'</select></label>'+(s.farmId?'<div class="ndp3-note">Приказујемо само производе и паковања које '+e(ff?.name||'изабрано газдинство')+' стварно нуди.</div>'+farmCatalog:'<div class="ndp3-empty">Изабери газдинство. Систем ће затим филтрирати његову активну понуду.</div>')+'<section class="ndp3-panel"><h2>Заједнички захтев · '+e(ff?.name||'изабери газдинство')+'</h2>'+(s.farmId?cartHtml:'<div class="ndp3-empty">Прво изабери газдинство.</div>')+'<div class="ndp3-actions"><button class="ndp3-btn primary" data-action="generate" '+(!s.farmId||!s.cart.length||!writable||s.busy?'disabled':'')+'>'+(s.busy?'Чувам…':'Сачувај захтев и припреми Viber поруку')+'</button></div></section></section></div>'+
   '<div class="ndp3-foot">Подаци се читају и уписују у постојеће Supabase табеле. Назив производа долази преко product_id → products.name. Количине се рачунају из package_count × package_size.</div>';
  s.analyticsHandle?.destroy();const analyticsRoot=host.querySelector('[data-tour-analytics-root]');if(analyticsRoot)s.analyticsHandle=mountTourAnalyticsPanel({root:analyticsRoot,client,tourId,intervalMs:30000});
 }
 async function saveCart(){
  if(s.busy||!s.cart.length||!s.farmId)return false;
  if(s.tour?.status!=='processing'){setNote('Тура није отворена за измене.',true);return false;}
  s.busy=true;render();
  try{
   const payloads=[];
   for(const item of s.cart){
    const d=demand(item.productId,item.variantId),o=offer(item.productId,item.variantId),old=allocation(item.productId,item.variantId,s.farmId);
    if(!d?.valid||!o)throw Error('Понуда или подаци о паковању нису важећи. Освежи податке.');
    if(old&&(old.viber_status==='sent'||old.viber_status==='replied'||n(old.potvrdjeno_pakovanja)>0||n(old.preuzeto_pakovanja)>0))throw Error('Ова ставка је већ послата или је у каснијој фази и не може се поново захтевати.');
    const requested=n(old?.naruceno_pakovanja)+n(item.count);
    const alreadyAllocatedElsewhere=Math.max(0,allocated(item.productId,item.variantId)-n(old?.broj_pakovanja));
    const check=validateAllocationCount({requested,alreadyAllocated:alreadyAllocatedElsewhere,demand:d.packages});
    if(!check.valid)throw Error('Захтев није могуће сачувати због постојеће евиденције ове варијанте. Претходне набавне евиденције морају бити усаглашене пре новог захтева.');
    if(requested<n(old?.potvrdjeno_pakovanja)||requested<n(old?.preuzeto_pakovanja))throw Error('Нови захтев не може бити мањи од већ потврђене или преузете количине.');
    payloads.push({tura_id:Number(tourId),product_id:item.productId,variant_id:item.variantId,gazdinstvo_id:Number(s.farmId),broj_pakovanja:requested,naruceno_pakovanja:requested,nabavna_cena:n(o.purchase_price),naruceno:false,potvrdjeno_pakovanja:0,preuzeto_pakovanja:0,viber_status:'not_sent',updated_at:new Date().toISOString()});
   }
   // Existing allocation rows must be UPDATED by primary key. PostgREST UPSERT
   // executes the INSERT trigger before conflict resolution and rejects legacy rows.
   const appliedUpdates=[],insertedIds=[],savedRows=[];
   try{
    for(const payload of payloads){
     const old=allocation(payload.product_id,payload.variant_id,s.farmId);
     if(old){
      const patch={broj_pakovanja:payload.broj_pakovanja,naruceno_pakovanja:payload.naruceno_pakovanja,nabavna_cena:payload.nabavna_cena,naruceno:false,potvrdjeno_pakovanja:0,preuzeto_pakovanja:0,viber_status:'not_sent',updated_at:payload.updated_at};
      const q=await client.from('tura_nabavka_dodele').update(patch).eq('id',old.id).select('id,variant_id,gazdinstvo_id,broj_pakovanja,naruceno_pakovanja').maybeSingle();
      if(q.error)throw Error(q.error.message);
      if(!q.data)throw Error('Постојећа евиденција није ажурирана. Провери ADMIN дозволе и освежи податке.');
      appliedUpdates.push({old});
      savedRows.push(q.data);
     }else{
      const q=await client.from('tura_nabavka_dodele').insert(payload).select('id,variant_id,gazdinstvo_id,broj_pakovanja,naruceno_pakovanja').single();
      if(q.error)throw Error(q.error.message);
      if(!q.data)throw Error('База није потврдила упис нове ставке.');
      insertedIds.push(q.data.id);
      savedRows.push(q.data);
     }
    }
    if(savedRows.length!==payloads.length)throw Error('База није потврдила све ставке групног захтева.');
    for(const payload of payloads){
     const row=savedRows.find(x=>String(x.variant_id)===String(payload.variant_id)&&String(x.gazdinstvo_id)===String(s.farmId));
     if(!row||n(row.broj_pakovanja)!==n(payload.broj_pakovanja)||n(row.naruceno_pakovanja)!==n(payload.naruceno_pakovanja))throw Error('База није потврдила истовремени упис захтеване количине и техничког поља.');
    }
   }catch(writeError){
    const rollbackErrors=[];
    for(const id of insertedIds){
     const r=await client.from('tura_nabavka_dodele').delete().eq('id',id);
     if(r.error)rollbackErrors.push(r.error.message);
    }
    for(const applied of [...appliedUpdates].reverse()){
     const old=applied.old;
     const restore={broj_pakovanja:old.broj_pakovanja,naruceno_pakovanja:old.naruceno_pakovanja,nabavna_cena:old.nabavna_cena,naruceno:old.naruceno,potvrdjeno_pakovanja:old.potvrdjeno_pakovanja,preuzeto_pakovanja:old.preuzeto_pakovanja,viber_status:old.viber_status,updated_at:old.updated_at};
     const r=await client.from('tura_nabavka_dodele').update(restore).eq('id',old.id);
     if(r.error)rollbackErrors.push(r.error.message);
    }
    if(rollbackErrors.length)throw Error((writeError.message||String(writeError))+' Аутоматско враћање није у потпуности успело: '+rollbackErrors.join('; '));
    throw writeError;
   }
   s.cart=[];await load();s.stage='request';setNote('Захтев је евидентиран као припремљен. Статус слања се мења тек након стварног слања Viber поруке.');return true;
  }catch(err){setNote('Захтев није сачуван: '+(err.message||String(err)),true);return false;}
  finally{s.busy=false;render();}
 }
async function prepareFarmRequest(farmId){
  const rows=s.allocations.filter(x=>String(x.gazdinstvo_id)===String(farmId)&&x.viber_status==='not_sent'&&n(x.naruceno_pakovanja)>0);
  if(!rows.length)return setNote('Ово газдинство нема захтев који чека слање.',true);
  const ff=farm(farmId);
  const text='Поштовани'+(ff?.name?' '+ff.name:'')+',\n\nМолимо вас да потврдите захтев за туру #'+tourId+':\n'+rows.map(x=>{const d=demand(x.product_id,x.variant_id);return '• '+(prod(x.product_id)?.name||'Производ')+' — '+(variant(x.variant_id)?.name||variant(x.variant_id)?.size_label||'Паковање')+': '+f(x.naruceno_pakovanja)+' паковања ('+qty(x.naruceno_pakovanja,d)+')';}).join('\n')+'\n\nМолимо потврдите количине које можете да припремите. Хвала!';
  try{
   if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(text);
   const phone=String(ff?.phone||'').replace(/[^\d+]/g,'');
   if(phone)window.location.href='viber://chat?number='+encodeURIComponent(phone);
   setNote(phone?'Порука је копирана и Viber разговор је отворен. Након стварног слања потврди слање.':'Порука је припремљена. За газдинство није наведен телефон; копирај поруку и пошаљи је ручно.');
  }catch(error){setNote('Припрема поруке није успела: '+(error.message||String(error)),true);}
 }
 async function markFarmSent(farmId){
  if(s.busy)return;
  if(s.tour?.status!=='processing')return setNote('Тура није отворена за измене.',true);
  const rows=s.allocations.filter(x=>String(x.gazdinstvo_id)===String(farmId)&&x.viber_status==='not_sent'&&n(x.naruceno_pakovanja)>0);
  if(!rows.length)return setNote('Нема ставки које чекају слање за ово газдинство.',true);
  if(!window.confirm('Потврђујеш да је заиста послат заједнички захтев газдинству '+(farm(farmId)?.name||('#'+farmId))+'?'))return;
  s.busy=true;render();
  try{
   const ids=rows.map(x=>x.id),sentAt=new Date().toISOString();
   const q=await client.from('tura_nabavka_dodele').update({naruceno:true,viber_status:'sent',viber_poslato_at:sentAt,updated_at:sentAt}).in('id',ids).eq('viber_status','not_sent').select('id,viber_status');
   if(q.error)throw Error(q.error.message);
   if(!q.data||q.data.length!==ids.length||q.data.some(x=>x.viber_status!=='sent'))throw Error('База није потврдила слање за све ставке заједничког захтева.');
   await load();s.stage='confirm';setNote('Заједнички захтев је означен као стварно послат. Ставке сада чекају потврду газдинства.');
  }catch(error){try{await load();}catch(_){}setNote('Слање није у потпуности евидентирано: '+(error.message||String(error)),true);}
  finally{s.busy=false;render();}
 }
 async function markSent(id){
  if(s.busy)return;
  const row=s.allocations.find(x=>String(x.id)===String(id));if(!row)return;
  if(!canMarkProcurementSent(row))return setNote('Ова ставка није у фази чекања на слање.',true);
  if(s.tour?.status!=='processing')return setNote('Тура није отворена за измене.',true);
  if(!window.confirm('Потврђујеш да је захтев за ову ставку заиста послат газдинству?'))return;
  s.busy=true;render();
  try{
   const sentAt=new Date().toISOString();
   const q=await client.from('tura_nabavka_dodele').update({naruceno:true,viber_status:'sent',viber_poslato_at:sentAt,updated_at:sentAt}).eq('id',row.id).eq('viber_status','not_sent').select('id,naruceno_pakovanja,viber_status').maybeSingle();
   if(q.error)throw Error(q.error.message);
   if(!q.data||q.data.viber_status!=='sent'||n(q.data.naruceno_pakovanja)!==n(row.naruceno_pakovanja))throw Error('База није потврдила прелаз у фазу чекања потврде.');
   s.preparedSentIds.delete(String(id));await load();s.stage='confirm';setNote('Слање је евидентирано. Ставка сада чека потврду газдинства.');
  }catch(err){setNote('Слање није евидентирано: '+(err.message||String(err)),true);}
  finally{s.busy=false;render();}
 }
async function saveField(id){
  if(s.busy)return;
  const row=s.allocations.find(x=>String(x.id)===String(id));if(!row)return;
  const fields=[...host.querySelectorAll('[data-id="'+id+'"][data-field]')];
  const values=Object.fromEntries(fields.map(x=>[x.dataset.field,Number(x.value)]));
  const confirmed=Object.prototype.hasOwnProperty.call(values,'potvrdjeno_pakovanja')?values.potvrdjeno_pakovanja:n(row.potvrdjeno_pakovanja);
  const collected=Object.prototype.hasOwnProperty.call(values,'preuzeto_pakovanja')?values.preuzeto_pakovanja:n(row.preuzeto_pakovanja);
  const check=validateProcurementCounts(row,{confirmed,collected});
  if(!check.valid)return setNote(check.error,true);
  const siblings=allocationsFor(row.product_id,row.variant_id).filter(x=>String(x.id)!==String(id)),d=demand(row.product_id,row.variant_id);
  if(!d)return setNote('За ову ставку није пронађено требовање у поруџбинама.',true);
  if(siblings.reduce((a,x)=>a+n(x.preuzeto_pakovanja),0)+collected>d.packages)return setNote('Укупно преузето премашује потребу туре.',true);
  if(siblings.reduce((a,x)=>a+n(x.potvrdjeno_pakovanja),0)+confirmed>d.packages)return setNote('Укупно потврђено премашује потребу туре.',true);
  if(s.tour?.status!=='processing')return setNote('Тура није отворена за измене.',true);
  s.busy=true;render();
  try{
   const patch={potvrdjeno_pakovanja:confirmed,preuzeto_pakovanja:collected,updated_at:new Date().toISOString()};
   if(confirmed!==n(row.potvrdjeno_pakovanja))patch.potvrdjeno_at=confirmed?new Date().toISOString():null;
   const q=await client.from('tura_nabavka_dodele').update(patch).eq('id',row.id).select('id,potvrdjeno_pakovanja,preuzeto_pakovanja').maybeSingle();
   if(q.error)throw Error(q.error.message);
   if(!q.data||n(q.data.potvrdjeno_pakovanja)!==confirmed||n(q.data.preuzeto_pakovanja)!==collected)throw Error('База није потврдила упис количина.');
   await load();s.stage=confirmed>collected?'collect':'confirm';
   setNote('Количина је сачувана и поново прочитана из базе. Историја измене је евидентирана.');
  }catch(err){setNote('Унос није сачуван: '+(err.message||String(err)),true);}
  finally{s.busy=false;render();}
 }
 async function generateViber(){
  if(!s.farmId||!s.cart.length||s.busy)return;const farmId=s.farmId,cartSnapshot=s.cart.map(x=>({...x})),ff=farm(farmId);
  const text='Поштовани'+(ff?.name?' '+ff.name:'')+',\n\nМолимо вас да потврдите захтев за туру #'+tourId+':\n'+cartSnapshot.map(x=>{const d=demand(x.productId,x.variantId),old=allocation(x.productId,x.variantId,farmId),total=n(old?.naruceno_pakovanja)+n(x.count);return '• '+(prod(x.productId)?.name||'Производ')+' — '+(variant(x.variantId)?.name||variant(x.variantId)?.size_label||'Варијанта')+': '+f(total)+' паковања ('+qty(total,d)+')';}).join('\n')+'\n\nМолимо потврдите количине које можете да припремите. Хвала!';
  const saved=await saveCart();if(!saved)return;
  try{const copied=!!navigator.clipboard?.writeText;if(copied)await navigator.clipboard.writeText(text);const phone=String(ff?.phone||'').replace(/[^\d+]/g,'');const ids=s.allocations.filter(x=>String(x.gazdinstvo_id)===String(farmId)&&cartSnapshot.some(c=>key(c.productId,c.variantId)===key(x.product_id,x.variant_id))).map(x=>String(x.id));ids.forEach(id=>s.preparedSentIds.add(id));if(phone)window.location.href='viber://chat?number='+encodeURIComponent(phone);s.stage='request';setNote(phone?(copied?'Додела је сачувана, порука је копирана и Viber је отворен. Након стварног слања потврди га у теренском протоколу.':'Додела је сачувана и Viber је отворен. Поруку пошаљи ручно; статус није промењен.'):(copied?'Додела је сачувана и порука копирана. Нема телефона за отварање Viber-а; статус слања није промењен.':'Додела је сачувана. Нема телефона нити доступног копирања; статус слања није промењен.'),false);}
  catch(err){setNote('Додела је сачувана, али припрема поруке није успела: '+(err.message||String(err)),true);}
 }
host.addEventListener('change',ev=>{if(ev.target.matches('[data-farm]')){s.farmId=ev.target.value;s.cart=[];s.draftCounts={};render();}});
 host.addEventListener('click',async ev=>{
  const b=ev.target.closest('[data-action],[data-tab],[data-stage],[data-view]');if(!b)return;
  if(b.dataset.stage){s.stage=b.dataset.stage;render();return;}
  if(b.dataset.view){s.view=b.dataset.view;render();return;}
  if(b.dataset.tab){s.tab=b.dataset.tab;render();return;}
  const a=b.dataset.action;
  if(a==='back')return onBack?.();
  if(a==='open-request'){s.requestOpen=true;render();return;}
  if(a==='close-request'){s.requestOpen=false;render();return;}
  if(a==='prepare-farm')return prepareFarmRequest(b.dataset.farmId);
  if(a==='mark-farm-sent')return markFarmSent(b.dataset.farmId);
  if(a==='fill-all'){
   const p=b.dataset.p,v=b.dataset.v,d=demand(p,v);if(!d?.valid)return setNote('Подаци о производу и амбалажи нису важећи.',true);
   const item=s.cart.find(x=>key(x.productId,x.variantId)===key(p,v));
   const requested=ordered(p,v),limit=Math.max(0,d.packages-requested-(item?.count||0));
   if(limit<=0)return setNote('Нема више слободне количине за припрему захтева.',true);
   s.draftCounts[key(p,v)]=limit;render();return;
  }
  if(a==='step'){
   const p=b.dataset.p,v=b.dataset.v,d=demand(p,v),item=s.cart.find(x=>key(x.productId,x.variantId)===key(p,v));
   const draftKey=key(p,v),limit=Math.max(0,d.packages-ordered(p,v)-(item?.count||0));
   const current=Object.prototype.hasOwnProperty.call(s.draftCounts,draftKey)?s.draftCounts[draftKey]:limit;
   s.draftCounts[draftKey]=Math.max(0,Math.min(limit,current+Number(b.dataset.delta)));render();return;
  }
  if(a==='add'){
   const p=b.dataset.p,v=b.dataset.v,d=demand(p,v),item=s.cart.find(x=>key(x.productId,x.variantId)===key(p,v));
   const draftKey=key(p,v),limit=Math.max(0,d.packages-ordered(p,v)-(item?.count||0));
   const count=Object.prototype.hasOwnProperty.call(s.draftCounts,draftKey)?s.draftCounts[draftKey]:limit;
   if(!Number.isInteger(count)||count<=0||count>limit)return setNote('Изабери количину у оквиру преостале потребе ('+qty(limit,d)+').',true);
   if(item)item.count+=count;else s.cart.push({productId:p,variantId:v,count});
   s.draftCounts[draftKey]=0;render();return;
  }
  if(a==='cart-step'){const x=s.cart[Number(b.dataset.i)];if(!x)return;const d=demand(x.productId,x.variantId),limit=Math.max(0,d.packages-ordered(x.productId,x.variantId));x.count=Math.max(0,Math.min(limit,x.count+Number(b.dataset.delta)));s.cart=s.cart.filter(y=>y.count>0);render();return;}
  if(a==='remove'){s.cart.splice(Number(b.dataset.i),1);render();return;}
  if(a==='save-field')return saveField(b.dataset.id);
  if(a==='mark-sent')return markSent(b.dataset.id);
  if(a==='generate')return generateViber();
 });
  try{await load();render();}catch(err){host.innerHTML='<div class="ndp3-empty"><b>Набавка није учитана</b><p>'+e(err.message||String(err))+'</p><button class="ndp3-btn" data-action="back">Назад</button></div>';}
 return{destroy(){s.disposed=true;s.analyticsHandle?.destroy();style.remove();root.replaceChildren();}};
}
