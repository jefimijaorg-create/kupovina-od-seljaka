/*
 * NARUČI DOMAĆE — PROCUREMENT REQUEST ALLOCATION SHEET
 * Version: 1.3.3
 * Updated: 2026-11-20
 * Description: Shows a read-only customer order breakdown while keeping farm allocation quantities editable.
 * Scope: Existing ADMIN Workspace; existing Supabase schema only.
 */
const n=v=>Number.isFinite(Number(v))?Number(v):0;
const k=(p,v)=>String(p)+'::'+String(v);
export function eligibleFarmsForVariant({farmIds,offers,allocations,productId,variantId}){
 return farmIds.filter(id=>offers.some(o=>String(o.gazdinstvo_id)===String(id)&&String(o.product_id)===String(productId)&&String(o.variant_id)===String(variantId)&&o.is_active===true)&&!allocations.some(a=>String(a.gazdinstvo_id)===String(id)&&String(a.product_id)===String(productId)&&String(a.variant_id)===String(variantId)&&n(a.naruceno_pakovanja)>0));
}
export function distributeRemaining({total,eligibleFarmIds,quantities={},editedFarmId=null}){
 const ids=[...eligibleFarmIds],next={...quantities};let remaining=Math.max(0,Math.floor(n(total)));
 if(editedFarmId===null){ids.forEach((id,i)=>next[String(id)]=i===0?remaining:0);return next;}
 const at=ids.findIndex(id=>String(id)===String(editedFarmId));if(at<0)return next;
 for(let i=0;i<at;i++)remaining-=Math.max(0,Math.floor(n(next[String(ids[i])])));
 remaining=Math.max(0,remaining);next[String(editedFarmId)]=Math.max(0,Math.min(remaining,Math.floor(n(next[String(editedFarmId)]))));remaining-=next[String(editedFarmId)];
 for(let i=at+1;i<ids.length;i++)next[String(ids[i])]=i===at+1?remaining:0;
 return next;
}
export function buildAllocationCart({s,productId=null}){
 const cart=[];for(const d of s.demands.filter(x=>x.valid&&(productId===null||String(x.productId)===String(productId)))){const q=s.allocationDraft.quantities[k(d.productId,d.variantId)]||{};for(const farmId of s.allocationDraft.selectedFarmIds){const eligible=s.offers.some(o=>o.is_active===true&&String(o.gazdinstvo_id)===String(farmId)&&String(o.product_id)===String(d.productId)&&String(o.variant_id)===String(d.variantId))&&!s.allocations.some(a=>String(a.gazdinstvo_id)===String(farmId)&&String(a.product_id)===String(d.productId)&&String(a.variant_id)===String(d.variantId)&&n(a.naruceno_pakovanja)>0);if(!eligible)continue;const count=Math.max(0,Math.floor(n(q[String(farmId)])));if(count)cart.push({productId:d.productId,variantId:d.variantId,farmId,count});}}
 return cart;
}
const displayUnit=value=>({'kom':'ком','kom.':'ком','kg':'кг','g':'г','l':'л','ml':'мл'}[String(value||'').toLowerCase()]||String(value||''));
const massInGrams=(value,unit)=>{const u=String(unit||'').trim().toLowerCase().replace(/[.\s]/g,'');const size=n(value);if(['kg','кг','kilogram','kilograms'].includes(u))return size*1000;if(['g','гр','г','gram','grams'].includes(u))return size;return null;};
const formatMass=grams=>{const g=Math.round(grams*100)/100;const kg=g/1000;return (Number.isInteger(g)?String(g):g.toLocaleString('sr-RS',{maximumFractionDigits:2}))+' г ('+kg.toLocaleString('sr-RS',{maximumFractionDigits:2})+' кг)';};
const renderCustomerOrderList=(items,d,f,e)=>{
 const rows=items.filter(row=>String(row.product_id)===String(d.productId)&&String(row.variant_id)===String(d.variantId)).sort((a,b)=>String(a.customer_name||'').localeCompare(String(b.customer_name||''),'sr')||Number(a.id)-Number(b.id));
 if(!rows.length)return '<section class="ndp3-customer-orders ndp3-customer-orders-empty">Нема евидентираних купаца за ову амбалажу.</section>';
 const grams=massInGrams(d.packageSize,d.packageUnit);
 const entries=rows.map(row=>{
  const assigned=(row.farm_allocations||[]).reduce((sum,share)=>sum+Math.max(0,n(share.broj_pakovanja)),0);
  return {name:row.customer_name||'Купац није повезан',count:Math.max(0,n(row.package_count)-assigned),ordered:n(row.package_count)};
 }).filter(row=>row.count>0);
 const total=entries.reduce((sum,row)=>sum+row.count,0);
 return '<section class="ndp3-customer-orders"><div class="ndp3-customer-orders-head"><div><strong>Поруџбине купаца</strong><small>Преглед ко је наручио ову амбалажу</small></div><b>'+f(entries.length)+' купаца</b></div><div class="ndp3-customer-orders-list">'+(entries.length?entries.map(row=>'<div class="ndp3-customer-order"><div class="ndp3-customer-order-name"><strong>'+e(row.name)+'</strong><small>Извор: поруџбина купца</small></div><div class="ndp3-customer-order-qty"><b>${f(row.count)} паковање${row.count===1?'':'а'}</b><span>${e(grams===null?f(row.count)+' пак.':formatMass(grams*row.count))}</span></div></div>').join(''):'<div class="ndp3-customer-orders-saved">Све поруџбине су већ распоређене.</div>')+'</div><div class="ndp3-customer-orders-total"><span>Укупно преостало за доделу</span><b>'+f(total)+' паковања'+(grams===null?'':' · '+e(formatMass(grams*total)))+'</b></div></section>';
};
const renderCustomerOrderRemainder=(items,d,orderDraft,f,e)=>{
 const rows=items.filter(row=>String(row.product_id)===String(d.productId)&&String(row.variant_id)===String(d.variantId));
 const detailedTotal=rows.reduce((sum,row)=>sum+(row.farm_allocations||[]).reduce((part,allocation)=>part+Math.max(0,n(allocation.broj_pakovanja)),0),0);
 if(detailedTotal!==n(d.allocatedPackages))return '<div class="ndp3-note">Преостала количина је приказана збирно јер додела није у потпуности повезана са појединачним поруџбинама купаца.</div>';
 const remaining=rows.map(row=>({row,count:Math.max(0,n(orderDraft[String(row.id)]??row.package_count)-(row.farm_allocations||[]).reduce((sum,allocation)=>sum+Math.max(0,n(allocation.broj_pakovanja)),0))})).filter(item=>item.count>0);
 if(!remaining.length)return '<div class="ndp3-note">Нема преосталих паковања по појединачним поруџбинама купаца.</div>';
 return '<section class="ndp3-customer-orders"><div class="ndp3-customer-orders-head"><div><strong>Преостало по купцима</strong><small>Приказује се само количина која није додељена газдинствима</small></div><b>'+f(remaining.reduce((sum,item)=>sum+item.count,0))+' пак.</b></div><div class="ndp3-customer-orders-list">'+remaining.map(({row,count})=>'<div class="ndp3-customer-order"><div class="ndp3-customer-order-name"><strong>'+e(row.customer_name||'Купац није повезан')+'</strong><span>Поруџбина #'+e(row.porudzbina_id||'—')+'</span></div><b>'+f(count)+' паковања преостало</b></div>').join('')+'</div></section>';
};
export function renderAllocationSheet({s,e,f,productId=null,orderDraft={},writable=true,busy=false}){
 const selected=s.allocationDraft.selectedFarmIds;
 const itemsFor=d=>s.items.filter(item=>String(item.product_id)===String(d.productId)&&String(item.variant_id)===String(d.variantId));
 const allocatedCount=d=>s.allocations.filter(row=>String(row.product_id)===String(d.productId)&&String(row.variant_id)===String(d.variantId)).reduce((sum,row)=>sum+Math.max(0,n(row.broj_pakovanja)),0);
 const orderedCount=d=>itemsFor(d).reduce((sum,item)=>sum+Math.max(0,n(orderDraft[String(item.id)]??item.package_count)),0);
 const pendingCount=d=>Math.max(0,orderedCount(d)-allocatedCount(d));
 const hasSelectedFarmOffer=d=>!selected.length||selected.some(id=>offersFor(d).some(o=>String(o.gazdinstvo_id)===String(id)));
 const offersFor=d=>s.offers.filter(o=>o.is_active===true&&String(o.product_id)===String(d.productId)&&String(o.variant_id)===String(d.variantId));
 const checks=s.farms.filter(ff=>s.offers.some(o=>String(o.gazdinstvo_id)===String(ff.id)&&o.is_active===true&&(productId===null||String(o.product_id)===String(productId)))).map(ff=>'<label class="ndp3-farm-check"><input type="checkbox" data-allocation-farm value="'+e(ff.id)+'" '+(selected.some(id=>String(id)===String(ff.id))?'checked':'')+'><span>'+e(ff.name)+'</span></label>').join('');
 const cards=s.demands.filter(d=>d.valid&&(productId===null||String(d.productId)===String(productId))&&pendingCount(d)>0&&offersFor(d).length>0&&hasSelectedFarmOffer(d)).map(d=>{
  const total=pendingCount(d),eligible=selected.filter(id=>s.offers.some(o=>String(o.gazdinstvo_id)===String(id)&&String(o.product_id)===String(d.productId)&&String(o.variant_id)===String(d.variantId)&&o.is_active===true)),q=s.allocationDraft.quantities[k(d.productId,d.variantId)]||{},sum=eligible.reduce((a,id)=>a+n(q[String(id)]),0),p=s.products.find(x=>String(x.id)===String(d.productId)),v=s.variants.find(x=>String(x.id)===String(d.variantId)),pendingDemand={...d,packages:total};
  return '<article class="ndp3-product ndp3-allocation-product"><div class="ndp3-row"><strong>'+e(p?.name||'Производ')+' · '+e(v?.name||v?.size_label||'Паковање')+'</strong><span class="ndp3-chip"><b>'+f(total)+' паковања</b> за доделу</span></div><div class="ndp3-meta ndp3-allocation-quantity">Још није додељено: <strong>'+f(total)+' паковања</strong><small>'+f(total*n(d.packageSize))+' '+e(displayUnit(d.packageUnit))+' укупно · '+f(d.packageSize)+' '+e(displayUnit(d.packageUnit))+' по паковању</small></div>'+renderCustomerOrderList(s.items,pendingDemand,f,e)+(eligible.length?eligible.map(id=>'<label class="ndp3-allocation-field"><span>'+e(s.farms.find(ff=>String(ff.id)===String(id))?.name||'Газдинство')+'</span><input type="number" inputmode="numeric" pattern="[0-9]*" min="0" max="'+f(total)+'" step="1" value="'+f(q[String(id)]||0)+'" data-allocation-qty data-product="'+e(d.productId)+'" data-variant="'+e(d.variantId)+'" data-farm-id="'+e(id)+'"></label>').join(''):'<div class="ndp3-note">Ниједно изабрано газдинство нема активну понуду за ову амбалажу.</div>')+'<div class="ndp3-allocation-total">Предвиђено за доделу: <b>'+f(sum)+' од '+f(total)+' паковања</b><span class="ndp3-allocation-unassigned">Преостало: <b>'+f(Math.max(0,total-sum))+' паковања</b></span></div></article>';
 }).join('');
 return '<div class="ndp3-allocation-sheet"><p>Приказане су само ставке поруџбина које још нису додељене ниједном газдинству. Ставке са постојећом доделом не приказују се овде, без обзира на то да ли чекају потврду, преузимање или испоруку.</p><div class="ndp3-farm-checks">'+(checks||'<div class="ndp3-empty">Нема активних понуда газдинстава.</div>')+'</div><h3>Ставке које чекају доделу</h3>'+(cards||'<div class="ndp3-empty">Нема ставки које чекају доделу газдинству.</div>')+'</div>';
}
