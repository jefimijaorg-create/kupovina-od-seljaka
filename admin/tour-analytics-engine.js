/*
 * NARUČI DOMAĆE — TOUR ANALYTICS ENGINE
 * Version: 1.0.0
 * Updated: 2026-11-18
 * Description: Reusable read-only tour reconciliation engine: exception detection, farm/packaging gap matrix, manager action requests and polling refresh.
 * Scope: Existing ADMIN Workspace and Supabase schema only. No schema changes; mutations are delegated to the authorized host.
 */
const num=v=>Number.isFinite(Number(v))?Number(v):0;
const str=v=>String(v??'');
const esc=v=>str(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const key=(p,v,f)=>[p,v,f??'unassigned'].map(str).join('::');
const farmOf=x=>x.gazdinstvo_id??x.dodijeljeno_gazdinstvo_id??null;
const sum=(a,k)=>a.reduce((n,x)=>n+num(x[k]),0);
const fmt=v=>num(v).toLocaleString('sr-RS',{maximumFractionDigits:2});

export function buildTourAnalytics({tour,items=[],allocations=[],products=[],variants=[],farms=[],orders=[]}){
 const P=new Map(products.map(x=>[str(x.id),x])),V=new Map(variants.map(x=>[str(x.id),x])),F=new Map(farms.map(x=>[str(x.id),x])),O=new Map(orders.map(x=>[str(x.id),x]));
 const groups=new Map(),matrix=new Map(),exceptions={unassigned:[],unconfirmed:[],physical:[]};
 for(const item of items){
  const fid=farmOf(item),p=P.get(str(item.product_id)),v=V.get(str(item.variant_id)),k=str(item.product_id)+'::'+str(item.variant_id);
  const row={source:'order_item',itemId:item.id,orderId:item.porudzbina_id,productId:item.product_id,variantId:item.variant_id,productName:p?.name||'Непознат производ',variantName:v?.name||v?.size_label||item.variant_name||'Основна варијанта',farmId:fid,farmName:F.get(str(fid))?.name||(fid==null?'Без додељеног газдинства':'Непознато газдинство'),packages:num(item.package_count),packageSize:item.package_size==null?null:num(item.package_size),packageUnit:item.package_unit||item.quantity_unit||item.jedinica||null,orderStatus:O.get(str(item.porudzbina_id))?.status||null,itemStatus:item.status_stavke||item.status||null};
  const g=groups.get(k)||{productId:item.product_id,variantId:item.variant_id,productName:row.productName,variantName:row.variantName,packageSize:row.packageSize,packageUnit:row.packageUnit,total:0,unassigned:0,assigned:new Map(),allocations:[]};
  g.total+=row.packages;
  if(fid==null)g.unassigned+=row.packages;
  else g.assigned.set(str(fid),(g.assigned.get(str(fid))||0)+row.packages);
  groups.set(k,g);
 }
 for(const a of allocations){
  const k=str(a.product_id)+'::'+str(a.variant_id),g=groups.get(k);
  const p=P.get(str(a.product_id)),v=V.get(str(a.variant_id)),fid=a.gazdinstvo_id;
  const assignedPlan=g?.assigned.get(str(fid))||0;
  const allocationCapacity=num(a.broj_pakovanja);
  const extraCapacity=Math.max(0,allocationCapacity-assignedPlan);
  const fromUnassigned=g?Math.min(g.unassigned,extraCapacity):0;
  if(g)g.unassigned-=fromUnassigned;
  const source=items.find(x=>str(x.product_id)===str(a.product_id)&&str(x.variant_id)===str(a.variant_id));
  const row={source:'allocation',allocationId:a.id,productId:a.product_id,variantId:a.variant_id,farmId:fid,productName:p?.name||'Непознат производ',variantName:v?.name||v?.size_label||'Основна варијанта',farmName:F.get(str(fid))?.name||'Непознато газдинство',plannedPackages:assignedPlan+fromUnassigned,activatedPackages:num(a.naruceno_pakovanja),assignedPackages:allocationCapacity,confirmedPackages:num(a.potvrdjeno_pakovanja),collectedPackages:num(a.preuzeto_pakovanja),viberStatus:a.viber_status,packageSize:source?.package_size==null?(g?.packageSize??null):num(source.package_size),packageUnit:source?.package_unit||source?.quantity_unit||source?.jedinica||g?.packageUnit||null};
  matrix.set(key(a.product_id,a.variant_id,fid),row);
  if(row.activatedPackages>row.confirmedPackages||(row.activatedPackages>0&&row.viberStatus!=='replied'))exceptions.unconfirmed.push({...row,gapPackages:Math.max(0,row.activatedPackages-row.confirmedPackages),reason:row.viberStatus==='replied'?'Потврђена количина је мања од наручене.':'Нема евидентираног Viber одговора произвођача.'});
 }
 for(const [k,g] of groups){
  for(const [fid,packages] of g.assigned){
   const mk=key(g.productId,g.variantId,fid);
   if(!matrix.has(mk))matrix.set(mk,{source:'plan',productId:g.productId,variantId:g.variantId,farmId:fid,productName:g.productName,variantName:g.variantName,farmName:F.get(fid)?.name||'Непознато газдинство',plannedPackages:packages,activatedPackages:0,confirmedPackages:0,collectedPackages:0,packageSize:g.packageSize,packageUnit:g.packageUnit});
  }
  if(g.unassigned>0){
   const row={source:'unassigned_plan',productId:g.productId,variantId:g.variantId,farmId:null,productName:g.productName,variantName:g.variantName,farmName:'Без додељеног газдинства',plannedPackages:g.unassigned,activatedPackages:0,confirmedPackages:0,collectedPackages:0,packageSize:g.packageSize,packageUnit:g.packageUnit};
   matrix.set(key(g.productId,g.variantId,null),row);
   exceptions.unassigned.push({...row,packages:g.unassigned,reason:'Део планске количине још нема додељено газдинство.'});
  }
 }
 const rows=[...matrix.values()].map(r=>({...r,statePackages:r.plannedPackages-r.collectedPackages,state:r.plannedPackages>r.collectedPackages?'deficit':r.plannedPackages<r.collectedPackages?'surplus':'balanced'}));
 for(const row of rows){
  if(row.collectedPackages!==row.activatedPackages||row.plannedPackages!==row.collectedPackages){
   exceptions.physical.push({...row,gapPackages:row.activatedPackages-row.collectedPackages,reason:row.collectedPackages<row.plannedPackages?'Физички није преузета цела планска количина.':'Преузета количина је већа од плана.'});
  }
 }
 const actionItems=rows.filter(r=>r.state!=='balanced').map(r=>({...r,id:key(r.productId,r.variantId,r.farmId),type:r.state,suggestedActions:r.state==='deficit'?['reassign','cancel','book_difference']:['reassign']}));
 const totals=rows.reduce((t,r)=>{t.planned+=r.plannedPackages;t.activated+=r.activatedPackages;t.confirmed+=r.confirmedPackages;t.collected+=r.collectedPackages;t.toResolve+=r.statePackages;return t;},{planned:0,activated:0,confirmed:0,collected:0,toResolve:0});
 return {tour,tourId:tour?.id,generatedAt:new Date().toISOString(),totals,rows,exceptions,actionItems,counts:{unassigned:exceptions.unassigned.length,unconfirmed:exceptions.unconfirmed.length,physical:exceptions.physical.length,managerActions:actionItems.length}};
}
export async function loadTourAnalytics({client,tourId}){
 if(!client?.from||!tourId)throw new Error('Недостаје Supabase клијент или ID туре.');
 const [tr,ir,ar]=await Promise.all([
  client.from('ture').select('id,naziv,status,datum').eq('id',tourId).maybeSingle(),
  client.from('stavke_porudzbine').select('id,porudzbina_id,product_id,variant_id,package_count,package_size,package_unit,quantity_unit,jedinica,gazdinstvo_id,dodijeljeno_gazdinstvo_id,status,status_stavke,variant_name').eq('tura_id',tourId),
  client.from('tura_nabavka_dodele').select('id,tura_id,product_id,variant_id,gazdinstvo_id,broj_pakovanja,naruceno,naruceno_pakovanja,potvrdjeno_pakovanja,preuzeto_pakovanja,viber_status,viber_poslato_at,potvrdjeno_at').eq('tura_id',tourId)
 ]);
 for(const r of [tr,ir,ar])if(r.error)throw new Error(r.error.message);
 if(!tr.data)throw new Error('Тура није пронађена или немате приступ.');
 const items=ir.data||[],allocations=ar.data||[];
 const ids=[...new Set([...items,...allocations].map(x=>x.product_id).filter(Boolean))],vids=[...new Set([...items,...allocations].map(x=>x.variant_id).filter(Boolean))],fids=[...new Set([...items.map(farmOf),...allocations.map(x=>x.gazdinstvo_id)].filter(x=>x!=null))],oids=[...new Set(items.map(x=>x.porudzbina_id).filter(Boolean))];
 const qs=await Promise.all([
  ids.length?client.from('products').select('id,name,category').in('id',ids):Promise.resolve({data:[],error:null}),
  vids.length?client.from('product_variants').select('id,product_id,name,size_label,unit,package_value,package_unit').in('id',vids):Promise.resolve({data:[],error:null}),
  fids.length?client.from('gazdinstva').select('id,name,is_active').in('id',fids):Promise.resolve({data:[],error:null}),
  oids.length?client.from('porudzbine').select('id,status,kupac_id,telefon').in('id',oids):Promise.resolve({data:[],error:null})
 ]);
 for(const r of qs)if(r.error)throw new Error(r.error.message);
 return buildTourAnalytics({tour:tr.data,items,allocations,products:qs[0].data||[],variants:qs[1].data||[],farms:qs[2].data||[],orders:qs[3].data||[]});
}

export function subscribeTourAnalytics({client,tourId,onUpdate,onError,intervalMs=30000}){
 let stopped=false,busy=false;
 const refresh=async()=>{if(stopped||busy)return;busy=true;try{const report=await loadTourAnalytics({client,tourId});if(!stopped)onUpdate?.(report);}catch(error){if(!stopped)onError?.(error);}finally{busy=false;}};
 const visible=()=>{if(!document.hidden)refresh();};
 refresh();
 const timer=window.setInterval(refresh,Math.max(10000,num(intervalMs)||30000));
 document.addEventListener('visibilitychange',visible);
 return {refresh,unsubscribe(){stopped=true;window.clearInterval(timer);document.removeEventListener('visibilitychange',visible);}};
}

const CSS=`.nta{--bg:#0b1729;--card:#13233a;--line:#30445f;--muted:#9aabc1;color:#edf3fa;background:var(--bg);border:1px solid var(--line);border-radius:16px;padding:12px;font:inherit}.nta *{box-sizing:border-box}.nta-head,.nta-line,.nta-bar{display:flex;align-items:center;justify-content:space-between;gap:9px}.nta h2{font-size:16px;margin:0}.nta small,.nta-muted{color:var(--muted);font-size:11px}.nta-widget{width:100%;border:1px solid var(--line);border-radius:14px;background:var(--card);padding:12px;color:#edf3fa;text-align:left;cursor:pointer}.nta-counts{display:flex;gap:12px;flex-wrap:wrap;margin-top:7px;font-size:12px;font-weight:850}.nta-danger,.nta .deficit{color:#ff9da5}.nta-warn{color:#ffd18f}.nta-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin:10px 0}.nta-kpi,.nta-section{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px}.nta-kpi b{display:block;font-size:19px}.nta-kpi span{font-size:10px;color:var(--muted)}.nta-section{margin:10px 0}.nta-section h3{font-size:13px;margin:0 0 8px}.nta-table-wrap{overflow:auto}.nta table{width:100%;border-collapse:collapse;font-size:11px;min-width:650px}.nta th,.nta td{padding:8px 7px;border-bottom:1px solid var(--line);text-align:left;white-space:nowrap}.nta th{color:var(--muted)}.nta .surplus{color:#a6e4c2}.nta-item{padding:9px 0;border-top:1px solid var(--line)}.nta-item:first-of-type{border-top:0}.nta-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.nta-actions button{min-height:40px;padding:7px 10px;border-radius:10px;border:1px solid #516987;background:#203752;color:#fff;font-weight:800}.nta-empty{padding:12px;border:1px dashed var(--line);border-radius:10px;color:var(--muted);font-size:12px}.nta-error{color:#ffb4ba;background:#472830;padding:9px;border-radius:10px;font-size:12px}@media(min-width:760px){.nta{padding:16px}.nta-grid{grid-template-columns:repeat(5,minmax(0,1fr))}}`;
function styles(){if(document.querySelector('style[data-tour-analytics="1.0.0"]'))return;const s=document.createElement('style');s.dataset.tourAnalytics='1.0.0';s.textContent=CSS;document.head.appendChild(s);}
function renderWidget(root,report,onOpen){const b=document.createElement('button');b.type='button';b.className='nta-widget';b.innerHTML='<div class="nta-bar"><strong>АНАЛИТИКА ТУРЕ #'+esc(report.tourId)+'</strong><small>'+new Date(report.generatedAt).toLocaleTimeString('sr-RS')+'</small></div><div class="nta-counts"><span class="nta-danger">[!] '+report.counts.physical+' непреузетих/одступања</span><span class="nta-warn">[?] '+report.counts.unconfirmed+' непотврђених</span><span>Без газдинства: '+report.counts.unassigned+'</span></div>';b.addEventListener('click',()=>onOpen?.(report));root.replaceChildren(b);}
function list(rows,field){return rows.length?rows.map(r=>'<article class="nta-item"><div class="nta-line"><strong>'+esc(r.productName)+' · '+esc(r.variantName)+'</strong><b class="deficit">'+fmt(field==='packages'?r.packages:r.gapPackages)+' пак.</b></div><div class="nta-muted">'+esc(r.farmName)+' · '+esc(r.reason||'')+'</div></article>').join(''):'<div class="nta-empty">Нема евидентираних изузетака.</div>';}
function renderPanel(root,r,onResolve){
 const body=r.rows.map(x=>'<tr><td>'+esc(x.productName)+'</td><td>'+esc(x.variantName)+'</td><td>'+esc(x.farmName)+'</td><td>'+fmt(x.plannedPackages)+'</td><td>'+fmt(x.activatedPackages)+'</td><td>'+fmt(x.confirmedPackages)+'</td><td>'+fmt(x.collectedPackages)+'</td><td class="'+x.state+'">'+(x.statePackages>0?'+':'')+fmt(x.statePackages)+'</td></tr>').join('');
 const actions=r.actionItems.length?r.actionItems.map(x=>'<article class="nta-item"><div class="nta-line"><strong>'+esc(x.productName)+' · '+esc(x.farmName)+'</strong><b class="'+x.state+'">'+fmt(x.statePackages)+' пак.</b></div><div class="nta-muted">'+esc(x.variantName)+' · Потребно '+fmt(x.plannedPackages)+' · Преузето '+fmt(x.collectedPackages)+'</div>'+(onResolve&&x.state==='deficit'?'<div class="nta-actions"><button data-act="reassign" data-id="'+esc(x.id)+'">Прекњижи</button><button data-act="cancel" data-id="'+esc(x.id)+'">Откажи ставку</button><button data-act="book_difference" data-id="'+esc(x.id)+'">Књижи разлику</button></div>':'')+'</article>').join(''):'<div class="nta-empty">Нема отворених ставки за решавање.</div>';
 root.innerHTML='<section class="nta"><header class="nta-head"><div><h2>Аналитика туре #'+esc(r.tourId)+'</h2><small>'+esc(r.tour?.naziv||'Изабрана тура')+' · освежено '+new Date(r.generatedAt).toLocaleTimeString('sr-RS')+'</small></div><small>Supabase · read-only анализа</small></header><div class="nta-grid"><div class="nta-kpi"><b>'+fmt(r.totals.planned)+'</b><span>ПОТРЕБНО</span></div><div class="nta-kpi"><b>'+fmt(r.totals.activated)+'</b><span>АКТИВИРАНО</span></div><div class="nta-kpi"><b>'+fmt(r.totals.confirmed)+'</b><span>ПОТВРЂЕНО</span></div><div class="nta-kpi"><b>'+fmt(r.totals.collected)+'</b><span>ПРЕУЗЕТО</span></div><div class="nta-kpi"><b class="'+(r.totals.toResolve>0?'deficit':'')+'">'+fmt(r.totals.toResolve)+'</b><span>СТАЊЕ ЗА РЕШЕЊЕ</span></div></div><section class="nta-section"><h3>Матрица раскорака · амбалажа и газдинство</h3><div class="nta-table-wrap"><table><thead><tr><th>Производ</th><th>Амбалажа</th><th>Газдинство</th><th>Потребно</th><th>Активирано</th><th>Потврђено</th><th>Преузето</th><th>Стање за решење</th></tr></thead><tbody>'+(body||'<tr><td colspan="8">Нема ставки.</td></tr>')+'</tbody></table></div></section><section class="nta-section"><h3>Оперативни изузеци</h3><h4>Роба без додељеног газдинства ('+r.counts.unassigned+')</h4>'+list(r.exceptions.unassigned,'packages')+'<h4>Непотврђене поруџбине ('+r.counts.unconfirmed+')</h4>'+list(r.exceptions.unconfirmed,'gap')+'<h4>Физичка одступања ('+r.counts.physical+')</h4>'+list(r.exceptions.physical,'gap')+'</section><section class="nta-section"><h3>За преглед менаџера ('+r.counts.managerActions+')</h3>'+actions+'</section></section>';
 if(onResolve)root.querySelectorAll('[data-act]').forEach(b=>b.addEventListener('click',async()=>{const item=r.actionItems.find(x=>x.id===b.dataset.id);if(!item)return;b.disabled=true;try{await onResolve({action:b.dataset.act,tourId:r.tourId,item,report:r});}finally{b.disabled=false;}}));
}
export function mountTourAnalyticsWidget({root,client,tourId,onOpen,onError,intervalMs=30000}){if(!root)throw new Error('Недостаје коренски елемент.');styles();root.innerHTML='<div class="nta-empty">Учитава се аналитика туре…</div>';let report=null;const sub=subscribeTourAnalytics({client,tourId,intervalMs,onError,onUpdate:r=>{report=r;renderWidget(root,r,onOpen);}});return{getReport:()=>report,refresh:sub.refresh,destroy:sub.unsubscribe};}
export function mountTourAnalyticsPanel({root,client,tourId,onResolveAction,onError,intervalMs=30000}){if(!root)throw new Error('Недостаје коренски елемент.');styles();root.innerHTML='<div class="nta-empty">Учитава се анализа туре…</div>';let report=null;const sub=subscribeTourAnalytics({client,tourId,intervalMs,onError:e=>{root.innerHTML='<div class="nta-error">Аналитика није освежена: '+esc(e.message||e)+'</div>';onError?.(e);},onUpdate:r=>{report=r;renderPanel(root,r,onResolveAction);}});return{getReport:()=>report,refresh:sub.refresh,destroy:sub.unsubscribe};}
