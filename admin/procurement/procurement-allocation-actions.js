/*
 * NARUČI DOMAĆE — PROCUREMENT ALLOCATION ACTIONS
 * Version: 1.1.3
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


export async function saveCustomerFarmAllocation({client,tourId,row,items,draft}={}) {
 if(!client||!tourId||!row||!Array.isArray(items)||!items.length)throw new Error('Недостају подаци за расподелу по купцима.');
 const tourResult=await client.from('ture').select('status').eq('id',tourId).maybeSingle();
 if(tourResult.error)throw new Error(tourResult.error.message);
 if(tourResult.data?.status!=='processing')throw new Error('Измене су дозвољене само на тури у статусу обраде.');
 const currentResult=await client.from('tura_nabavka_dodele').select('id,tura_id,product_id,variant_id,gazdinstvo_id,broj_pakovanja,naruceno_pakovanja,potvrdjeno_pakovanja,preuzeto_pakovanja,viber_status').eq('id',row.id).maybeSingle();
 if(currentResult.error)throw new Error(currentResult.error.message);
 const current=currentResult.data;
 if(!current||String(current.tura_id)!==String(tourId)||current.viber_status!=='not_sent'||n(current.potvrdjeno_pakovanja)>0||n(current.preuzeto_pakovanja)>0)throw new Error('Ово требовање је већ послато или је прешло у каснију фазу. Освежи податке.');
 const itemIds=items.map(item=>item.id);
 const freshItemsResult=await client.from('stavke_porudzbine').select('id,package_count,product_id,variant_id,tura_id').in('id',itemIds).eq('tura_id',tourId);
 if(freshItemsResult.error)throw new Error(freshItemsResult.error.message);
 const freshItems=freshItemsResult.data||[];
 if(freshItems.length!==itemIds.length||freshItems.some(item=>String(item.product_id)!==String(current.product_id)||String(item.variant_id)!==String(current.variant_id)))throw new Error('Ставке поруџбина више не одговарају изабраном производу и амбалажи.');
 const allocationResult=await client.from('tura_stavke_raspodela').select('id,stavka_porudzbine_id,gazdinstvo_id,broj_pakovanja,created_at,updated_at').in('stavka_porudzbine_id',itemIds);
 if(allocationResult.error)throw new Error(allocationResult.error.message);
 const existing=allocationResult.data||[];
 const counts=new Map();let total=0;
 for(const item of freshItems){
  const count=Number(draft?.[String(item.id)]??0),ordered=n(item.package_count);
  if(!Number.isInteger(count)||count<0||count>ordered)throw new Error('Количина за купца мора бити цео број од 0 до наручене количине.');
  const other=existing.filter(x=>String(x.stavka_porudzbine_id)===String(item.id)&&String(x.gazdinstvo_id)!==String(current.gazdinstvo_id)).reduce((sum,x)=>sum+n(x.broj_pakovanja),0);
  if(other+count>ordered)throw new Error('Додела за купца премашује наручену количину након других газдинстава.');
  counts.set(String(item.id),count);total+=count;
 }
 if(total<1)throw new Error('Додели најмање једно паковање овом газдинству.');
 const updated=[],inserted=[],deleted=[];let aggregateChanged=false;
 try{
  for(const item of freshItems){
   const itemId=String(item.id),count=counts.get(itemId);
   const targetRows=existing.filter(x=>String(x.stavka_porudzbine_id)===itemId&&String(x.gazdinstvo_id)===String(current.gazdinstvo_id));
   if(count>0){
    if(targetRows.length){
     const [first,...duplicates]=targetRows;
     const result=await client.from('tura_stavke_raspodela').update({broj_pakovanja:count,updated_at:new Date().toISOString()}).eq('id',first.id).select('id').maybeSingle();
     if(result.error||!result.data)throw new Error(result.error?.message||'Расподела купца није ажурирана.');
     updated.push(first);
     for(const duplicate of duplicates){const removed=await client.from('tura_stavke_raspodela').delete().eq('id',duplicate.id);if(removed.error)throw new Error(removed.error.message);deleted.push(duplicate);}
    }else{
     const result=await client.from('tura_stavke_raspodela').insert({stavka_porudzbine_id:item.id,gazdinstvo_id:current.gazdinstvo_id,broj_pakovanja:count}).select('id').single();
     if(result.error||!result.data)throw new Error(result.error?.message||'Нова расподела купца није сачувана.');
     inserted.push(result.data.id);
    }
   }else{
    for(const old of targetRows){const removed=await client.from('tura_stavke_raspodela').delete().eq('id',old.id);if(removed.error)throw new Error(removed.error.message);deleted.push(old);}
   }
  }
  const aggregate=await client.from('tura_nabavka_dodele').update({broj_pakovanja:total,naruceno_pakovanja:total,updated_at:new Date().toISOString()}).eq('id',current.id).eq('viber_status','not_sent').eq('potvrdjeno_pakovanja',0).eq('preuzeto_pakovanja',0).select('id,broj_pakovanja,naruceno_pakovanja').maybeSingle();
  if(aggregate.error||!aggregate.data)throw new Error(aggregate.error?.message||'Укупна додела газдинству није ажурирана.');
  aggregateChanged=true;
  const verifyRows=await client.from('tura_stavke_raspodela').select('stavka_porudzbine_id,gazdinstvo_id,broj_pakovanja').in('stavka_porudzbine_id',itemIds);
  if(verifyRows.error)throw new Error(verifyRows.error.message);
  for(const item of freshItems){
   const actual=(verifyRows.data||[]).filter(x=>String(x.stavka_porudzbine_id)===String(item.id)&&String(x.gazdinstvo_id)===String(current.gazdinstvo_id)).reduce((sum,x)=>sum+n(x.broj_pakovanja),0);
   if(actual!==counts.get(String(item.id)))throw new Error('База није потврдила расподелу за сваког купца.');
  }
  if(n(aggregate.data.broj_pakovanja)!==total||n(aggregate.data.naruceno_pakovanja)!==total)throw new Error('База није потврдила укупан збир доделе.');
  return {total};
 }catch(error){
  const rollback=[];
  if(aggregateChanged){const restore=await client.from('tura_nabavka_dodele').update({broj_pakovanja:current.broj_pakovanja,naruceno_pakovanja:current.naruceno_pakovanja}).eq('id',current.id);if(restore.error)rollback.push(restore.error.message);}
  for(const id of inserted){const result=await client.from('tura_stavke_raspodela').delete().eq('id',id);if(result.error)rollback.push(result.error.message);}
  for(const old of updated){const result=await client.from('tura_stavke_raspodela').update({broj_pakovanja:old.broj_pakovanja,updated_at:old.updated_at}).eq('id',old.id);if(result.error)rollback.push(result.error.message);}
  for(const old of deleted){const result=await client.from('tura_stavke_raspodela').insert({stavka_porudzbine_id:old.stavka_porudzbine_id,gazdinstvo_id:old.gazdinstvo_id,broj_pakovanja:old.broj_pakovanja,created_at:old.created_at,updated_at:old.updated_at});if(result.error)rollback.push(result.error.message);}
  if(rollback.length)throw new Error((error.message||String(error))+' Враћање претходног стања није у потпуности успело: '+rollback.join('; '));
  throw error;
 }
}


export async function saveCustomerOrderQuantities({client,tourId,items,draft}={}) {
 if(!client||!tourId||!Array.isArray(items)||!items.length)throw new Error('Нема ставки купаца за измену.');
 const tour=await client.from('ture').select('status').eq('id',tourId).maybeSingle();
 if(tour.error)throw new Error(tour.error.message);
 if(tour.data?.status!=='processing')throw new Error('Измена поруџбина је дозвољена само на тури у статусу обраде.');
 const ids=items.map(x=>x.id);
 const fresh=await client.from('stavke_porudzbine').select('id,tura_id,product_id,variant_id,package_count').in('id',ids).eq('tura_id',tourId);
 if(fresh.error)throw new Error(fresh.error.message);
 const rows=fresh.data||[];
 if(rows.length!==ids.length)throw new Error('Неке ставке поруџбина више нису доступне у овој тури. Освежи приказ.');
 const changes=[];
 for(const item of rows){
  const count=Number(draft?.[String(item.id)]??item.package_count);
  if(!Number.isInteger(count)||count<0||count>9999)throw new Error('Количина за купца мора бити цео број од 0 до 9.999 паковања.');
  if(count!==n(item.package_count))changes.push({id:item.id,oldCount:n(item.package_count),newCount:count,productId:item.product_id,variantId:item.variant_id});
 }
 if(!changes.length)return {updated:0};
 const changedKeys=[...new Set(changes.map(x=>key(x.productId,x.variantId)))];
 const [allocationRows,customerShares]=await Promise.all([
  client.from('tura_nabavka_dodele').select('id,product_id,variant_id,broj_pakovanja,viber_status,potvrdjeno_pakovanja,preuzeto_pakovanja').eq('tura_id',tourId),
  client.from('tura_stavke_raspodela').select('id,stavka_porudzbine_id,gazdinstvo_id,broj_pakovanja').in('stavka_porudzbine_id',ids)
 ]);
 if(allocationRows.error)throw new Error(allocationRows.error.message);
 if(customerShares.error)throw new Error(customerShares.error.message);
 for(const change of changes){
  const assigned=(customerShares.data||[]).filter(x=>String(x.stavka_porudzbine_id)===String(change.id)).reduce((sum,x)=>sum+n(x.broj_pakovanja),0);
  if(assigned>change.newCount)throw new Error('Нова наручена количина не може бити мања од већ додељене количине купца. Прво измени расподелу газдинствима.');
  const proposedDemand=rows.filter(x=>key(x.product_id,x.variant_id)===key(change.productId,change.variantId)).reduce((sum,x)=>sum+(String(x.id)===String(change.id)?change.newCount:n(x.package_count)),0);
  const aggregateAssigned=(allocationRows.data||[]).filter(x=>key(x.product_id,x.variant_id)===key(change.productId,change.variantId)).reduce((sum,x)=>sum+n(x.broj_pakovanja),0);
  if(aggregateAssigned>proposedDemand)throw new Error('Нова укупна наручена количина је мања од већ распоређене количине за ову амбалажу. Прво измени расподелу газдинствима.');
  const progressed=(allocationRows.data||[]).filter(x=>key(x.product_id,x.variant_id)===key(change.productId,change.variantId)).some(x=>x.viber_status!=='not_sent'||n(x.potvrdjeno_pakovanja)>0||n(x.preuzeto_pakovanja)>0);
  if(progressed)throw new Error('Ова амбалажа већ има послато или потврђено требовање газдинству. Измена поруџбине је закључана да се не би разишле послате количине.');
 }
 const applied=[];
 try{
  for(const change of changes){
   const result=await client.from('stavke_porudzbine').update({package_count:change.newCount}).eq('id',change.id).eq('tura_id',tourId).select('id,package_count').maybeSingle();
   if(result.error)throw new Error(result.error.message);
   if(!result.data||n(result.data.package_count)!==change.newCount)throw new Error('База није потврдила измену поруџбине купца.');
   applied.push(change);
  }
  const verify=await client.from('stavke_porudzbine').select('id,package_count').in('id',changes.map(x=>x.id)).eq('tura_id',tourId);
  if(verify.error)throw new Error(verify.error.message);
  for(const change of changes){
   const row=(verify.data||[]).find(x=>String(x.id)===String(change.id));
   if(!row||n(row.package_count)!==change.newCount)throw new Error('Поновно читање није потврдило све измене поруџбина.');
  }
  return {updated:changes.length};
 }catch(error){
  const rollback=[];
  for(const change of [...applied].reverse()){
   const result=await client.from('stavke_porudzbine').update({package_count:change.oldCount}).eq('id',change.id).eq('tura_id',tourId);
   if(result.error)rollback.push(result.error.message);
  }
  if(rollback.length)throw new Error((error.message||String(error))+' Враћање претходних количина није у потпуности успело: '+rollback.join('; '));
  throw error;
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


/* Расподела потврђене количине по купцима. Не мења захтев/потврду газдинства. */
export async function saveConfirmedCustomerDistribution({client,tourId,row,items,draft}={}){
 if(!client||!tourId||!row||!Array.isArray(items)||!items.length)throw new Error('Недостају подаци за расподелу потврђене количине.');
 const tour=await client.from('ture').select('status').eq('id',tourId).maybeSingle();
 if(tour.error)throw new Error(tour.error.message);
 if(tour.data?.status!=='processing')throw new Error('Расподела је дозвољена само на тури у обради.');
 const currentResult=await client.from('tura_nabavka_dodele').select('id,tura_id,product_id,variant_id,gazdinstvo_id,naruceno_pakovanja,potvrdjeno_pakovanja,preuzeto_pakovanja,viber_status').eq('id',row.id).maybeSingle();
 if(currentResult.error)throw new Error(currentResult.error.message);
 const current=currentResult.data;
 if(!current||String(current.tura_id)!==String(tourId)||n(current.potvrdjeno_pakovanja)<=0||n(current.preuzeto_pakovanja)>0)throw new Error('За ову доделу још нема потврђене количине или је преузимање већ почело.');
 const itemIds=items.map(item=>item.id);
 const freshResult=await client.from('stavke_porudzbine').select('id,package_count,product_id,variant_id,tura_id').in('id',itemIds).eq('tura_id',tourId);
 if(freshResult.error)throw new Error(freshResult.error.message);
 const fresh=freshResult.data||[];
 if(fresh.length!==itemIds.length||fresh.some(item=>String(item.product_id)!==String(current.product_id)||String(item.variant_id)!==String(current.variant_id)))throw new Error('Поруџбине купаца више не одговарају потврђеном производу и амбалажи.');
 const sharesResult=await client.from('tura_stavke_raspodela').select('id,stavka_porudzbine_id,gazdinstvo_id,broj_pakovanja,created_at,updated_at').in('stavka_porudzbine_id',itemIds);
 if(sharesResult.error)throw new Error(sharesResult.error.message);
 const existing=sharesResult.data||[],values=new Map();let total=0;
 for(const item of fresh){
  const count=Number(draft?.[String(item.id)]??0),ordered=n(item.package_count);
  if(!Number.isInteger(count)||count<0||count>ordered)throw new Error('Количина купца мора бити цео број од 0 до наручене количине.');
  const other=existing.filter(x=>String(x.stavka_porudzbine_id)===String(item.id)&&String(x.gazdinstvo_id)!==String(current.gazdinstvo_id)).reduce((sum,x)=>sum+n(x.broj_pakovanja),0);
  if(other+count>ordered)throw new Error('Расподела купцу премашује наручену количину после других газдинстава.');
  values.set(String(item.id),count);total+=count;
 }
 if(total>n(current.potvrdjeno_pakovanja))throw new Error('Купцима је додељено више паковања него што је газдинство потврдило ('+n(current.potvrdjeno_pakovanja)+').');
 if(total<1)throw new Error('Расподели најмање једно потврђено паковање купцима.');
 const updated=[],inserted=[],deleted=[];
 try{
  for(const item of fresh){
   const itemId=String(item.id),count=values.get(itemId),oldRows=existing.filter(x=>String(x.stavka_porudzbine_id)===itemId&&String(x.gazdinstvo_id)===String(current.gazdinstvo_id));
   if(count>0){
    if(oldRows.length){
     const [first,...duplicates]=oldRows;
     const result=await client.from('tura_stavke_raspodela').update({broj_pakovanja:count,updated_at:new Date().toISOString()}).eq('id',first.id).select('id').maybeSingle();
     if(result.error||!result.data)throw new Error(result.error?.message||'Расподела купца није ажурирана.');
     updated.push(first);
     for(const duplicate of duplicates){const removed=await client.from('tura_stavke_raspodela').delete().eq('id',duplicate.id);if(removed.error)throw new Error(removed.error.message);deleted.push(duplicate);}
    }else{
     const result=await client.from('tura_stavke_raspodela').insert({stavka_porudzbine_id:item.id,gazdinstvo_id:current.gazdinstvo_id,broj_pakovanja:count}).select('id').single();
     if(result.error||!result.data)throw new Error(result.error?.message||'Расподела купца није сачувана.');
     inserted.push(result.data.id);
    }
   }else for(const old of oldRows){const removed=await client.from('tura_stavke_raspodela').delete().eq('id',old.id);if(removed.error)throw new Error(removed.error.message);deleted.push(old);}
  }
  const verify=await client.from('tura_stavke_raspodela').select('stavka_porudzbine_id,gazdinstvo_id,broj_pakovanja').in('stavka_porudzbine_id',itemIds);
  if(verify.error)throw new Error(verify.error.message);
  for(const item of fresh){
   const actual=(verify.data||[]).filter(x=>String(x.stavka_porudzbine_id)===String(item.id)&&String(x.gazdinstvo_id)===String(current.gazdinstvo_id)).reduce((sum,x)=>sum+n(x.broj_pakovanja),0);
   if(actual!==values.get(String(item.id)))throw new Error('База није потврдила расподелу за купца #'+item.id+'.');
  }
  return {total,confirmed:n(current.potvrdjeno_pakovanja),remaining:Math.max(0,n(current.potvrdjeno_pakovanja)-total)};
 }catch(error){
  const rollback=[];
  for(const id of inserted){const result=await client.from('tura_stavke_raspodela').delete().eq('id',id);if(result.error)rollback.push(result.error.message);}
  for(const old of updated){const result=await client.from('tura_stavke_raspodela').update({broj_pakovanja:old.broj_pakovanja,updated_at:old.updated_at}).eq('id',old.id);if(result.error)rollback.push(result.error.message);}
  for(const old of deleted){const result=await client.from('tura_stavke_raspodela').insert({stavka_porudzbine_id:old.stavka_porudzbine_id,gazdinstvo_id:old.gazdinstvo_id,broj_pakovanja:old.broj_pakovanja,created_at:old.created_at,updated_at:old.updated_at});if(result.error)rollback.push(result.error.message);}
  if(rollback.length)throw new Error((error.message||String(error))+' Враћање расподеле није потпуно: '+rollback.join('; '));
  throw error;
 }
}
