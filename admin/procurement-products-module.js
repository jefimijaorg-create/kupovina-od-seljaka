/*
 * NARUČI DOMAĆE — OPERATIVNA NABAVKA
 * Version: 3.1.1
 * Updated: 2026-11-18
 * Description: Two-level procurement workspace: tour-wide demand overview and farm-first execution with basket and field protocol tabs.
 * Scope: Existing ADMIN Workspace, existing Supabase schema and RLS only. No legacy panel dependency and no schema changes.
 */
import { loadProcurementData } from './data/admin-repository.js';
import { buildProcurementDemands } from './procurement/procurement-calculations.js';

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
`;
export async function mountProcurementProductsModule({root,core,tourId,onBack}){
 if(!root||!core?.client||!tourId)throw new Error('Недостаје ADMIN контекст или ID туре.');
 if(!['admin','super_admin'].includes(core.getState?.()?.role))throw new Error('Немате дозволу за управљање набавком.');
 const client=core.client,style=document.createElement('style');style.textContent=CSS;style.dataset.ndProcurementProducts='3.0.0';document.head.appendChild(style);
 const s={disposed:false,busy:false,tour:null,items:[],products:[],variants:[],demands:[],farms:[],offers:[],allocations:[],farmId:'',cart:[],tab:'basket',notice:'',error:false};
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
 const totalActivated=()=>unitTotals(d=>Math.max(0,allocated(d.productId,d.variantId)-ordered(d.productId,d.variantId))+pending(d.productId,d.variantId));
 const totalOrdered=()=>unitTotals(d=>ordered(d.productId,d.variantId));
 const totalCollected=()=>unitTotals(d=>allocationsFor(d.productId,d.variantId).reduce((a,x)=>a+n(x.preuzeto_pakovanja),0));
 const totalRemaining=()=>unitTotals(d=>Math.max(0,d.packages-allocated(d.productId,d.variantId)-pending(d.productId,d.variantId)));
 function message(){
  const ff=farm(s.farmId),rows=rowsForFarm().filter(x=>n(x.broj_pakovanja)>0);
  return 'Поштовани'+(ff?.name?' '+ff.name:'')+',\n\nМолимо вас да потврдите захтев за туру #'+tourId+':\n'+rows.map(x=>{const d=demand(x.product_id,x.variant_id);return '• '+(prod(x.product_id)?.name||'Производ')+' — '+(variant(x.variant_id)?.name||variant(x.variant_id)?.size_label||'Варијанта')+': '+f(x.broj_pakovanja)+' паковања ('+qty(x.broj_pakovanja,d)+')';}).join('\n')+'\n\nМолимо потврдите количине које можете да припремите. Хвала!';
 }
 function render(){
  if(s.disposed)return;
  const writable=s.tour?.status==='processing',selected=!!s.farmId,ff=farm(s.farmId),farmRows=rowsForFarm();
  const groups=new Map();
  for(const d of s.demands.filter(x=>x.valid)){
   const p=prod(d.productId),v=variant(d.variantId),cat=p?.category||'Остало';
   if(selected&&!offer(d.productId,d.variantId)&&!allocation(d.productId,d.variantId,s.farmId))continue;
   if(!groups.has(cat))groups.set(cat,[]);
   groups.get(cat).push({d,p,v});
  }
  const aggregateHtml=[...groups].map(([cat,rows])=>'<div class="ndp3-category">'+e(cat)+'</div>'+rows.map(({d,p,v})=>{
   const a=allocated(d.productId,d.variantId),col=allocationsFor(d.productId,d.variantId).reduce((z,x)=>z+n(x.preuzeto_pakovanja),0),percent=d.packages?Math.min(100,100*a/d.packages):0;
   return '<article class="ndp3-product"><div class="ndp3-row"><div><strong>'+e(p?.name||'Производ')+'</strong><small>'+(e(v?.name||v?.size_label||'Варијанта'))+' · '+f(d.packageSize)+' '+e(d.packageUnit)+' по паковању</small></div><span class="ndp3-chip '+(col>=d.packages?'green':a?'blue':'amber')+'">'+(col>=d.packages?'Преузето':a?'Активирано':'Непокривено')+'</span></div><p>Потребно: <b>'+qty(d.packages,d)+'</b> · Активирано: '+qty(a,d)+' · Преузето: '+qty(col,d)+'</p><div class="ndp3-coverage"><i style="width:'+percent+'%"></i></div><p>Покривено '+qty(a,d)+' / '+qty(d.packages,d)+'</p></article>';
  }).join('')).join('')||'<div class="ndp3-empty">'+(selected?'Ово газдинство нема понуду за производе потребне тури.':'Нема валидних ставки потреба за ову туру.')+'</div>';
  const farmCatalog=s.demands.filter(d=>d.valid&&offer(d.productId,d.variantId)).map(d=>{
   const p=prod(d.productId),v=variant(d.variantId),al=allocation(d.productId,d.variantId,s.farmId),pending=s.cart.find(x=>key(x.productId,x.variantId)===key(d.productId,d.variantId));
   const count=pending?.count||0,remaining=Math.max(0,d.packages-allocated(d.productId,d.variantId)-count);
   return '<article class="ndp3-product"><div class="ndp3-row"><div><strong>'+e(p?.name||'Производ')+'</strong><small>'+e(v?.name||v?.size_label||'Варијанта')+' · '+f(d.packageSize)+' '+e(d.packageUnit)+' по паковању</small></div><span class="ndp3-chip">'+qty(d.packages,d)+'</span></div><p>Потребно '+qty(d.packages,d)+' · Активирано '+qty(Math.max(0,allocated(d.productId,d.variantId)-ordered(d.productId,d.variantId)),d)+' · Наручено '+qty(ordered(d.productId,d.variantId),d)+' · У корпи '+qty(count,d)+' · Преостало '+qty(remaining,d)+'</p><div class="ndp3-row"><span class="ndp3-meta">Количина за захтев</span><div class="ndp3-stepper"><button class="ndp3-btn minus" data-action="step" data-delta="-1" data-p="'+e(d.productId)+'" data-v="'+e(d.variantId)+'" aria-label="Умањи">−</button><output>'+f(count)+'</output><button class="ndp3-btn plus" data-action="step" data-delta="1" data-p="'+e(d.productId)+'" data-v="'+e(d.variantId)+'" aria-label="Увећај" '+(remaining<=0?'disabled':'')+'>+</button></div></div><div class="ndp3-actions"><button class="ndp3-btn primary" data-action="add" data-p="'+e(d.productId)+'" data-v="'+e(d.variantId)+'" '+(!writable||remaining<=0?'disabled':'')+'>Додај у корпу</button></div></article>';
  }).join('')||'<div class="ndp3-empty">Нема активних понуда овог газдинства за потребе туре.</div>';
  const cartHtml=s.cart.length?s.cart.map((x,i)=>{const d=demand(x.productId,x.variantId);return '<div class="ndp3-item"><div class="ndp3-row"><div><div class="ndp3-item-title">'+e(prod(x.productId)?.name)+' · '+e(variant(x.variantId)?.name||variant(x.variantId)?.size_label)+'</div><div class="ndp3-meta">'+f(x.count)+' паковања · '+qty(x.count,d)+'</div></div><div class="ndp3-stepper"><button class="ndp3-btn minus" data-action="cart-step" data-i="'+i+'" data-delta="-1">−</button><output>'+f(x.count)+'</output><button class="ndp3-btn plus" data-action="cart-step" data-i="'+i+'" data-delta="1">+</button></div></div><div class="ndp3-actions"><button class="ndp3-btn" data-action="remove" data-i="'+i+'">Уклони</button></div></div>';}).join(''):'<div class="ndp3-empty">Корпа је празна. Изабери производ и додај количину.</div>';
  const protocol=farmRows.length?farmRows.map(x=>{
   const d=demand(x.product_id,x.variant_id),p=prod(x.product_id),v=variant(x.variant_id);
   return '<div class="ndp3-item"><div class="ndp3-row"><div><div class="ndp3-item-title">'+e(p?.name)+' · '+e(v?.name||v?.size_label)+'</div><div class="ndp3-meta">Активирано '+qty(x.broj_pakovanja,d)+'</div></div><span class="ndp3-chip '+(n(x.preuzeto_pakovanja)>=n(x.broj_pakovanja)?'green':x.viber_status==='sent'?'blue':'amber')+'">'+(n(x.preuzeto_pakovanja)>=n(x.broj_pakovanja)?'Преузето':x.viber_status==='sent'?'Послато':'У припреми')+'</span></div><div class="ndp3-grid"><span><b>'+qty(x.naruceno_pakovanja,d)+'</b>Наручено</span><span><b>'+qty(x.potvrdjeno_pakovanja,d)+'</b>Потврђено</span><span><b>'+qty(x.preuzeto_pakovanja,d)+'</b>Преузето</span></div><div class="ndp3-record-inputs"><label>Потврђено паковања<input type="number" min="0" max="'+f(x.naruceno_pakovanja)+'" step="1" data-field="potvrdjeno_pakovanja" data-id="'+x.id+'" value="'+f(x.potvrdjeno_pakovanja)+'"></label><label>Стварно преузето<input type="number" min="0" max="'+f(x.potvrdjeno_pakovanja)+'" step="1" data-field="preuzeto_pakovanja" data-id="'+x.id+'" value="'+f(x.preuzeto_pakovanja)+'"></label></div><div class="ndp3-actions"><button class="ndp3-btn primary" data-action="save-field" data-id="'+x.id+'" '+(!writable||s.busy?'disabled':'')+'>Сачувај теренски унос</button></div></div>';
  }).join(''):'<div class="ndp3-empty">За ово газдинство још нема активираних ставки.</div>';
  host.innerHTML='<header class="ndp3-head"><div><div class="ndp3-kicker">ОПЕРАТИВНА ТАБЛА · ТУРА #'+e(tourId)+'</div><h1>Набавка</h1><p>'+e(s.tour?.naziv||'Тура')+' · '+(selected?'Газдинство: '+e(ff?.name):'Збирни преглед целе туре')+'</p></div><button class="ndp3-btn" data-action="back">← Назад</button></header>'+
  '<section class="ndp3-panel"><div class="ndp3-toolbar"><label>Изабери газдинство<select class="ndp3-select" data-farm><option value="">Сва газдинства · збирни преглед туре</option>'+s.farms.map(x=>'<option value="'+e(x.id)+'" '+(String(x.id)===String(s.farmId)?'selected':'')+'>'+e(x.name)+'</option>').join('')+'</select></label><div class="ndp3-status"><span class="ndp3-chip">'+(selected?'ОПЕРАТИВНИ РЕЖИМ':'ЗБИРНИ РЕЖИМ')+'</span><span class="ndp3-chip">'+s.demands.filter(x=>x.valid).length+' ставки потреба</span></div></div></section>'+
  '<section class="ndp3-kpis"><div class="ndp3-kpi"><b>'+totalNeeded()+'</b><span>УКУПНО ПОТРЕБНО</span></div><div class="ndp3-kpi"><b>'+totalActivated()+'</b><span>АКТИВИРАНО · НЕНАРУЧЕНО</span></div><div class="ndp3-kpi"><b>'+totalOrdered()+'</b><span>НАРУЧЕНО</span></div><div class="ndp3-kpi"><b>'+totalCollected()+'</b><span>СТВАРНО ПРЕУЗЕТО</span></div><div class="ndp3-kpi"><b>'+totalRemaining()+'</b><span>ПРЕОСТАЛО</span></div></section>'+
  (s.notice?'<div class="ndp3-note '+(s.error?'error':'')+'" role="status">'+e(s.notice)+'</div>':'')+(!writable?'<div class="ndp3-note">Тура није у статусу за измене. Приказ је само за читање.</div>':'')+
  '<div class="ndp3-work"><main class="ndp3-panel"><h2>'+(selected?'Каталог изабраног газдинства':'Потребе целе туре')+'</h2><p>'+(selected?'Приказани су само производи које ово газдинство има у активној понуди.':'Производи су груписани по категорији и варијанти амбалаже, без избора добављача.')+'</p>'+(selected?farmCatalog:aggregateHtml)+'</main>'+
  '<aside class="ndp3-side"><section class="ndp3-panel"><div class="ndp3-tabs"><button class="ndp3-tab" data-tab="basket" aria-selected="'+(s.tab==='basket')+'">Корпа захтева ('+s.cart.length+')</button><button class="ndp3-tab" data-tab="field" aria-selected="'+(s.tab==='field')+'">Теренски протокол</button></div>'+
  (s.tab==='basket'?'<h2>Корпа · '+(ff?.name?e(ff.name):'изабери газдинство')+'</h2>'+(selected?cartHtml:'<div class="ndp3-empty">Изабери газдинство да би додавао производе у његову корпу.</div>')+'<div class="ndp3-actions"><button class="ndp3-btn primary" data-action="generate" '+(!selected||!s.cart.length||!writable||s.busy?'disabled':'')+'>'+(s.busy?'Чувам…':'Генериши Viber поруку и активирај захтев')+'</button></div><p>Кликом се захтев чува као наручен, припрема Viber порука и отвара ручно слање. Статус „Послато“ бележи се само ако газдинство има број телефона.</p>':'<h2>Теренско преузимање · '+e(ff?.name||'Изабери газдинство')+'</h2>'+(selected?protocol:'<div class="ndp3-empty">Изабери газдинство да видиш његов теренски протокол.</div>'))+
  '</section></aside></div><div class="ndp3-foot">Подаци се читају и уписују у постојеће Supabase табеле. Назив производа долази преко product_id → products.name. Количине се рачунају из package_count × package_size.</div>';
 }
 async function saveCart({markSent=false}={}){
  if(s.busy||!s.cart.length||!s.farmId)return;if(s.tour?.status!=='processing')return setNote('Тура није отворена за измене.',true);
  s.busy=true;render();let wrote=false;
  try{
   for(const item of s.cart){
    const d=demand(item.productId,item.variantId),o=offer(item.productId,item.variantId),old=allocation(item.productId,item.variantId,s.farmId);
    if(!d?.valid||!o)throw Error('Понуда или подаци о паковању нису важећи. Освежи податке.');
    const count=n(old?.broj_pakovanja)+item.count,others=allocated(item.productId,item.variantId)-n(old?.broj_pakovanja);
    if(count+others>d.packages)throw Error('Захтев прелази укупну потребу туре.');
    if(old){
     const q=await client.from('tura_nabavka_dodele').update({broj_pakovanja:count,nabavna_cena:n(o.purchase_price),...(markSent?{naruceno:true,naruceno_pakovanja:count,viber_status:'sent',viber_poslato_at:new Date().toISOString()}:{}) ,updated_at:new Date().toISOString()}).eq('id',old.id).select('id,broj_pakovanja').maybeSingle();
     if(q.error)throw Error(q.error.message);if(!q.data||n(q.data.broj_pakovanja)!==count)throw Error('База није потврдила измену.');
    }else{
     const q=await client.from('tura_nabavka_dodele').insert({tura_id:Number(tourId),product_id:item.productId,variant_id:item.variantId,gazdinstvo_id:Number(s.farmId),broj_pakovanja:item.count,nabavna_cena:n(o.purchase_price),naruceno:markSent,naruceno_pakovanja:markSent?item.count:0,potvrdjeno_pakovanja:0,preuzeto_pakovanja:0,viber_status:markSent?'sent':'not_sent',...(markSent?{viber_poslato_at:new Date().toISOString()}:{})}).select('id,broj_pakovanja').single();
     if(q.error)throw Error(q.error.message);if(!q.data||n(q.data.broj_pakovanja)!==item.count)throw Error('База није потврдила нови захтев.');
    }
    wrote=true;
   }
   s.cart=[];await load();s.tab='basket';setNote('Захтев је активиран и сачуван у бази.');
  }catch(err){if(wrote){try{await load();}catch(_){}}setNote('Захтев није у потпуности сачуван: '+(err.message||String(err)),true);}
  finally{s.busy=false;render();}
 }
 async function saveField(id){
  if(s.busy)return;const row=s.allocations.find(x=>String(x.id)===String(id));if(!row)return;
  const fields=[...host.querySelectorAll('[data-id="'+id+'"][data-field]')],values=Object.fromEntries(fields.map(x=>[x.dataset.field,Number(x.value)]));
  const confirmed=values.potvrdjeno_pakovanja,collected=values.preuzeto_pakovanja;
  if(![confirmed,collected].every(x=>Number.isInteger(x)&&x>=0)||confirmed>n(row.naruceno_pakovanja)||collected>confirmed)return setNote('Услов мора бити: преузето ≤ потврђено ≤ наручено. Унеси целе ненегативне бројеве паковања.',true);
  const siblings=allocationsFor(row.product_id,row.variant_id).filter(x=>String(x.id)!==String(id)),d=demand(row.product_id,row.variant_id);
  if(siblings.reduce((a,x)=>a+n(x.preuzeto_pakovanja),0)+collected>d.packages)return setNote('Укупно преузето премашује потребу туре.',true);
  if(s.tour?.status!=='processing')return setNote('Тура није отворена за измене.',true);
  s.busy=true;render();
  try{
   const patch={potvrdjeno_pakovanja:confirmed,preuzeto_pakovanja:collected,updated_at:new Date().toISOString()};
   if(confirmed!==n(row.potvrdjeno_pakovanja))patch.potvrdjeno_at=confirmed?new Date().toISOString():null;
   const q=await client.from('tura_nabavka_dodele').update(patch).eq('id',row.id).select('id,potvrdjeno_pakovanja,preuzeto_pakovanja').maybeSingle();
   if(q.error)throw Error(q.error.message);if(!q.data||n(q.data.potvrdjeno_pakovanja)!==confirmed||n(q.data.preuzeto_pakovanja)!==collected)throw Error('База није потврдила теренски унос.');
   await load();setNote('Теренски протокол је сачуван.');
  }catch(err){setNote('Унос није сачуван: '+(err.message||String(err)),true);}
  finally{s.busy=false;render();}
 }
 async function generateViber(){
  if(!s.farmId||!s.cart.length)return;
  try{
   const hasPhone=!!String(farm(s.farmId)?.phone||'').trim();
   await saveCart({markSent:hasPhone});
   if(s.cart.length)return;
   const text=message(),phone=String(farm(s.farmId)?.phone||'').replace(/[^\d+]/g,'');
   if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(text);
   if(phone)location.href='viber://chat?number='+encodeURIComponent(phone);
   setNote(phone?'Захтев је активиран. Порука је копирана и Viber је отворен за ручно слање.':'Захтев је активиран и порука копирана. Газдинство нема број телефона.',false);
  }catch(err){setNote('Viber порука није припремљена: '+(err.message||String(err)),true);}
 }
 host.addEventListener('change',ev=>{if(ev.target.matches('[data-farm]')){s.farmId=ev.target.value;s.cart=[];s.tab='basket';render();}});
 host.addEventListener('click',async ev=>{
  const b=ev.target.closest('[data-action],[data-tab]');if(!b)return;
  if(b.dataset.tab){s.tab=b.dataset.tab;render();return;}
  const a=b.dataset.action;
  if(a==='back')return onBack?.();
  if(a==='step'||a==='add'){
   const p=b.dataset.p,v=b.dataset.v,d=demand(p,v);let item=s.cart.find(x=>key(x.productId,x.variantId)===key(p,v));
   const next=(item?.count||0)+(a==='add'?1:Number(b.dataset.delta));
   const already=allocated(p,v),limit=Math.max(0,d.packages-already);
   if(next>limit)return setNote('Не можеш тражити више од преостале потребе ('+qty(limit,d)+').',true);
   if(next<=0){s.cart=s.cart.filter(x=>key(x.productId,x.variantId)!==key(p,v));}
   else if(item)item.count=next;else s.cart.push({productId:p,variantId:v,count:next});
   render();return;
  }
  if(a==='cart-step'){const x=s.cart[Number(b.dataset.i)];if(!x)return;const d=demand(x.productId,x.variantId),limit=Math.max(0,d.packages-allocated(x.productId,x.variantId));x.count=Math.max(0,Math.min(limit,x.count+Number(b.dataset.delta)));s.cart=s.cart.filter(y=>y.count>0);render();return;}
  if(a==='remove'){s.cart.splice(Number(b.dataset.i),1);render();return;}
  if(a==='save-field')return saveField(b.dataset.id);
  if(a==='generate')return generateViber();
 });
 try{await load();render();}catch(err){host.innerHTML='<div class="ndp3-empty"><b>Набавка није учитана</b><p>'+e(err.message||String(err))+'</p><button class="ndp3-btn" data-action="back">Назад</button></div>';}
 return{destroy(){s.disposed=true;style.remove();root.replaceChildren();}};
}
