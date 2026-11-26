/*
 * NARUČI DOMAĆE — OPERATIVNA NABAVKA
 * Version: 4.19.4
 * Updated: 2026-11-26
 * Description: Confirms saved pickup quantities with farm and product details, and keeps the pickup phase selected after saving.
 * Scope: Existing ADMIN Workspace; SECURITY INVOKER RPC runs under existing authenticated RLS and trigger protections.
 */
import { loadProcurementData } from './data/admin-repository.js?v=1.0.8';
import { buildProcurementDemands, buildProcurementPackagingSummary } from './procurement/procurement-calculations.js?v=1.3.1';
import { mountTourAnalyticsPanel } from './tour-analytics-engine.js?v=1.0.1';
import { renderProcurementStageView } from './procurement/procurement-stage-view.js?v=2.9.4';
import { renderAllocationSheet, buildAllocationCart, distributeRemaining } from './procurement/procurement-request-allocation-sheet.js?v=1.3.6';
import { loadProcurementHistory, markProcurementSent, saveProcurementTracking, transferUnconfirmedProcurement } from './procurement/procurement-workflow-actions.js?v=1.1.1';
import { saveProcurementAllocationCart, saveCustomerFarmAllocation, saveCustomerOrderQuantities } from './procurement/procurement-allocation-actions.js?v=1.1.2';
import { getProcurementStage, canMarkProcurementSent, canConfirmProcurement, canCollectProcurement, validateProcurementCounts, validateAllocationCount } from './procurement-workflow.js?v=1.0.2';

const n=v=>Number.isFinite(Number(v))?Number(v):0;
const f=v=>n(v).toLocaleString('sr-RS',{maximumFractionDigits:2});
const e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const key=(p,v)=>String(p)+'::'+String(v);
export async function mountProcurementProductsModule({root,core,tourId,onBack,initialStage='request'}){
 if(!root||!core?.client||!tourId)throw new Error('Недостаје ADMIN контекст или ID туре.');
 if(!['admin','super_admin'].includes(core.getState?.()?.role))throw new Error('Немате дозволу за управљање набавком.');
 const client=core.client;
 const safeInitialStage=['request','confirm','collect'].includes(initialStage)?initialStage:'request';
 const s={disposed:false,busy:false,analyticsHandle:null,preparedSentIds:new Set(),requestOpen:false,requestProductId:null,requestVariantId:null,requestFarmFilter:null,requestFarmRemainingOnly:false,assignmentSaveMode:false,editAllocationId:null,editAllocationDraft:{},orderDraft:{},transferOpen:false,transferDraft:{sourceId:null,targetFarmId:'',packages:0},allocationDraft:{selectedFarmIds:[],quantities:{}},stage:safeInitialStage,view:'products',tour:null,items:[],products:[],variants:[],demands:[],farms:[],offers:[],allocations:[],history:[],cart:[],tab:'basket',notice:'',error:false,preparedMessage:'',preparedMessageFarmName:''};
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
  Object.assign(s,{tour:d.tour,tourPoints:d.tourPoints||[],items:d.items,products:d.products,variants:d.variants,farms:d.farms,offers:d.relevantOffers,allocations:d.allocations});
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
  renderProcurementStageView({s,host,tourId,client,n,f,e,key,qty,prod,variant,farm,demand,allocated,ordered,allocationsFor,totalNeeded,totalOrdered,totalRemaining,totalCollected,offer,allocation,canConfirmProcurement,canCollectProcurement,history:s.history,editAllocationRow:s.allocations.find(x=>String(x.id)===String(s.editAllocationId))||null,editAllocationDraft:s.editAllocationDraft,buildAllocationSheetHtml:()=>renderAllocationSheet({s,e,f,productId:s.requestProductId,variantId:s.requestVariantId,orderDraft:s.orderDraft,writable:s.tour?.status==='processing',busy:s.busy}),mountAnalyticsPanel:()=>{
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
   await saveProcurementAllocationCart({client,tourId,cart:s.cart,demands:s.demands,offers:s.offers,allocations:s.allocations,validateAllocationCount});
   s.cart=[];s.allocationDraft={selectedFarmIds:[],quantities:{}};await load();s.stage='request';return true;
  }catch(err){setNote('Захтев није сачуван: '+(err.message||String(err)),true);return false;}
  finally{s.busy=false;render();}
 }
 async function quickRequest({farmId,productId,variantId}={}){
  if(s.busy)return;
  if(s.tour?.status!=='processing')return setNote('Тура није отворена за измене.',true);
  const d=demand(productId,variantId),ff=farm(farmId),current=allocation(productId,variantId,farmId);
  if(!d?.valid||!d.allocatable||!ff||!offer(productId,variantId,farmId))return setNote('Газдинство нема активну понуду за ову амбалажу.',true);
  if(current&&(current.viber_status!=='not_sent'||n(current.potvrdjeno_pakovanja)>0||n(current.preuzeto_pakovanja)>0))return setNote('Ово требовање је већ послато или потврђено. Изабери друго газдинство за преосталу количину.',true);
  const count=Math.max(0,n(d.packages)-ordered(productId,variantId));
  if(!Number.isInteger(count)||count<1)return setNote('Нема преостале количине за требовање.',true);
  s.busy=true;render();
  try{
   await saveProcurementAllocationCart({client,tourId,cart:[{productId,variantId,farmId,count}],demands:s.demands,offers:s.offers,allocations:s.allocations,validateAllocationCount});
   await load();s.stage='request';setNote('Успешно требовано '+f(count)+' паковања за '+(ff.name||'изабрано газдинство')+'. Количина је поново учитана из базе.');
  }catch(error){try{await load();}catch(_){}setNote('Требовање није сачувано: '+(error.message||String(error)),true);}
  finally{s.busy=false;render();}
 }
 async function prepareFarmRequest(farmId){
  const rows=s.allocations.filter(x=>String(x.gazdinstvo_id)===String(farmId)&&x.viber_status==='not_sent'&&n(x.naruceno_pakovanja)>n(x.potvrdjeno_pakovanja));
  if(!rows.length)return setNote('Ово газдинство нема требовање које чека слање.',true);
  const ff=farm(farmId),phone=String(ff?.phone||'').trim();
  const date=s.tour?.datum?new Date(s.tour.datum+'T12:00:00').toLocaleDateString('sr-RS'):'датум није наведен';
  const schedule=(s.tourPoints||[]).map(point=>(point.vreme?point.vreme+' — ':'')+point.name).join('\n');
  const message='ПОШТОВАНИ '+(ff?.name||'')+',\n\nТРЕБОВАЊЕ ЗА ТУРУ #'+tourId+'\nДатум туре: '+date+(schedule?'\nРаспоред пунктова и времена:\n'+schedule:'')+'\n\n'+rows.map(x=>{const d=demand(x.product_id,x.variant_id);return '• '+(prod(x.product_id)?.name||'Производ')+' — '+(variant(x.variant_id)?.name||variant(x.variant_id)?.size_label||'Паковање')+'\n  Потребно: '+f(x.naruceno_pakovanja)+' паковања ('+qty(x.naruceno_pakovanja,d)+')';}).join('\n')+'\n\nМолимо вас да потврдите колико паковања можете да припремите. Хвала!'+(phone?'\n\nКонтакт газдинства: '+phone:'');
  const viberPhone=phone.replace(/[^\d+]/g,'');
  if(!viberPhone){s.preparedMessage=message;s.preparedMessageFarmName=ff?.name||('Газдинство #'+farmId);return setNote('За ово газдинство није уписан телефон. Порука је отворена испод и може да се копира.');}
  try{
   if(!navigator.clipboard?.writeText)throw new Error('Копирање није доступно.');
   await navigator.clipboard.writeText(message);
   window.location.href='viber://chat?number='+encodeURIComponent(viberPhone);
   setNote('Порука је копирана. Отворен је Viber разговор; провери текст и пошаљи га ручно. Статус још није промењен.');
  }catch(error){s.preparedMessage=message;s.preparedMessageFarmName=ff?.name||('Газдинство #'+farmId);setNote('Аутоматско копирање није успело. Порука је отворена испод за ручно копирање.');}
 }
 async function markFarmSent(farmId){
  if(s.busy)return;
  if(s.tour?.status!=='processing')return setNote('Тура није отворена за измене.',true);
  const rows=s.allocations.filter(x=>String(x.gazdinstvo_id)===String(farmId)&&x.viber_status==='not_sent'&&n(x.naruceno_pakovanja)>n(x.potvrdjeno_pakovanja));
  if(!rows.length)return setNote('Нема ставки које чекају слање за ово газдинство.',true);
  if(!window.confirm('Потврђујеш да је заиста послато заједничко требовање газдинству '+(farm(farmId)?.name||('#'+farmId))+'?'))return;
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
  if(!window.confirm('Потврђујеш да је требовање за ову ставку заиста послато газдинству?'))return;
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
  const stageBeforeSave=s.stage;
  const farmName=farm(row.gazdinstvo_id)?.name||('Газдинство #'+row.gazdinstvo_id);
  const productName=prod(row.product_id)?.name||'Производ';
  const variantName=variant(row.variant_id)?.name||variant(row.variant_id)?.size_label||'Паковање';
  const newlyCollected=Math.max(0,collected-n(row.preuzeto_pakovanja));
  s.busy=true;render();
  try{
   await saveProcurementTracking({client,row,confirmed,collected});
   await load();
   s.stage=stageBeforeSave==='collect'?'collect':(confirmed>collected?'collect':'confirm');
   const remaining=Math.max(0,confirmed-collected);
   const resultMessage=newlyCollected>0
    ?'Преузимање евидентирано и проверено у бази: '+farmName+' · '+productName+' · '+variantName+' — '+f(newlyCollected)+' нових паковања. Укупно преузето: '+f(collected)+' од '+f(confirmed)+'. '+(remaining>0?'Преостало за преузимање: '+f(remaining)+' паковања.':'Сва потврђена количина је преузета.')
    :'Промена преузете количине је сачувана и проверена у бази за '+farmName+' · '+productName+' · '+variantName+'. Укупно преузето: '+f(collected)+' од '+f(confirmed)+' паковања. '+(remaining>0?'Преостало: '+f(remaining)+' паковања.':'Преузимање је завршено.');
   setNote(resultMessage);
  }catch(err){s.stage=stageBeforeSave;setNote('Преузимање није потврђено као сачувано: '+(err.message||String(err)),true);}
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
host.addEventListener('input',ev=>{
 if(ev.target.matches('[data-farm-search]')){
  const q=String(ev.target.value||'').trim().toLocaleLowerCase('sr');
  host.querySelectorAll('[data-farm-filter][data-farm-name]').forEach(row=>{row.hidden=!!q&&!String(row.dataset.farmName||'').includes(q);});
  return;
 }
 if(ev.target.matches('[data-product-search]')){
  const q=String(ev.target.value||'').trim().toLocaleLowerCase('sr');
  host.querySelectorAll('[data-product-search-name]').forEach(card=>{card.hidden=!!q&&!String(card.dataset.productSearchName||'').includes(q);});
 }
});
host.addEventListener('toggle',ev=>{
 const productCard=ev.target;
 if(!productCard.matches?.('.ndp3-product-step[open]'))return;
 host.querySelectorAll('.ndp3-product-step[open]').forEach(other=>{if(other!==productCard)other.open=false;});
},true);
host.addEventListener('change',ev=>{
  if(ev.target.matches('[data-customer-order-count]')){const item=s.items.find(x=>String(x.id)===String(ev.target.dataset.itemId));if(!item)return;const value=Math.max(0,Math.min(9999,Math.floor(Number(ev.target.value)||0)));s.orderDraft={...s.orderDraft,[String(item.id)]:value};render();return;}
  if(ev.target.matches('[data-customer-allocation-count]')){const item=s.items.find(x=>String(x.id)===String(ev.target.dataset.itemId));if(!item)return;const value=Math.max(0,Math.min(n(item.package_count),Math.floor(Number(ev.target.value)||0)));s.editAllocationDraft={...s.editAllocationDraft,[String(item.id)]:value};render();return;}
  if(ev.target.matches('[data-transfer-target]')){s.transferDraft.targetFarmId=ev.target.value;render();return;}
  if(ev.target.matches('[data-transfer-count]')){s.transferDraft.packages=Number(ev.target.value);render();return;}
  if(ev.target.matches('[data-allocation-farm]')){
   const id=ev.target.value,ids=s.allocationDraft.selectedFarmIds.filter(x=>String(x)!==String(id));
   if(ev.target.checked)ids.push(id);s.allocationDraft.selectedFarmIds=ids;
   for(const d of s.demands.filter(x=>x.valid&&(s.requestProductId===null||String(x.productId)===String(s.requestProductId)))){const eligible=ids.filter(id=>s.offers.some(o=>String(o.gazdinstvo_id)===String(id)&&String(o.product_id)===String(d.productId)&&String(o.variant_id)===String(d.variantId)&&o.is_active===true)&&!s.allocations.some(a=>String(a.gazdinstvo_id)===String(id)&&String(a.product_id)===String(d.productId)&&String(a.variant_id)===String(d.variantId)&&n(a.naruceno_pakovanja)>0));const kx=key(d.productId,d.variantId),remaining=Math.max(0,d.packages-allocated(d.productId,d.variantId));s.allocationDraft.quantities[kx]=distributeRemaining({total:remaining,eligibleFarmIds:eligible,quantities:s.allocationDraft.quantities[kx]||{},editedFarmId:null});}
   render();return;
  }
  if(ev.target.matches('[data-allocation-qty]')){
   const {product,variant,farmId}=ev.target.dataset,d=demand(product,variant),kx=key(product,variant),eligible=s.allocationDraft.selectedFarmIds.filter(id=>s.offers.some(o=>String(o.gazdinstvo_id)===String(id)&&String(o.product_id)===String(product)&&String(o.variant_id)===String(variant)&&o.is_active===true)&&!s.allocations.some(a=>String(a.gazdinstvo_id)===String(id)&&String(a.product_id)===String(product)&&String(a.variant_id)===String(variant)&&n(a.naruceno_pakovanja)>0)),remaining=Math.max(0,d.packages-allocated(product,variant)),q=s.allocationDraft.quantities[kx]||{};
   q[String(farmId)]=Math.max(0,Math.floor(Number(ev.target.value)||0));s.allocationDraft.quantities[kx]=distributeRemaining({total:remaining,eligibleFarmIds:eligible,quantities:q,editedFarmId:farmId});render();return;
  }
 });
 host.addEventListener('click',async ev=>{
  const b=ev.target.closest('[data-action],[data-tab],[data-stage],[data-view],[data-farm-filter],[data-farm-remaining]');if(!b)return;
  if(b.hasAttribute('data-farm-filter')){s.requestFarmFilter=b.dataset.farmFilter||null;render();return;}
  if(b.hasAttribute('data-farm-remaining')){s.requestFarmRemainingOnly=!s.requestFarmRemainingOnly;render();return;}
  if(b.dataset.stage){s.stage=b.dataset.stage;render();return;}
  if(b.dataset.view){s.view=b.dataset.view;render();return;}
  if(b.dataset.tab){s.tab=b.dataset.tab;render();return;}
  const a=b.dataset.action;
  if(a==='retry-load'){initialize();return;}
  if(a==='back')return onBack?.();
  if(a==='quick-request')return quickRequest({farmId:b.dataset.farmId,productId:b.dataset.productId,variantId:b.dataset.variantId});
  if(a==='open-request'){s.requestProductId=b.dataset.productId||null;s.requestVariantId=b.dataset.variantId||null;s.requestOpen=true;s.assignmentSaveMode=!!b.dataset.farmId;s.orderDraft=Object.fromEntries(s.items.filter(item=>s.requestProductId===null||String(item.product_id)===String(s.requestProductId)).map(item=>[String(item.id),n(item.package_count)]));s.allocationDraft={selectedFarmIds:[],quantities:{}};if(b.dataset.farmId){const farmId=String(b.dataset.farmId);s.allocationDraft.selectedFarmIds=[farmId];for(const d of s.demands.filter(x=>x.valid&&(s.requestProductId===null||String(x.productId)===String(s.requestProductId))&&(s.requestVariantId===null||String(x.variantId)===String(s.requestVariantId)))){const hasOffer=s.offers.some(o=>o.is_active===true&&String(o.gazdinstvo_id)===farmId&&String(o.product_id)===String(d.productId)&&String(o.variant_id)===String(d.variantId));const hasAllocation=s.allocations.some(a=>String(a.gazdinstvo_id)===farmId&&String(a.product_id)===String(d.productId)&&String(a.variant_id)===String(d.variantId)&&n(a.naruceno_pakovanja)>0);if(hasOffer&&!hasAllocation)s.allocationDraft.quantities[key(d.productId,d.variantId)]={[farmId]:Math.max(0,n(d.packages)-allocated(d.productId,d.variantId))};}}render();return;}
  if(a==='close-request'){s.requestOpen=false;s.requestProductId=null;s.requestVariantId=null;s.assignmentSaveMode=false;s.orderDraft={};render();return;}
  if(a==='customer-order-step'){const item=s.items.find(x=>String(x.id)===String(b.dataset.itemId));if(!item)return;const current=n(s.orderDraft[String(item.id)]??item.package_count),next=Math.max(0,Math.min(9999,current+Number(b.dataset.delta||0)));s.orderDraft={...s.orderDraft,[String(item.id)]:next};render();return;}
  if(a==='save-customer-orders'){if(s.busy)return;const rows=s.items.filter(item=>(s.requestProductId===null||String(item.product_id)===String(s.requestProductId))&&(s.requestVariantId===null||String(item.variant_id)===String(s.requestVariantId)));s.busy=true;render();try{const saved=await saveCustomerOrderQuantities({client,tourId,items:rows,draft:s.orderDraft});await load();s.orderDraft=Object.fromEntries(s.items.filter(item=>s.requestProductId===null||String(item.product_id)===String(s.requestProductId)).map(item=>[String(item.id),n(item.package_count)]));s.allocationDraft={selectedFarmIds:[],quantities:{}};setNote(saved.updated?'Измењено је '+f(saved.updated)+' поруџбина купаца. Укупна потреба је поново обрачуната; расподела газдинствима није аутоматски мењана.':'Нема нових измена поруџбина.');}catch(err){setNote('Поруџбине нису измењене: '+(err.message||String(err)),true);}finally{s.busy=false;render();}return;}
  if(a==='edit-allocation'){const row=s.allocations.find(x=>String(x.id)===String(b.dataset.id));if(!row)return;if(row.viber_status!=='not_sent'||n(row.potvrdjeno_pakovanja)>0||n(row.preuzeto_pakovanja)>0)return setNote('Ова додела више није у фази Захтев и не може се мењати овде.',true);const rows=s.items.filter(item=>key(item.product_id,item.variant_id)===key(row.product_id,row.variant_id)).sort((x,y)=>Number(x.id)-Number(y.id));const draft={};let used=0;for(const item of rows){const current=(item.farm_allocations||[]).filter(x=>String(x.gazdinstvo_id)===String(row.gazdinstvo_id)).reduce((sum,x)=>sum+n(x.broj_pakovanja),0);if(current>0){draft[String(item.id)]=current;used+=current;}}let remaining=Math.max(0,n(row.broj_pakovanja)-used);for(const item of rows){if(Object.prototype.hasOwnProperty.call(draft,String(item.id)))continue;const count=Math.min(remaining,n(item.package_count));draft[String(item.id)]=count;remaining-=count;}s.editAllocationId=String(row.id);s.editAllocationDraft=draft;render();return;}
  if(a==='close-allocation-edit'){s.editAllocationId=null;s.editAllocationDraft={};render();return;}
  if(a==='customer-allocation-step'){const item=s.items.find(x=>String(x.id)===String(b.dataset.itemId));if(!item)return;const current=n(s.editAllocationDraft[String(item.id)]),next=Math.max(0,Math.min(n(item.package_count),current+Number(b.dataset.delta||0)));s.editAllocationDraft={...s.editAllocationDraft,[String(item.id)]:next};render();return;}
  if(a==='save-allocation-edit'){if(s.busy)return;const row=s.allocations.find(x=>String(x.id)===String(s.editAllocationId));if(!row)return setNote('Додела више није доступна. Освежи податке.',true);const rows=s.items.filter(item=>key(item.product_id,item.variant_id)===key(row.product_id,row.variant_id));s.busy=true;render();try{const saved=await saveCustomerFarmAllocation({client,tourId,row,items:rows,draft:s.editAllocationDraft});await load();s.editAllocationId=null;s.editAllocationDraft={};setNote('Сачувано: '+f(saved.total)+' паковања додељено је газдинству по расподели купаца.');}catch(err){setNote('Расподела није сачувана: '+(err.message||String(err)),true);}finally{s.busy=false;render();}return;}
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
  if(a==='close-prepared-message'){s.preparedMessage='';s.preparedMessageFarmName='';render();return;}
   if(a==='copy-prepared-message'){
    const field=host.querySelector('[data-prepared-message]');if(!s.preparedMessage||!field)return;
    try{if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(s.preparedMessage);else{field.focus();field.select();if(!document.execCommand('copy'))throw new Error('Копирање није подржано.');}setNote('Порука за '+s.preparedMessageFarmName+' је копирана. Статус слања није промењен.');}
    catch(error){setNote('Копирање није успело. Означи текст у пољу и копирај га ручно.',true);}return;
   }
   if(a==='prepare-farm')return prepareFarmRequest(b.dataset.farmId);
  if(a==='mark-farm-sent')return markFarmSent(b.dataset.farmId);
  if(a==='save-field')return saveField(b.dataset.id);
  if(a==='mark-sent')return markSent(b.dataset.id);
  if(a==='save-multi-allocation'){const hasUnsavedOrderEdits=s.items.some(item=>(s.requestProductId===null||String(item.product_id)===String(s.requestProductId))&&(s.requestVariantId===null||String(item.variant_id)===String(s.requestVariantId))&&n(s.orderDraft[String(item.id)]??item.package_count)!==n(item.package_count));if(hasUnsavedOrderEdits)return setNote('Прво сачувај измене поруџбина купаца, па затим расподели нову количину газдинствима.',true);const cart=buildAllocationCart({s,productId:s.requestProductId,variantId:s.requestVariantId});if(!s.allocationDraft.selectedFarmIds.length)return setNote('Изабери најмање једно газдинство.',true);if(!cart.length)return setNote('Распореди бар једну количину производа.',true);for(const d of s.demands.filter(x=>x.valid&&(s.requestProductId===null||String(x.productId)===String(s.requestProductId)))){const sum=cart.filter(x=>key(x.productId,x.variantId)===key(d.productId,d.variantId)).reduce((a,x)=>a+x.count,0);if(sum>Math.max(0,d.packages-allocated(d.productId,d.variantId)))return setNote('Расподела премашује преосталу потребу.',true);}s.cart=cart;s.requestOpen=false;s.requestProductId=null;s.requestVariantId=null;if(s.assignmentSaveMode){s.assignmentSaveMode=false;const saved=await saveCart();if(saved)setNote('Додела је сачувана и поново учитана. Захтев није послат нити потврђен.');return;}return generateViber();}
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
 return{destroy(){s.disposed=true;loadAttempt++;s.analyticsHandle?.destroy();root.replaceChildren();}};
}
