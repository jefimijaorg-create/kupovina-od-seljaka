/*
 * NARUČI DOMAĆE — PROCUREMENT ALLOCATION ACTIONS
 * Version: 1.1.0
 * Updated: 2026-11-19
 * Description: Validates and persists procurement allocation carts and safely edits unsent allocation quantities.
 * Scope: Existing ADMIN Workspace; existing Supabase tables and RLS only. No schema changes.
 */
const n=value=>Number.isFinite(Number(value))?Number(value):0;
const key=(productId,variantId)=>String(productId)+'::'+String(variantId);

export async function saveProcurementAllocationCart({client,tourId,cart,demands,offers,allocations,validateAllocationCount}={}){
 if(!client||!tourId||!Array.isArray(cart)||!cart.length)throw new Error('Нема ставки за чување расподеле.');
 if(typeof validateAllocationCount!=='function')throw new Error('Недостаје провера количине расподеле.');
 const demandFor=(productId,variantId)=>demands.find(row=>key(row.productId,row.variantId)===key(productId,variantId));
 const allocationFor=(productId,variantId,farmId)=>allocations.find(row=>key(row.product_id,row.variant_id)===key(productId,variantId)&&String(row.gazdinstvo_id)===String(farmId));
 const offerFor=(productId,variantId,farmId)=>offers.find(row=>key(row.product_id,row.variant_id)===key(productId,variantId)&&String(row.gazdinstvo_id)===String(farmId)&&row.is_active===true);
 const payloads=[],groups=new Map();
 for(const item of cart){
  const demand=demandFor(item.productId,item.variantId),offer=offerFor(item.productId,item.variantId,item.farmId),old=allocationFor(item.productId,item.variantId,item.farmId),count=Number(item.count);
  if(!demand?.valid||!offer)throw new Error('Понуда или подаци о паковању нису важећи. Освежи податке.');
  if(!Number.isInteger(count)||count<1)throw new Error('Количина мора бити позитиван цео број паковања.');
  if(old&&(old.viber_status==='sent'||old.viber_status==='replied'||n(old.potvrdjeno_pakovanja)>0||n(old.preuzeto_pakovanja)>0))throw new Error('Ова ставка је већ послата или је у каснијој фази и не може се поново захтевати.');
  const requested=n(old?.naruceno_pakovanja)+count,k=key(item.productId,item.variantId);
  if(!groups.has(k))groups.set(k,{demand:demand.packages,added:0,replace:0,productId:item.productId,variantId:item.variantId});
  const group=groups.get(k);group.added+=count;group.replace+=n(old?.broj_pakovanja);
  payloads.push({tura_id:Number(tourId),product_id:item.productId,variant_id:item.variantId,gazdinstvo_id:Number(item.farmId),broj_pakovanja:requested,naruceno_pakovanja:requested,nabavna_cena:n(offer.purchase_price),naruceno:false,potvrdjeno_pakovanja:0,preuzeto_pakovanja:0,viber_status:'not_sent',updated_at:new Date().toISOString()});
 }
 for(const group of groups.values()){
  const already=Math.max(0,allocations.filter(row=>key(row.product_id,row.variant_id)===key(group.productId,group.variantId)).reduce((sum,row)=>sum+n(row.broj_pakovanja),0)-group.replace);
  const check=validateAllocationCount({requested:group.added,alreadyAllocated:already,demand:group.demand});
  if(!check.valid)throw new Error('Збир расподеле премашује преосталу потребу за једном од амбалажа. Освежи податке и провери расподелу.');
 }
 const appliedUpdates=[],insertedIds=[],savedRows=[];
 try{
  for(const payload of payloads){
   const old=allocationFor(payload.product_id,payload.variant_id,payload.gazdinstvo_id);
   if(old){
    const patch={broj_pakovanja:payload.broj_pakovanja,naruceno_pakovanja:payload.naruceno_pakovanja,nabavna_cena:payload.nabavna_cena,naruceno:false,potvrdjeno_pakovanja:0,preuzeto_pakovanja:0,viber_status:'not_sent',updated_at:payload.updated_at};
    const result=await client.from('tura_nabavka_dodele').update(patch).eq('id',old.id).select('id,product_id,variant_id,gazdinstvo_id,broj_pakovanja,naruceno_pakovanja').maybeSingle();
    if(result.error)throw new Error(result.error.message);
    if(!result.data)throw new Error('Постојећа евиденција није ажурирана.');
    appliedUpdates.push({old});savedRows.push(result.data);
   }else{
    const result=await client.from('tura_nabavka_dodele').insert(payload).select('id,product_id,variant_id,gazdinstvo_id,broj_pakovanja,naruceno_pakovanja').single();
    if(result.error)throw new Error(result.error.message);
    if(!result.data)throw new Error('База није потврдила упис нове ставке.');
    insertedIds.push(result.data.id);savedRows.push(result.data);
   }
  }
  if(savedRows.length!==payloads.length)throw new Error('База није потврдила све ставке групног захтева.');
  for(const payload of payloads){
   const row=savedRows.find(item=>String(item.product_id)===String(payload.product_id)&&String(item.variant_id)===String(payload.variant_id)&&String(item.gazdinstvo_id)===String(payload.gazdinstvo_id));
   if(!row||n(row.broj_pakovanja)!==n(payload.broj_pakovanja)||n(row.naruceno_pakovanja)!==n(payload.naruceno_pakovanja))throw new Error('База није потврдила упис расподеле за свако газдинство.');
  }
  return {savedRows};
 }catch(writeError){
  const rollbackErrors=[];
  for(const id of insertedIds){const result=await client.from('tura_nabavka_dodele').delete().eq('id',id);if(result.error)rollbackErrors.push(result.error.message);}
  for(const applied of [...appliedUpdates].reverse()){
   const old=applied.old,restore={broj_pakovanja:old.broj_pakovanja,naruceno_pakovanja:old.naruceno_pakovanja,nabavna_cena:old.nabavna_cena,naruceno:old.naruceno,potvrdjeno_pakovanja:old.potvrdjeno_pakovanja,preuzeto_pakovanja:old.preuzeto_pakovanja,viber_status:old.viber_status,updated_at:old.updated_at};
   const result=await client.from('tura_nabavka_dodele').update(restore).eq('id',old.id);if(result.error)rollbackErrors.push(result.error.message);
  }
  if(rollbackErrors.length)throw new Error((writeError.message||String(writeError))+' Аутоматско враћање није у потпуности успело: '+rollbackErrors.join('; '));
  throw writeError;
 }
}

export async function updateUnsentProcurementAllocation({client,row,packages,demand,offers,allocations}={}){
 if(!client||!row||!demand?.valid)throw new Error('Недостају подаци за измену доделе.');
 const count=Number(packages);
 if(!Number.isInteger(count)||count<1)throw new Error('Количина мора бити позитиван цео број паковања.');
 if(row.viber_status!=='not_sent'||n(row.potvrdjeno_pakovanja)>0||n(row.preuzeto_pakovanja)>0)throw new Error('Послату, потврђену или преузету доделу није могуће мењати у фази Захтев.');
 const activeOffer=offers.some(o=>String(o.gazdinstvo_id)===String(row.gazdinstvo_id)&&String(o.product_id)===String(row.product_id)&&String(o.variant_id)===String(row.variant_id)&&o.is_active===true);
 if(!activeOffer)throw new Error('Газдинство нема активну понуду за ову амбалажу.');
 const other=allocations.filter(x=>String(x.id)!==String(row.id)&&key(x.product_id,x.variant_id)===key(row.product_id,row.variant_id)).reduce((sum,x)=>sum+n(x.broj_pakovanja),0);
 if(other+count>n(demand.packages))throw new Error('Количина премашује преосталу потребу. Максимум за ово газдинство је '+Math.max(0,n(demand.packages)-other)+' паковања.');
 const result=await client.from('tura_nabavka_dodele').update({broj_pakovanja:count,naruceno_pakovanja:count,updated_at:new Date().toISOString()}).eq('id',row.id).eq('viber_status','not_sent').eq('potvrdjeno_pakovanja',0).eq('preuzeto_pakovanja',0).select('id,product_id,variant_id,gazdinstvo_id,broj_pakovanja,naruceno_pakovanja,viber_status,potvrdjeno_pakovanja,preuzeto_pakovanja').maybeSingle();
 if(result.error)throw new Error(result.error.message);
 if(!result.data)throw new Error('Додела није измењена. Можда је у међувремену послата или потврђена. Освежи податке.');
 if(n(result.data.broj_pakovanja)!==count||n(result.data.naruceno_pakovanja)!==count)throw new Error('База није потврдила нову количину.');
 return result.data;
}
