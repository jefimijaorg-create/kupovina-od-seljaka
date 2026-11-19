/*
 * NARUČI DOMAĆE — PROCUREMENT REQUEST ALLOCATION SHEET
 * Version: 1.1.0
 * Updated: 2026-11-19
 * Description: Refines compact allocation rows, package-count hierarchy and numeric keypad inputs. No database access.
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
export function buildAllocationCart({s}){
 const cart=[];for(const d of s.demands.filter(x=>x.valid)){const q=s.allocationDraft.quantities[k(d.productId,d.variantId)]||{};for(const farmId of s.allocationDraft.selectedFarmIds){const count=Math.max(0,Math.floor(n(q[String(farmId)])));if(count)cart.push({productId:d.productId,variantId:d.variantId,farmId,count});}}
 return cart;
}
export function renderAllocationSheet({s,e,f}){
 const selected=s.allocationDraft.selectedFarmIds;
 const checks=s.farms.filter(ff=>s.offers.some(o=>String(o.gazdinstvo_id)===String(ff.id)&&o.is_active===true)).map(ff=>'<label class="ndp3-farm-check"><input type="checkbox" data-allocation-farm value="'+e(ff.id)+'" '+(selected.some(id=>String(id)===String(ff.id))?'checked':'')+'><span>'+e(ff.name)+'</span></label>').join('');
 const cards=s.demands.filter(d=>d.valid&&d.packages>s.allocations.filter(a=>String(a.product_id)===String(d.productId)&&String(a.variant_id)===String(d.variantId)).reduce((sum,a)=>sum+n(a.broj_pakovanja),0)).map(d=>{
  const used=s.allocations.filter(a=>String(a.product_id)===String(d.productId)&&String(a.variant_id)===String(d.variantId)).reduce((sum,a)=>sum+n(a.broj_pakovanja),0),total=Math.max(0,d.packages-used),eligible=selected.filter(id=>s.offers.some(o=>String(o.gazdinstvo_id)===String(id)&&String(o.product_id)===String(d.productId)&&String(o.variant_id)===String(d.variantId)&&o.is_active===true)&&!s.allocations.some(a=>String(a.gazdinstvo_id)===String(id)&&String(a.product_id)===String(d.productId)&&String(a.variant_id)===String(d.variantId)&&n(a.naruceno_pakovanja)>0)),q=s.allocationDraft.quantities[k(d.productId,d.variantId)]||{},sum=eligible.reduce((a,id)=>a+n(q[String(id)]),0),p=s.products.find(x=>String(x.id)===String(d.productId)),v=s.variants.find(x=>String(x.id)===String(d.variantId));
  return '<article class="ndp3-product ndp3-allocation-product"><div class="ndp3-row"><strong>'+e(p?.name||'Производ')+' · '+e(v?.name||v?.size_label||'Паковање')+'</strong><span class="ndp3-chip"><b>'+f(d.packages)+' паковања</b> потребно</span></div><div class="ndp3-meta ndp3-allocation-quantity">Преостало: <strong>'+f(total)+' паковања</strong><small>'+f(total*n(d.packageSize))+' '+e(d.packageUnit)+' укупно · '+f(d.packageSize)+' '+e(d.packageUnit)+' по паковању</small></div>'+(eligible.length?eligible.map(id=>'<label class="ndp3-allocation-field"><span>'+e(s.farms.find(ff=>String(ff.id)===String(id))?.name||'Газдинство')+'</span><input type="number" inputmode="numeric" pattern="[0-9]*" min="0" max="'+f(total)+'" step="1" value="'+f(q[String(id)]||0)+'" data-allocation-qty data-product="'+e(d.productId)+'" data-variant="'+e(d.variantId)+'" data-farm-id="'+e(id)+'"></label>').join(''):'<div class="ndp3-note">Ниједно изабрано газдинство нема активну понуду за ову амбалажу или већ има доделу.</div>')+'<div class="ndp3-allocation-total">Распоређено: <b>'+f(sum)+' од '+f(total)+' паковања</b> · Нераспоређено: <b>'+f(Math.max(0,total-sum))+' паковања</b></div></article>';
 }).join('');
 return '<div class="ndp3-allocation-sheet"><p>Изабери једно или више газдинстава. Преостала количина се аутоматски додељује првом изабраном газдинству; изменом количине остатак прелази на следеће.</p><div class="ndp3-farm-checks">'+(checks||'<div class="ndp3-empty">Нема активних понуда газдинстава.</div>')+'</div><h3>Расподела производа и амбалаже</h3>'+(cards||'<div class="ndp3-empty">Нема преосталих количина за расподелу.</div>')+'</div>';
}
