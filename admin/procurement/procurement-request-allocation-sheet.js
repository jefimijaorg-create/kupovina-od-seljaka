/*
 * NARUČI DOMAĆE — PROCUREMENT REQUEST ALLOCATION SHEET
 * Version: 1.2.5
 * Updated: 2026-11-19
 * Description: Filters tour-demand products by selected farms' active offers and excludes ineligible farms from the saved allocation cart.
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
const massInGrams=(value,unit)=>{const u=String(unit||'').trim().toLowerCase().replace(/[.\\s]/g,'');const size=n(value);if(['kg','кг','kilogram','kilograms'].includes(u))return size*1000;if(['g','гр','г','gram','grams'].includes(u))return size;return null;};
const formatMass=grams=>{const g=Math.round(grams*100)/100;const kg=g/1000;return (Number.isInteger(g)?String(g):g.toLocaleString('sr-RS',{maximumFractionDigits:2}))+' г ('+kg.toLocaleString('sr-RS',{maximumFractionDigits:2})+' кг)';};
const customerBreakdown=(items,d)=>{const byName=new Map();for(const row of items){if(String(row.product_id)!==String(d.productId)||String(row.variant_id)!==String(d.variantId)||!String(row.customer_name||'').trim())continue;const count=Math.max(0,n(row.package_count));const name=String(row.customer_name).trim();const entry=byName.get(name)||{name,packages:0};entry.packages+=count;byName.set(name,entry);}return [...byName.values()].sort((a,b)=>a.name.localeCompare(b.name,'sr'));};
const renderCustomerBreakdown=(items,d,f,e)=>{const buyers=customerBreakdown(items,d);if(!buyers.length)return '<section class="ndp3-customer-orders ndp3-customer-orders-empty">Нема евидентираних купаца за ову амбалажу.</section>';const grams=massInGrams(d.packageSize,d.packageUnit);return '<section class="ndp3-customer-orders"><div class="ndp3-customer-orders-head"><strong>Купци који су наручили</strong><b>'+f(buyers.length)+' купаца</b></div>'+buyers.map(b=>'<div class="ndp3-customer-order"><div class="ndp3-customer-order-name"><strong>'+e(b.name)+'</strong><small>Извор: поруџбина купца</small></div><div class="ndp3-customer-order-qty"><b>'+f(b.packages)+' '+(b.packages===1?'паковање':'паковања')+'</b>'+(grams===null?'':'<span>'+e(formatMass(grams*b.packages))+'</span>')+'</div></div>').join('')+'</section>';};
export function renderAllocationSheet({s,e,f,productId=null}){
 const selected=s.allocationDraft.selectedFarmIds;
 const hasSelectedFarmOffer=d=>!selected.length||selected.some(id=>offersFor(d).some(o=>String(o.gazdinstvo_id)===String(id)));
 const offersFor=d=>s.offers.filter(o=>o.is_active===true&&String(o.product_id)===String(d.productId)&&String(o.variant_id)===String(d.variantId));
 const checks=s.farms.filter(ff=>s.offers.some(o=>String(o.gazdinstvo_id)===String(ff.id)&&o.is_active===true&&(productId===null||String(o.product_id)===String(productId)))).map(ff=>'<label class="ndp3-farm-check"><input type="checkbox" data-allocation-farm value="'+e(ff.id)+'" '+(selected.some(id=>String(id)===String(ff.id))?'checked':'')+'><span>'+e(ff.name)+'</span></label>').join('');
 const cards=s.demands.filter(d=>d.valid&&(productId===null||String(d.productId)===String(productId))&&hasSelectedFarmOffer(d)&&d.packages>s.allocations.filter(a=>String(a.product_id)===String(d.productId)&&String(a.variant_id)===String(d.variantId)).reduce((sum,a)=>sum+n(a.broj_pakovanja),0)).map(d=>{
  const used=s.allocations.filter(a=>String(a.product_id)===String(d.productId)&&String(a.variant_id)===String(d.variantId)).reduce((sum,a)=>sum+n(a.broj_pakovanja),0),total=Math.max(0,d.packages-used),eligible=selected.filter(id=>s.offers.some(o=>String(o.gazdinstvo_id)===String(id)&&String(o.product_id)===String(d.productId)&&String(o.variant_id)===String(d.variantId)&&o.is_active===true)&&!s.allocations.some(a=>String(a.gazdinstvo_id)===String(id)&&String(a.product_id)===String(d.productId)&&String(a.variant_id)===String(d.variantId)&&n(a.naruceno_pakovanja)>0)),q=s.allocationDraft.quantities[k(d.productId,d.variantId)]||{},sum=eligible.reduce((a,id)=>a+n(q[String(id)]),0),p=s.products.find(x=>String(x.id)===String(d.productId)),v=s.variants.find(x=>String(x.id)===String(d.variantId));
  return '<article class="ndp3-product ndp3-allocation-product"><div class="ndp3-row"><strong>'+e(p?.name||'Производ')+' · '+e(v?.name||v?.size_label||'Паковање')+'</strong><span class="ndp3-chip"><b>'+f(d.packages)+' паковања</b> потребно</span></div><div class="ndp3-meta ndp3-allocation-quantity">Преостало: <strong>'+f(total)+' паковања</strong><small>'+f(total*n(d.packageSize))+' '+e(displayUnit(d.packageUnit))+' укупно · '+f(d.packageSize)+' '+e(displayUnit(d.packageUnit))+' по паковању</small></div>'+renderCustomerBreakdown(s.items,d,f,e)+(eligible.length?eligible.map(id=>'<label class="ndp3-allocation-field"><span>'+e(s.farms.find(ff=>String(ff.id)===String(id))?.name||'Газдинство')+'</span><input type="number" inputmode="numeric" pattern="[0-9]*" min="0" max="'+f(total)+'" step="1" value="'+f(q[String(id)]||0)+'" data-allocation-qty data-product="'+e(d.productId)+'" data-variant="'+e(d.variantId)+'" data-farm-id="'+e(id)+'"></label>').join(''):'<div class="ndp3-note">Ниједно изабрано газдинство нема активну понуду за ову амбалажу или већ има доделу.</div>')+'<div class="ndp3-allocation-total">Распоређено: <b>'+f(sum)+' од '+f(total)+' паковања</b><span class="ndp3-allocation-unassigned">Нераспоређено: <b>'+f(Math.max(0,total-sum))+' паковања</b></span></div></article>';
 }).join('');
 return '<div class="ndp3-allocation-sheet"><p>Изабери једно или више газдинстава за целу туру; сваки производ ће приказати само газдинства са активном понудом за одговарајућу амбалажу. Све амбалаже производа приказане су испод. Преостала количина се аутоматски додељује првом изабраном газдинству; изменом количине остатак прелази на следеће.</p><div class="ndp3-farm-checks">'+(checks||'<div class="ndp3-empty">Нема активних понуда газдинстава.</div>')+'</div><h3>Расподела производа и амбалаже</h3>'+(cards||'<div class="ndp3-empty">Нема преосталих количина за расподелу.</div>')+'</div>';
}
