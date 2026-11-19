/*
 * NARUČI DOMAĆE — OPERATIVNA NABAVKA
 * Version: 4.2.0
 * Updated: 2026-11-19
 * Description: Refines mobile-first procurement typography, controls, numeric entry and compact packaging rows.
 * Scope: Existing ADMIN Workspace; SECURITY INVOKER RPC runs under existing authenticated RLS and trigger protections.
 */
import { loadProcurementData } from './data/admin-repository.js?v=1.0.3';
import { buildProcurementDemands, buildProcurementPackagingSummary } from './procurement/procurement-calculations.js?v=1.3.0';
import { mountTourAnalyticsPanel } from './tour-analytics-engine.js?v=1.0.0';
import { renderProcurementStageView } from './procurement/procurement-stage-view.js?v=1.4.0';
import { renderAllocationSheet, buildAllocationCart, distributeRemaining } from './procurement/procurement-request-allocation-sheet.js?v=1.1.0';
import { loadProcurementHistory, markProcurementSent, saveProcurementTracking, transferUnconfirmedProcurement } from './procurement/procurement-workflow-actions.js?v=1.1.0';
import { getProcurementStage, canMarkProcurementSent, canConfirmProcurement, canCollectProcurement, validateProcurementCounts, validateAllocationCount } from './procurement-workflow.js?v=1.0.2';

const n=v=>Number.isFinite(Number(v))?Number(v):0;
const f=v=>n(v).toLocaleString('sr-RS',{maximumFractionDigits:2});
const e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const key=(p,v)=>String(p)+'::'+String(v);
const CSS=`
.ndp3-farm-checks{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:7px;margin:12px 0}.ndp3-farm-check{display:flex!important;grid-template-columns:none!important;align-items:center;gap:9px;padding:10px;border:1px solid var(--line);border-radius:11px;background:#09172a}.ndp3-farm-check input{width:20px;height:20px;min-height:20px;accent-color:#36a878}.ndp3-allocation-field{display:grid!important;grid-template-columns:minmax(0,1fr) 100px;align-items:center;gap:9px;padding:8px 0;border-top:1px solid var(--line)}.ndp3-allocation-field input{min-height:42px;text-align:right}.ndp3-allocation-total{margin-top:8px;padding:9px;background:#18334a;border-radius:9px;font-size:11px;color:#cbd6e5}.ndp3-allocation-product{padding:12px;border:1px solid var(--line);border-radius:12px;margin:10px 0;background:#0d1b30}

.ndp3-farm-checks{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:7px;margin:12px 0}.ndp3-farm-check{display:flex!important;grid-template-columns:none!important;align-items:center;gap:9px;padding:10px;border:1px solid var(--line);border-radius:11px;background:#09172a}.ndp3-farm-check input{width:20px;height:20px;min-height:20px;accent-color:#36a878}.ndp3-allocation-field{display:grid!important;grid-template-columns:minmax(0,1fr) 100px;align-items:center;gap:9px;padding:8px 0;border-top:1px solid var(--line)}.ndp3-allocation-field input{min-height:42px;text-align:right}.ndp3-allocation-total{margin-top:8px;padding:9px;background:#18334a;border-radius:9px;font-size:11px;color:#cbd6e5}.ndp3-allocation-product{padding:12px;border:1px solid var(--line);border-radius:12px;margin:10px 0;background:#0d1b30}

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

.ndp3{overflow-x:hidden;max-width:100%;min-width:0}.ndp3 *{min-width:0}
.ndp3 .ndp3-stage-line,.ndp3 .ndp3-stage-group,.ndp3 .ndp3-product,.ndp3 .ndp3-package-group{overflow:hidden}
.ndp3 .ndp3-stage-values{display:grid;grid-template-columns:repeat(auto-fit,minmax(105px,1fr));gap:8px}
.ndp3 .ndp3-stage-values>span{display:flex;flex-direction:column;gap:4px;min-width:0;padding:10px;border:1px solid #2b405d;border-radius:11px;background:#0a172a;color:#9eafc4;font-size:10px}
.ndp3 .ndp3-stage-values>span>b{font-size:17px;line-height:1.15;color:#fff;font-weight:900;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.ndp3 .ndp3-stage-values>span>small{font-size:10px;color:#a9b8ca;line-height:1.3}
.ndp3 .ndp3-stage-values>span>.ndp3-value-label{font-size:10px;color:#9eafc4;font-weight:750}
.ndp3 .ndp3-stage-line-title{font-size:14px;font-weight:850;line-height:1.35;overflow-wrap:anywhere}
.ndp3 .ndp3-stage-line-meta{line-height:1.45;overflow-wrap:anywhere}
.ndp3 .ndp3-stage-input input,.ndp3 [data-transfer-count],.ndp3 [data-allocation-qty]{font-size:18px;font-weight:850;font-variant-numeric:tabular-nums;text-align:center}
.ndp3 .ndp3-stage-input{display:grid;grid-template-columns:minmax(0,1fr);gap:10px;align-items:end}
.ndp3 .ndp3-stage-actions{display:flex;flex-wrap:wrap;gap:8px}
.ndp3 .ndp3-stage-actions .ndp3-btn{flex:1 1 145px;min-height:48px}
.ndp3 .ndp3-modal-dialog{padding:16px;padding-bottom:calc(18px + env(safe-area-inset-bottom));overscroll-behavior:contain}
.ndp3 .ndp3-modal-head{padding:10px 0 14px}.ndp3 .ndp3-modal-head h2{font-size:19px;line-height:1.25}
.ndp3 .ndp3-modal-dialog label{margin-top:12px;font-size:12px}
.ndp3 .ndp3-modal-dialog input,.ndp3 .ndp3-modal-dialog select{min-height:52px;font-size:17px}
.ndp3 .ndp3-modal-dialog .ndp3-actions{position:sticky;bottom:-16px;padding:12px 0 calc(8px + env(safe-area-inset-bottom));background:linear-gradient(180deg,rgba(11,25,45,.88),#0b192d 25%);z-index:3}
.ndp3 .ndp3-modal-dialog .ndp3-actions .primary{min-height:54px;font-size:14px}
.ndp3 .ndp3-package-totals,.ndp3 .ndp3-package-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}
.ndp3 .ndp3-package-totals b,.ndp3 .ndp3-package-metrics b{font-size:16px}
.ndp3 .ndp3-allocation-quantity strong{display:block;color:#fff;font-size:16px;font-variant-numeric:tabular-nums}
.ndp3 .ndp3-allocation-quantity small{display:block;margin-top:4px;color:#a9b8ca;font-size:10px}
@media(min-width:760px){.ndp3 .ndp3-package-totals{grid-template-columns:repeat(3,minmax(90px,1fr))}}

`;
export async function mountProcurementProductsModule({root,core,tourId,onBack}){
 if(!root||!core?.client||!tourId)throw new Error('Недостаје ADMIN контекст или ID туре.');
 if(!['admin','super_admin'].includes(core.getState?.()?.role))throw new Error('Немате дозволу за управљање набавком.');
 const client=core.client,style=document.createElement('style');style.textContent=CSS;style.dataset.ndProcurementProducts='4.2.0';document.head.appendChild(style);
 const s={disposed:false,busy:false,analyticsHandle:null,preparedSentIds:new Set(),requestOpen:false,transferOpen:false,transferDraft:{sourceId:null,targetFarmId:'',packages:0},allocationDraft:{selectedFarmIds:[],quantities:{}},stage:'request',view:'products',tour:null,items:[],products:[],variants:[],demands:[],farms:[],offers:[],allocations:[],history:[],cart:[],tab:'basket',notice:'',error:false};
 root.innerHTML='<section class="ndp3"><div class="ndp3-empty">Учитавам потребе туре…</div></section>';const host=root.querySelector('.ndp3');
 const prod=id=>s.products.find(x=>String(x.id)===String(id)),variant=id=>s.variants.find(x=>String(x.id)===String(id)),farm=id=>s.farms.find(x=>String(x.id)===String(id));
 const demand=(p,v)=>s.demands.find(x=>key(x.productId,x.variantId)===key(p,v));
 const allocation=(p,v,fid)=>s.allocations.find(x=>key(x.product_id,x.variant_id)===key(p,v)&&String(x.gazdinstvo_id)===String(fid));
 const offer=(p,v,fid)=>s.offers.find(x=>key(x.product_id,x.variant_id)===key(p,v)&&String(x.gazdinstvo_id)===String(fid)&&x.is_active===true);
 const allocationsFor=(p,v)=>s.allocations.filter(x=>key(x.product_id,x.variant_id)===key(p,v));
 const allocated=(p,v)=>allocationsFor(p,v).reduce((a,x)=>a+n(x.broj_pakovanja),0);
 const ordered=(p,v)=>allocationsFor(p,v).reduce((a,x)=>a+n(x.naruceno_pakovanja),0);
 const pending=(p,v)=>s.cart.filter(x=>key(x.productId,x.variantId)===key(p,v)).reduce((a,x)=>a+n(x.count),0);
 const qty=(packages,d)=>d?f(packages*n(d.packageSize))+' '+e(d.packageUnit):f(packages)+' пак.';
 const setNote=(v,err=false)=>{s.notice=v;s.error=err;render();};
 async function load(onProgress){
  const d=await loadProcurementData({client,tourId,onProgress});
  Object.assign(s,{tour:d.tour,items:d.items,products:d.products,variants:d.variants,farms:d.farms,offers:d.relevantOffers,allocations:d.allocations});
  s.demands=buildProcurementDemands({items:s.items,products:s.products,variants:s.variants});
  s.history=await loadProcurementHistory({client,tourId,limit:300});
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

 function render(){
  renderProcurementStageView({s,host,tourId,client,n,f,e,key,qty,prod,variant,farm,demand,allocated,ordered,allocationsFor,totalNeeded,totalOrdered,totalRemaining,totalCollected,offer,allocation,canConfirmProcurement,canCollectProcurement,history:s.history,buildAllocationSheetHtml:()=>renderAllocationSheet({s,e,f}),mountAnalyticsPanel:()=>{
   s.analyticsHandle?.destroy();
   const analyticsRoot=host.querySelector('[data-tour-analytics-root]');
   if(analyticsRoot)s.analyticsHandle=mountTourAnalyticsPanel({root:analyticsRoot,client,tourId,intervalMs:30000});
  }});
 }
 async function saveCart(){
  if(s.busy||!s.cart.length)return false;
  if(s.tour?.status!=='processing'){setNote('Тура није отворена за измене.',true);return false;}
  s.busy=true;render();
  try{
   const payloads=[],newByVariant=new Map();
   for(const item of s.cart){
    const d=demand(item.productId,item.variantId),o=offer(item.productId,item.variantId,item.farmId),old=allocation(item.productId,item.variantId,item.farmId);
    if(!d?.valid||!o)throw Error('Понуда или подаци о паковању нису важећи. Освежи податке.');
    if(old&&(old.viber_status==='sent'||old.viber_status==='replied'||n(old.potvrdjeno_pakovanja)>0||n(old.preuzeto_pakovanja)>0))throw Error('Ова ставка је већ послата или је у каснијој фази и не може се поново захтевати.');
    const requested=n(old?.naruceno_pakovanja)+n(item.count);
    const kx=key(item.productId,item.variantId);
    if(!newByVariant.has(kx))newByVariant.set(kx,{demand:d.packages,added:0,replace:0,productId:item.productId,variantId:item.variantId});
    const group=newByVariant.get(kx);group.added+=n(item.count);group.replace+=n(old?.broj_pakovanja);
    payloads.push({tura_id:Number(tourId),product_id:item.productId,variant_id:item.variantId,gazdinstvo_id:Number(item.farmId),broj_pakovanja:requested,naruceno_pakovanja:requested,nabavna_cena:n(o.purchase_price),naruceno:false,potvrdjeno_pakovanja:0,preuzeto_pakovanja:0,viber_status:'not_sent',updated_at:new Date().toISOString()});
   }
   for(const group of newByVariant.values()){
    const already=Math.max(0,allocated(group.productId,group.variantId)-group.replace);
    const check=validateAllocationCount({requested:group.added,alreadyAllocated:already,demand:group.demand});
    if(!check.valid)throw Error('Збир расподеле премашује преосталу потребу за једном од амбалажа. Освежи податке и провери расподелу.');
   }
   const appliedUpdates=[],insertedIds=[],savedRows=[];
   try{
    for(const payload of payloads){
     const old=allocation(payload.product_id,payload.variant_id,payload.gazdinstvo_id);
     if(old){
      const patch={broj_pakovanja:payload.broj_pakovanja,naruceno_pakovanja:payload.naruceno_pakovanja,nabavna_cena:payload.nabavna_cena,naruceno:false,potvrdjeno_pakovanja:0,preuzeto_pakovanja:0,viber_status:'not_sent',updated_at:payload.updated_at};
      const q=await client.from('tura_nabavka_dodele').update(patch).eq('id',old.id).select('id,product_id,variant_id,gazdinstvo_id,broj_pakovanja,naruceno_pakovanja').maybeSingle();
      if(q.error)throw Error(q.error.message);if(!q.data)throw Error('Постојећа евиденција није ажурирана.');
      appliedUpdates.push({old});savedRows.push(q.data);
     }else{
      const q=await client.from('tura_nabavka_dodele').insert(payload).select('id,product_id,variant_id,gazdinstvo_id,broj_pakovanja,naruceno_pakovanja').single();
      if(q.error)throw Error(q.error.message);if(!q.data)throw Error('База није потврдила упис нове ставке.');
      insertedIds.push(q.data.id);savedRows.push(q.data);
     }
    }
    if(savedRows.length!==payloads.length)throw Error('База није потврдила све ставке групног захтева.');
    for(const payload of payloads){
     const row=savedRows.find(x=>String(x.product_id)===String(payload.product_id)&&String(x.variant_id)===String(payload.variant_id)&&String(x.gazdinstvo_id)===String(payload.gazdinstvo_id));
     if(!row||n(row.broj_pakovanja)!==n(payload.broj_pakovanja)||n(row.naruceno_pakovanja)!==n(payload.naruceno_pakovanja))throw Error('База није потврдила упис расподеле за свако газдинство.');
    }
   }catch(writeError){
    const rollbackErrors=[];
    for(const id of insertedIds){const r=await client.from('tura_nabavka_dodele').delete().eq('id',id);if(r.error)rollbackErrors.push(r.error.message);}
    for(const applied of [...appliedUpdates].reverse()){const old=applied.old,restore={broj_pakovanja:old.broj_pakovanja,naruceno_pakovanja:old.naruceno_pakovanja,nabavna_cena:old.nabavna_cena,naruceno:old.naruceno,potvrdjeno_pakovanja:old.potvrdjeno_pakovanja,preuzeto_pakovanja:old.preuzeto_pakovanja,viber_status:old.viber_status,updated_at:old.updated_at};const r=await client.from('tura_nabavka_dodele').update(restore).eq('id',old.id);if(r.error)rollbackErrors.push(r.error.message);}
    if(rollbackErrors.length)throw Error((writeError.message||String(writeError))+' Аутоматско враћање није у потпуности успело: '+rollbackErrors.join('; '));
    throw writeError;
   }
   s.cart=[];s.allocationDraft={selectedFarmIds:[],quantities:{}};await load();s.stage='request';return true;
  }catch(err){setNote('Захтев није сачуван: '+(err.message||String(err)),true);return false;}
  finally{s.busy=false;render();}
 }
async function prepareFarmRequest(farmId){
  const rows=s.allocations.filter(x=>String(x.gazdinstvo_id)===String(farmId)&&x.viber_status==='not_sent'&&n(x.naruceno_pakovanja)>n(x.potvrdjeno_pakovanja));
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
   await markProcurementSent({client,rowIds:rows.map(x=>x.id)});
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
   await markProcurementSent({client,rowIds:[row.id]});
   s.preparedSentIds.delete(String(id));await load();s.stage='confirm';setNote('Слање је евидентирано и поново прочитано из базе.');
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
   const saved=await saveProcurementTracking({client,row,confirmed,collected});
   await load();s.stage=confirmed>collected?'collect':'confirm';
   setNote('Количина је сачувана и поново прочитана из базе. Историја измене је евидентирана.');
  }catch(err){setNote('Унос није сачуван: '+(err.message||String(err)),true);}
  finally{s.busy=false;render();}
 }
 async function generateViber(){
  if(!s.cart.length||s.busy)return;const cartSnapshot=s.cart.map(x=>({...x}));
  const byFarm=new Map();cartSnapshot.forEach(x=>{if(!byFarm.has(String(x.farmId)))byFarm.set(String(x.farmId),[]);byFarm.get(String(x.farmId)).push(x);});
  const text=[...byFarm.entries()].map(([farmId,items])=>'ГАЗДИНСТВО: '+(farm(farmId)?.name||farmId)+'\n'+items.map(x=>{const d=demand(x.productId,x.variantId);return '• '+(prod(x.productId)?.name||'Производ')+' — '+(variant(x.variantId)?.name||variant(x.variantId)?.size_label||'Варијанта')+': '+f(x.count)+' паковања ('+qty(x.count,d)+')';}).join('\n')).join('\n\n');
  const saved=await saveCart();if(!saved)return;
  try{const copied=!!navigator.clipboard?.writeText;if(copied)await navigator.clipboard.writeText(text);s.stage='request';setNote(copied?'Расподела је сачувана, а поруке су копиране груписано по газдинствима. Пошаљи их засебно; статус слања није аутоматски промењен.':'Расподела је сачувана. Копирање није доступно; статус слања није промењен.',false);}
  catch(err){setNote('Додела је сачувана, али припрема поруке није успела: '+(err.message||String(err)),true);}
 }
host.addEventListener('change',ev=>{
  if(ev.target.matches('[data-transfer-target]')){s.transferDraft.targetFarmId=ev.target.value;render();return;}
  if(ev.target.matches('[data-transfer-count]')){s.transferDraft.packages=Number(ev.target.value);render();return;}
  if(ev.target.matches('[data-allocation-farm]')){
   const id=ev.target.value,ids=s.allocationDraft.selectedFarmIds.filter(x=>String(x)!==String(id));
   if(ev.target.checked)ids.push(id);s.allocationDraft.selectedFarmIds=ids;
   for(const d of s.demands.filter(x=>x.valid)){const eligible=ids.filter(id=>s.offers.some(o=>String(o.gazdinstvo_id)===String(id)&&String(o.product_id)===String(d.productId)&&String(o.variant_id)===String(d.variantId)&&o.is_active===true)&&!s.allocations.some(a=>String(a.gazdinstvo_id)===String(id)&&String(a.product_id)===String(d.productId)&&String(a.variant_id)===String(d.variantId)&&n(a.naruceno_pakovanja)>0));const kx=key(d.productId,d.variantId),remaining=Math.max(0,d.packages-allocated(d.productId,d.variantId));s.allocationDraft.quantities[kx]=distributeRemaining({total:remaining,eligibleFarmIds:eligible,quantities:s.allocationDraft.quantities[kx]||{},editedFarmId:null});}
   render();return;
  }
  if(ev.target.matches('[data-allocation-qty]')){
   const {product,variant,farmId}=ev.target.dataset,d=demand(product,variant),kx=key(product,variant),eligible=s.allocationDraft.selectedFarmIds.filter(id=>s.offers.some(o=>String(o.gazdinstvo_id)===String(id)&&String(o.product_id)===String(product)&&String(o.variant_id)===String(variant)&&o.is_active===true)&&!s.allocations.some(a=>String(a.gazdinstvo_id)===String(id)&&String(a.product_id)===String(product)&&String(a.variant_id)===String(variant)&&n(a.naruceno_pakovanja)>0)),remaining=Math.max(0,d.packages-allocated(product,variant)),q=s.allocationDraft.quantities[kx]||{};
   q[String(farmId)]=Math.max(0,Math.floor(Number(ev.target.value)||0));s.allocationDraft.quantities[kx]=distributeRemaining({total:remaining,eligibleFarmIds:eligible,quantities:q,editedFarmId:farmId});render();return;
  }
 });
 host.addEventListener('click',async ev=>{
  const b=ev.target.closest('[data-action],[data-tab],[data-stage],[data-view]');if(!b)return;
  if(b.dataset.stage){s.stage=b.dataset.stage;render();return;}
  if(b.dataset.view){s.view=b.dataset.view;render();return;}
  if(b.dataset.tab){s.tab=b.dataset.tab;render();return;}
  const a=b.dataset.action;
  if(a==='retry-load'){initialize();return;}
  if(a==='back')return onBack?.();
  if(a==='open-request'){s.requestOpen=true;s.allocationDraft={selectedFarmIds:[],quantities:{}};render();return;}
  if(a==='close-request'){s.requestOpen=false;render();return;}
  if(a==='open-transfer'){
   const row=s.allocations.find(x=>String(x.id)===String(b.dataset.id));if(!row)return;
   const candidates=[...new Set(s.offers.filter(o=>o.is_active===true&&String(o.product_id)===String(row.product_id)&&String(o.variant_id)===String(row.variant_id)&&String(o.gazdinstvo_id)!==String(row.gazdinstvo_id)).map(o=>String(o.gazdinstvo_id)))].filter(id=>farm(id));
   if(!candidates.length)return setNote('Нема другог газдинства са активном понудом за ову тачну варијанту.',true);
   const available=Math.max(0,n(row.naruceno_pakovanja)-n(row.potvrdjeno_pakovanja));
   if(!available)return setNote('Нема непотврђене количине за пренос.',true);
   s.transferDraft={sourceId:String(row.id),targetFarmId:candidates[0],packages:available};s.transferOpen=true;render();return;
  }
  if(a==='close-transfer'){s.transferOpen=false;render();return;}
  if(a==='confirm-transfer'){
   if(s.busy)return;
   const row=s.allocations.find(x=>String(x.id)===String(s.transferDraft?.sourceId));
   const targetFarmId=s.transferDraft?.targetFarmId,count=Number(s.transferDraft?.packages);
   const available=row?Math.max(0,n(row.naruceno_pakovanja)-n(row.potvrdjeno_pakovanja)):0;
   if(!row)return setNote('Изворна расподела више није доступна. Освежи податке.',true);
   if(!Number.isInteger(count)||count<1||count>available)return setNote('Унеси цео број паковања у оквиру непотврђене количине.',true);
   if(!offer(row.product_id,row.variant_id,targetFarmId))return setNote('Циљно газдинство више нема активну понуду за ову варијанту.',true);
   if(!window.confirm('Пренети '+count+' паковања са '+(farm(row.gazdinstvo_id)?.name||'изворног газдинства')+' на '+(farm(targetFarmId)?.name||'циљно газдинство')+'? Потврђена количина остаје код изворног газдинства.'))return;
   s.busy=true;render();
   try{
    const result=await transferUnconfirmedProcurement({client,sourceRow:row,targetFarmId,packages:count});
    await load();s.transferOpen=false;s.stage='confirm';
    setNote('Пренос је потврђен у бази: '+f(result.transferred_packages)+' паковања је додато газдинству '+(farm(targetFarmId)?.name||('#'+targetFarmId))+'. Циљни захтев и сваки преостали непотврђени захтев враћени су на статус „није послато“; Viber поруке нису аутоматски послате.');
   }catch(error){
    try{await load();}catch(_){}
    setNote('Пренос није потврђен: '+(error.message||String(error))+' Освежи приказ пре новог покушаја.',true);
   }finally{s.busy=false;render();}
   return;
  }
  if(a==='prepare-farm')return prepareFarmRequest(b.dataset.farmId);
  if(a==='mark-farm-sent')return markFarmSent(b.dataset.farmId);
  if(a==='save-field')return saveField(b.dataset.id);
  if(a==='mark-sent')return markSent(b.dataset.id);
  if(a==='save-multi-allocation'){const cart=buildAllocationCart({s});if(!s.allocationDraft.selectedFarmIds.length)return setNote('Изабери најмање једно газдинство.',true);if(!cart.length)return setNote('Распореди бар једну количину производа.',true);for(const d of s.demands.filter(x=>x.valid)){const sum=cart.filter(x=>key(x.productId,x.variantId)===key(d.productId,d.variantId)).reduce((a,x)=>a+x.count,0);if(sum>Math.max(0,d.packages-allocated(d.productId,d.variantId)))return setNote('Расподела премашује преосталу потребу.',true);}s.cart=cart;s.requestOpen=false;return generateViber();}
 });
  let loadAttempt=0;
 async function initialize(){
  const attempt=++loadAttempt;
  if(s.disposed)return;
  host.innerHTML='<div class="ndp3-empty"><b>Учитавам потребе туре…</b><p>Проверавам туру и стварне податке у бази.</p><p data-load-stage>Припрема захтева…</p></div>';
  let timeoutId;
  try{
   await Promise.race([
    new Promise((_,reject)=>{timeoutId=window.setTimeout(()=>reject(new Error('Учитавање из базе није завршено у року од 15 секунди. Захтев није завршен. Покушај поново.')),15000);}),
    Promise.resolve().then(()=>load(stage=>{const p=host.querySelector('[data-load-stage]');if(p)p.textContent=stage;}))
   ]);
   clearTimeout(timeoutId);
   if(attempt!==loadAttempt||s.disposed)return;
   render();
  }catch(err){
   clearTimeout(timeoutId);
   if(attempt!==loadAttempt||s.disposed)return;
   host.innerHTML='<div class="ndp3-empty"><b>Набавка није учитана</b><p>'+e(err.message||String(err))+'</p><p>Подаци нису мењани. Можеш безбедно поново да покренеш читање.</p><div class="ndp3-actions"><button class="ndp3-btn primary" data-action="retry-load">Покушај поново</button><button class="ndp3-btn" data-action="back">Назад</button></div></div>';
  }
 }
 initialize();
 return{destroy(){s.disposed=true;loadAttempt++;s.analyticsHandle?.destroy();style.remove();root.replaceChildren();}};
}
