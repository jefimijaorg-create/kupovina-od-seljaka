/*
 * NARUČI DOMAĆE — PROCUREMENT REQUEST ALLOCATION SHEET
 * Version: 1.2.7
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
const massInGrams=(value,unit)=>{const u=String(unit||'').trim().toLowerCase().replace(/[.\s]/g,'');const size=n(value);if(['kg','кг','kilogram','kilograms'].includes(u))return size*1000;if(['g','гр','г','gram','grams'].includes(u))return size;return null;};
const formatMass=grams=>{const g=Math.round(grams*100)/100;const kg=g/1000;return (Number.isInteger(g)?String(g):g.toLocaleString('sr-RS',{maximumFractionDigits:2}))+' г ('+kg.toLocaleString('sr-RS',{maximumFractionDigits:2})+' кг)';};
const renderCustomerOrderEditor=(items,d,f,e,orderDraft={},writable=true,busy=false)=>{
 const rows=items.filter(row=>String(row.product_id)===String(d.productId)&&String(row.variant_id)===String(d.variantId)).sort((a,b)=>String(a.customer_name||'').localeCompare(String(b.customer_name||''),'sr')||Number(a.id)-Number(b.id));
 if(!rows.length)return '<section class="ndp3-customer-orders ndp3-customer-orders-empty">Нема евидентираних купаца за ову амбалажу.</section>';
 const grams=massInGrams(d.packageSize,d.packageUnit);
 const total=rows.reduce((sum,row)=>sum+Math.max(0,n(orderDraft[String(row.id)]??row.package_count)),0);
 const buyerCount=new Set(rows.map(row=>String(row.customer_id??row.id))).size;
 const changed=rows.some(row=>Math.max(0,n(orderDraft[String(row.id)]??row.package_count))!==n(row.package_count));
 return '<section class="ndp3-customer-orders"><div class="ndp3-customer-orders-head"><div><strong>Поруџбине купаца</strong><small>Измени број паковања за сваког купца</small></div><b>'+f(buyerCount)+' купаца</b></div><div class="ndp3-customer-orders-list">'+rows.map(row=>{
  const count=Math.max(0,n(orderDraft[String(row.id)]??row.package_count));
  return '<div class="ndp3-customer-order ndp3-customer-order-edit"><div class="ndp3-customer-order-name"><strong>'+e(row.customer_name||'Купац није повезан')+'</strong><span>Поруџбина #'+e(row.porudzbina_id||'—')+'</span><small>Раније наручено: '+f(row.package_count)+' паковања</small>'+(grams===null?'':'<small class="ndp3-customer-order-mass">'+e(formatMass(grams*count))+' укупно</small>')+'</div><div class="ndp3-customer-order-edit-field"><label>Нова количина</label><div class="ndp3-customer-order-controls"><button type="button" data-action="customer-order-step" data-item-id="'+e(row.id)+'" data-delta="-1" '+(!writable||busy||count<=0?'disabled':'')+' aria-label="Смањи наручену количину">−</button><input type="number" inputmode="numeric" pattern="[0-9]*" min="0" max="9999" step="1" data-customer-order-count data-item-id="'+e(row.id)+'" value="'+f(count)+'" '+(!writable||busy?'disabled':'')+'><button type="button" data-action="customer-order-step" data-item-id="'+e(row.id)+'" data-delta="1" '+(!writable||busy||count>=9999?'disabled':'')+' aria-label="Повећај наручену количину">+</button></div><small>паковања</small></div></div>';
 }).join('')+'</div><div class="ndp3-customer-orders-total"><span>Укупно за ову амбалажу</span><b>'+f(total)+' паковања'+(grams===null?'':' · '+e(formatMass(grams*total)))+'</b></div>'+(changed?'<button type="button" class="ndp3-btn primary ndp3-customer-orders-save" data-action="save-customer-orders" '+(!writable||busy?'disabled':'')+'>'+(busy?'Чувам…':'Сачувај измене поруџбина')+'</button>':'<div class="ndp3-customer-orders-saved">Количине поруџбина су сачуване.</div>')+'<small class="ndp3-customer-orders-help">Измена мења поруџбину купца. Расподела газдинствима остаје одвојена.</small></section>';
};
export function renderAllocationSheet({s,e,f,productId=null,orderDraft={},writable=true,busy=false}){
 const selected=s.allocationDraft.selectedFarmIds;
 const hasSelectedFarmOffer=d=>!selected.length||selected.some(id=>offersFor(d).some(o=>String(o.gazdinstvo_id)===String(id)));
 const offersFor=d=>s.offers.filter(o=>o.is_active===true&&String(o.product_id)===String(d.productId)&&String(o.variant_id)===String(d.variantId));
 const checks=s.farms.filter(ff=>s.offers.some(o=>String(o.gazdinstvo_id)===String(ff.id)&&o.is_active===true&&(productId===null||String(o.product_id)===String(productId)))).map(ff=>'<label class="ndp3-farm-check"><input type="checkbox" data-allocation-farm value="'+e(ff.id)+'" '+(selected.some(id=>String(id)===String(ff.id))?'checked':'')+'><span>'+e(ff.name)+'</span></label>').join('');
 const cards=s.demands.filter(d=>d.valid&&(productId===null||String(d.productId)===String(productId))).map(d=>{
  const used=s.allocations.filter(a=>String(a.product_id)===String(d.productId)&&String(a.variant_id)===String(d.variantId)).reduce((sum,a)=>sum+n(a.broj_pakovanja),0),draftDemand=s.items.filter(item=>String(item.product_id)===String(d.productId)&&String(item.variant_id)===String(d.variantId)).reduce((sum,item)=>sum+Math.max(0,n(orderDraft[String(item.id)]??item.package_count)),0),total=Math.max(0,draftDemand-used),eligible=selected.filter(id=>s.offers.some(o=>String(o.gazdinstvo_id)===String(id)&&String(o.product_id)===String(d.productId)&&String(o.variant_id)===String(d.variantId)&&o.is_active===true)&&!s.allocations.some(a=>String(a.gazdinstvo_id)===String(id)&&String(a.product_id)===String(d.productId)&&String(a.variant_id)===String(d.variantId)&&n(a.naruceno_pakovanja)>0)),q=s.allocationDraft.quantities[k(d.productId,d.variantId)]||{},sum=eligible.reduce((a,id)=>a+n(q[String(id)]),0),p=s.products.find(x=>String(x.id)===String(d.productId)),v=s.variants.find(x=>String(x.id)===String(d.variantId));
  return '<article class="ndp3-product ndp3-allocation-product"><div class="ndp3-row"><strong>'+e(p?.name||'Производ')+' · '+e(v?.name||v?.size_label||'Паковање')+'</strong><span class="ndp3-chip"><b>'+f(d.packages)+' паковања</b> потребно</span></div><div class="ndp3-meta ndp3-allocation-quantity">Преостало: <strong>'+f(total)+' паковања</strong><small>'+f(total*n(d.packageSize))+' '+e(displayUnit(d.packageUnit))+' укупно · '+f(d.packageSize)+' '+e(displayUnit(d.packageUnit))+' по паковању</small></div>'+renderCustomerOrderEditor(s.items,d,f,e,orderDraft,writable,busy)+(eligible.length?eligible.map(id=>'<label class="ndp3-allocation-field"><span>'+e(s.farms.find(ff=>String(ff.id)===String(id))?.name||'Газдинство')+'</span><input type="number" inputmode="numeric" pattern="[0-9]*" min="0" max="'+f(total)+'" step="1" value="'+f(q[String(id)]||0)+'" data-allocation-qty data-product="'+e(d.productId)+'" data-variant="'+e(d.variantId)+'" data-farm-id="'+e(id)+'"></label>').join(''):'<div class="ndp3-note">Ниједно изабрано газдинство нема активну понуду за ову амбалажу или већ има доделу.</div>')+'<div class="ndp3-allocation-total">Распоређено: <b>'+f(sum)+' од '+f(total)+' паковања</b><span class="ndp3-allocation-unassigned">Нераспоређено: <b>'+f(Math.max(0,total-sum))+' паковања</b></span></div></article>';
 }).join('');
 return '<div class="ndp3-allocation-sheet"><p>Изабери једно или више газдинстава за целу туру; сваки производ ће приказати само газдинства са активном понудом за одговарајућу амбалажу. Све амбалаже производа приказане су испод. Преостала количина се аутоматски додељује првом изабраном газдинству; изменом количине остатак прелази на следеће.</p><div class="ndp3-farm-checks">'+(checks||'<div class="ndp3-empty">Нема активних понуда газдинстава.</div>')+'</div><h3>Расподела производа и амбалаже</h3>'+(cards||'<div class="ndp3-empty">Нема преосталих количина за расподелу.</div>')+'</div>';
}
