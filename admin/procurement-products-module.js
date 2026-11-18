/*
 * NARUČI DOMAĆE — PROCUREMENT PRODUCTS WORKSPACE
 * Version: 2.0.1
 * Updated: 2026-11-18
 * Description: Standalone farm-first procurement workflow with aggregated multi-add basket entries, Viber status, and collection accounting.
 * Scope: Existing ADMIN Workspace and existing Supabase tables/RLS only. No schema changes.
 */
import { loadProcurementData } from './data/admin-repository.js';
import { buildProcurementDemands } from './procurement/procurement-calculations.js';

const num = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
const fmt = (v) => num(v).toLocaleString('sr-RS', { maximumFractionDigits: 3 });
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pair = (p, v) => String(p) + '::' + String(v);
const CSS = `
.ndp2{--bg:#0b1426;--panel:#111f34;--line:#2a3b55;--muted:#9aabc1;--gold:#f6bd83;color:#eaf0f8;background:var(--bg);border:1px solid var(--line);border-radius:20px;padding:14px;min-height:70vh;font-family:inherit}
.ndp2 *{box-sizing:border-box}.ndp2-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:14px}.ndp2-kicker{font-size:10px;font-weight:900;letter-spacing:.15em;color:var(--gold)}.ndp2 h1{font-size:clamp(22px,4vw,30px);margin:5px 0}.ndp2 p{color:var(--muted);margin:4px 0;font-size:13px}
.ndp2-btn{border:1px solid #3b4d68;background:#1a2a42;color:#f5c28e;border-radius:12px;min-height:46px;padding:10px 14px;font-weight:800;cursor:pointer}.ndp2-btn.primary{background:#9a5d32;border-color:#c17d4c;color:#fff}.ndp2-btn:disabled{opacity:.5;cursor:wait}
.ndp2-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-bottom:14px}.ndp2-stat,.ndp2-card{background:var(--panel);border:1px solid var(--line);border-radius:15px;padding:12px;min-width:0}.ndp2-stat b{display:block;font-size:22px;color:var(--gold)}.ndp2-stat span,.ndp2-muted{font-size:11px;color:var(--muted)}
.ndp2-section{margin:14px 0}.ndp2-section h2{font-size:16px;margin:0 0 10px}.ndp2-form{display:grid;grid-template-columns:1fr;gap:10px}.ndp2 label{display:grid;gap:6px;color:#cbd6e5;font-size:12px;font-weight:700}.ndp2 select,.ndp2 input,.ndp2 textarea{width:100%;min-height:46px;border:1px solid #3a4b65;border-radius:11px;background:#091426;color:#f2f6fc;padding:10px;font:inherit}.ndp2 input[type=number]{font-variant-numeric:tabular-nums}
.ndp2-product{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;padding:10px 0;border-top:1px solid var(--line)}.ndp2-product strong{display:block;font-size:13px}.ndp2-product small{color:var(--muted);font-size:11px}.ndp2-product .ndp2-metrics{display:flex;flex-wrap:wrap;gap:8px;margin-top:6px}
.ndp2-pill{display:inline-flex;border-radius:99px;padding:4px 8px;background:#1c304a;color:#c6d5e8;font-size:10px;font-weight:800}.ndp2-pill.ok{background:#173c32;color:#9ce0bd}.ndp2-pill.warn{background:#47331e;color:#ffd29b}
.ndp2-cart-row,.ndp2-record{border-top:1px solid var(--line);padding:12px 0}.ndp2-rowhead{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.ndp2-grid3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin:10px 0}.ndp2-grid3 span{background:#0a172a;border-radius:10px;padding:8px;font-size:10px;color:var(--muted)}.ndp2-grid3 b{display:block;color:#fff;font-size:15px}
.ndp2-actions{display:flex;flex-wrap:wrap;gap:7px;margin-top:10px}.ndp2-actions .ndp2-btn{flex:1 1 130px}.ndp2-notice{padding:11px;border-radius:11px;background:#172b3f;color:#bcd6ee;margin:10px 0;font-size:12px}.ndp2-notice.error{background:#42252b;color:#ffc0c0}.ndp2-empty{padding:14px;border:1px dashed #3a4b65;border-radius:12px;color:var(--muted);font-size:12px}
.ndp2-message{width:100%;min-height:130px;white-space:pre-wrap}.ndp2-record-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin-top:10px}.ndp2-record-grid label{font-size:10px}.ndp2-foot{color:var(--muted);font-size:10px;margin-top:12px}
@media(min-width:760px){.ndp2{padding:20px}.ndp2-stats{grid-template-columns:repeat(5,minmax(0,1fr))}.ndp2-form{grid-template-columns:1.2fr 1.2fr .7fr auto;align-items:end}.ndp2-columns{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(300px,.8fr);gap:14px}.ndp2-side{position:sticky;top:12px;align-self:start}}
@media(max-width:390px){.ndp2{padding:10px}.ndp2-grid3{grid-template-columns:repeat(2,minmax(0,1fr))}.ndp2-record-grid{grid-template-columns:1fr 1fr}}
`;

export async function mountProcurementProductsModule({ root, core, tourId, onBack }) {
  if (!root || !core?.client || !tourId) throw new Error('Недостаје ADMIN контекст или ID туре.');
  if (!['admin','super_admin'].includes(core.getState?.()?.role)) throw new Error('Немате дозволу за управљање набавком.');
  const client = core.client;
  const style = document.createElement('style'); style.textContent = CSS; style.dataset.ndProcurementProducts='2.0.0'; document.head.appendChild(style);
  const state = { busy:false, disposed:false, tour:null, items:[], products:[], variants:[], demands:[], farms:[], offers:[], allocations:[], farmId:'', productId:'', variantId:'', quantity:'1', cart:[], notice:'', error:false };
  root.innerHTML = '<section class="ndp2"><div class="ndp2-empty">Учитавам набавку за туру…</div></section>';
  const host = root.querySelector('.ndp2');

  const farm = id => state.farms.find(x => String(x.id)===String(id));
  const product = id => state.products.find(x => String(x.id)===String(id));
  const variant = id => state.variants.find(x => String(x.id)===String(id));
  const demand = (p,v) => state.demands.find(x => pair(x.productId,x.variantId)===pair(p,v));
  const offer = (p,v,f=state.farmId) => state.offers.find(x => String(x.product_id)===String(p) && String(x.variant_id)===String(v) && String(x.gazdinstvo_id)===String(f) && x.is_active===true);
  const allocation = (p,v,f=state.farmId) => state.allocations.find(x => String(x.product_id)===String(p) && String(x.variant_id)===String(v) && String(x.gazdinstvo_id)===String(f));
  const allAllocated = (p,v) => state.allocations.filter(x=>String(x.product_id)===String(p)&&String(x.variant_id)===String(v)).reduce((s,x)=>s+num(x.broj_pakovanja),0);
  const remaining = (p,v) => Math.max(0,num(demand(p,v)?.packages)-allAllocated(p,v));
  const fmtQuantity = (count,d) => d ? fmt(count)+' пак. × '+fmt(d.packageSize)+' '+esc(d.packageUnit)+' = '+fmt(count*d.packageSize)+' '+esc(d.packageUnit) : fmt(count)+' пак.';
  const rowsForFarm = () => state.allocations.filter(x=>String(x.gazdinstvo_id)===String(state.farmId));
  function messageForFarm() {
    const f=farm(state.farmId), rows=rowsForFarm().filter(x=>num(x.broj_pakovanja)>0);
    return 'Поштовани'+(f?.name?' '+f.name:'')+',\n\nМолимо вас да потврдите доступност за туру #'+tourId+':\n'+rows.map(r=>{
      const p=product(r.product_id),v=variant(r.variant_id),d=demand(r.product_id,r.variant_id);
      return '- '+(p?.name||'Производ')+' — '+(v?.name||v?.size_label||'Варијанта')+': '+fmtQuantity(r.broj_pakovanja,d);
    }).join('\n')+'\n\nМолимо да нам јавите колико паковања можете да обезбедите.\nХвала!';
  }
  function setNotice(msg,error=false){state.notice=msg;state.error=error;render();}
  async function load() {
    const data=await loadProcurementData({client,tourId});
    Object.assign(state,{tour:data.tour,items:data.items,products:data.products,variants:data.variants,offers:data.relevantOffers,allocations:data.allocations,farms:data.farms});
    state.demands=buildProcurementDemands({items:state.items,products:state.products,variants:state.variants});
    const eligible=state.offers.map(x=>String(x.gazdinstvo_id));
    const existing=state.allocations.map(x=>String(x.gazdinstvo_id));
    const all=[...new Set([...eligible,...existing])];
    if(!all.includes(String(state.farmId))) state.farmId=all[0]||'';
    const valid=state.demands.filter(d=>d.valid);
    if(!valid.some(d=>String(d.productId)===String(state.productId)&&String(d.variantId)===String(state.variantId))) {
      const first=valid.find(d=>offer(d.productId,d.variantId))||valid[0];
      state.productId=first?String(first.productId):'';state.variantId=first?String(first.variantId):'';
    }
  }
  function render() {
    if(state.disposed)return;
    const isWritable=state.tour?.status==='processing';
    const f=farm(state.farmId), farmRows=rowsForFarm();
    const totals=state.demands.reduce((a,d)=>({needed:a.needed+d.packages,quantity:a.quantity+d.totalQuantity}),{needed:0,quantity:0});
    const sums=state.allocations.reduce((a,r)=>({activated:a.activated+num(r.broj_pakovanja),ordered:a.ordered+num(r.naruceno_pakovanja),confirmed:a.confirmed+num(r.potvrdjeno_pakovanja),collected:a.collected+num(r.preuzeto_pakovanja)}),{activated:0,ordered:0,confirmed:0,collected:0});
    const currentDemand=demand(state.productId,state.variantId), currentOffer=offer(state.productId,state.variantId);
    const currentAllocation=allocation(state.productId,state.variantId);
    const maxAdd=remaining(state.productId,state.variantId)+(num(currentAllocation?.broj_pakovanja));
    const productsForFarm=state.demands.filter(d=>d.valid&&offer(d.productId,d.variantId));
    const productsHtml=productsForFarm.length?productsForFarm.map(d=>{
      const p=product(d.productId),v=variant(d.variantId),r=allocation(d.productId,d.variantId);
      return '<div class="ndp2-product"><div><strong>'+esc(p?.name||'Производ')+' · '+esc(v?.name||v?.size_label||'Варијанта')+'</strong><small>Потребно '+fmt(d.packages)+' пак. · Активирано '+fmt(allAllocated(d.productId,d.variantId))+' · Наручено '+fmt(state.allocations.filter(x=>pair(x.product_id,x.variant_id)===pair(d.productId,d.variantId)).reduce((s,x)=>s+num(x.naruceno_pakovanja),0))+'</small><div class="ndp2-muted">'+fmtQuantity(d.packages,d)+'</div></div><span class="ndp2-pill '+(r?'ok':'warn')+'">'+(r?'Унето':'Није додато')+'</span></div>';
    }).join(''):'<div class="ndp2-empty">Изабрано газдинство нема активну понуду за производе и варијанте потребне овој тури.</div>';
    const cartHtml=state.cart.length?state.cart.map((x,i)=>{const d=demand(x.productId,x.variantId);return '<div class="ndp2-cart-row"><div class="ndp2-rowhead"><div><strong>'+esc(product(x.productId)?.name)+' · '+esc(variant(x.variantId)?.name||variant(x.variantId)?.size_label)+'</strong><div class="ndp2-muted">'+fmt(x.count)+' паковања · '+fmtQuantity(x.count,d)+'</div></div><button class="ndp2-btn" data-action="remove-cart" data-index="'+i+'">Уклони</button></div></div>';}).join(''):'<div class="ndp2-empty">Корпа је празна. Изабери варијанту и додај количину.</div>';
    const recordsHtml=farmRows.length?farmRows.map(r=>{
      const d=demand(r.product_id,r.variant_id),p=product(r.product_id),v=variant(r.variant_id);
      return '<article class="ndp2-record"><div class="ndp2-rowhead"><div><strong>'+esc(p?.name||'Производ')+' · '+esc(v?.name||v?.size_label||'Варијанта')+'</strong><div class="ndp2-muted">Активирано '+fmt(r.broj_pakovanja)+' пак. · '+fmtQuantity(r.broj_pakovanja,d)+'</div></div><span class="ndp2-pill '+(r.viber_status==='replied'?'ok':r.viber_status==='sent'?'warn':'')+'">'+(r.viber_status==='replied'?'Потврдио произвођач':r.viber_status==='sent'?'Послато':'Није послато')+'</span></div><div class="ndp2-grid3"><span><b>'+fmt(r.naruceno_pakovanja)+'</b>Наручено</span><span><b>'+fmt(r.potvrdjeno_pakovanja)+'</b>Потврђено</span><span><b>'+fmt(r.preuzeto_pakovanja)+'</b>Преузето</span></div><div class="ndp2-record-grid"><label>Наручено паковања<input type="number" min="0" max="'+fmt(r.broj_pakovanja)+'" step="1" data-track="'+r.id+'" data-field="naruceno_pakovanja" value="'+fmt(r.naruceno_pakovanja)+'"></label><label>Потврђено паковања<input type="number" min="0" max="'+fmt(r.naruceno_pakovanja)+'" step="1" data-track="'+r.id+'" data-field="potvrdjeno_pakovanja" value="'+fmt(r.potvrdjeno_pakovanja)+'"></label><label>Преузето паковања<input type="number" min="0" max="'+fmt(r.potvrdjeno_pakovanja)+'" step="1" data-track="'+r.id+'" data-field="preuzeto_pakovanja" value="'+fmt(r.preuzeto_pakovanja)+'"></label></div><div class="ndp2-actions"><button class="ndp2-btn" data-action="save-tracking" data-id="'+r.id+'" '+(!isWritable||state.busy?'disabled':'')+'>Сачувај обрачун</button></div></article>';
    }).join(''):'<div class="ndp2-empty">За ово газдинство још нема сачуваних ставки набавке.</div>';
    host.innerHTML='<header class="ndp2-head"><div><div class="ndp2-kicker">НОВА ОПЕРАТИВНА НАБАВКА · ТУРА #'+esc(tourId)+'</div><h1>'+esc(state.tour?.naziv||'Тура #'+tourId)+'</h1><p>Газдинство → корпа захтева → Viber → преузимање</p></div><button class="ndp2-btn" data-action="back">← Назад</button></header>'+
    '<div class="ndp2-stats"><div class="ndp2-stat"><b>'+fmt(totals.needed)+'</b><span>Потребно паковања</span></div><div class="ndp2-stat"><b>'+fmt(sums.activated)+'</b><span>Активирано</span></div><div class="ndp2-stat"><b>'+fmt(sums.ordered)+'</b><span>Наручено</span></div><div class="ndp2-stat"><b>'+fmt(sums.confirmed)+'</b><span>Потврђено</span></div><div class="ndp2-stat"><b>'+fmt(sums.collected)+'</b><span>Преузето</span></div></div>'+
    (state.notice?'<div class="ndp2-notice '+(state.error?'error':'')+'" role="status">'+esc(state.notice)+'</div>':'')+
    (!isWritable?'<div class="ndp2-notice">Тура није у статусу processing. Подаци су доступни само за читање.</div>':'')+
    '<div class="ndp2-columns"><main>'+
    '<section class="ndp2-section ndp2-card"><h2>1. Изабери газдинство</h2><label>Газдинство<select data-farm>'+state.farms.map(x=>'<option value="'+esc(x.id)+'" '+(String(x.id)===String(state.farmId)?'selected':'')+'>'+esc(x.name)+'</option>').join('')+'</select></label><p>'+esc(f?.phone||'Телефон није наведен')+'</p><h2 style="margin-top:16px">Производи и варијанте за ово газдинство</h2>'+productsHtml+'</section>'+
    '<section class="ndp2-section ndp2-card"><h2>2. Корпа захтева</h2><div class="ndp2-form"><label>Производ<select data-product>'+[...new Set(productsForFarm.map(d=>String(d.productId)))].map(id=>'<option value="'+esc(id)+'" '+(String(state.productId)===id?'selected':'')+'>'+esc(product(id)?.name||'Производ')+'</option>').join('')+'</select></label><label>Варијанта<select data-variant>'+productsForFarm.filter(d=>String(d.productId)===String(state.productId)).map(d=>'<option value="'+esc(d.variantId)+'" '+(String(state.variantId)===String(d.variantId)?'selected':'')+'>'+esc(variant(d.variantId)?.name||variant(d.variantId)?.size_label||'Варијанта')+' · потребно '+fmt(d.packages)+'</option>').join('')+'</select></label><label>Број паковања<input type="number" min="1" step="1" inputmode="numeric" data-quantity value="'+esc(state.quantity)+'"></label><button class="ndp2-btn primary" data-action="add-cart" '+(!isWritable||!currentOffer||!currentDemand?.valid||state.busy?'disabled':'')+'>Додај у корпу</button></div><p class="ndp2-muted">Потребно: '+fmt(currentDemand?.packages)+' · Додељено другим/овом газдинству: '+fmt(allAllocated(state.productId,state.variantId))+' · Највише за ово газдинство: '+fmt(maxAdd)+'</p>'+cartHtml+'<div class="ndp2-actions"><button class="ndp2-btn primary" data-action="save-cart" '+(!state.cart.length||!isWritable||state.busy?'disabled':'')+'>'+(state.busy?'Чувам…':'Сачувај захтеве у базу')+'</button></div></section>'+
    '</main><aside class="ndp2-side">'+
    '<section class="ndp2-section ndp2-card"><h2>3. Viber захтев и статус</h2><textarea class="ndp2-message" readonly data-message>'+esc(messageForFarm())+'</textarea><div class="ndp2-actions"><button class="ndp2-btn" data-action="copy" '+(!farmRows.length?'disabled':'')+'>Копирај поруку</button><button class="ndp2-btn" data-action="viber" '+(!f?.phone||!farmRows.length?'disabled':'')+'>Отвори Viber</button></div><div class="ndp2-actions"><button class="ndp2-btn" data-action="mark-sent" '+(!farmRows.length||!isWritable||state.busy?'disabled':'')+'>Означи послато</button><button class="ndp2-btn" data-action="mark-replied" '+(!farmRows.length||!isWritable||state.busy?'disabled':'')+'>Потврђено од произвођача</button></div><p class="ndp2-foot">Viber се шаље ручно. Само копирање или отварање разговора не мења статус.</p></section>'+
    '<section class="ndp2-section ndp2-card"><h2>4. Теренско преузимање и обрачун</h2>'+recordsHtml+'</section></aside></div><div class="ndp2-foot">Извор: постојећа Supabase база · табела tura_nabavka_dodele · RLS активан · без нових табела</div>';
  }
  async function persistCart() {
    if(state.busy)return;
    if(state.tour?.status!=='processing')return setNotice('Измене су дозвољене само док је тура у статусу processing.',true);
    if(!state.cart.length)return;
    state.busy=true;render();let wrote=false;
    try {
      for(const item of state.cart) {
        const d=demand(item.productId,item.variantId),o=offer(item.productId,item.variantId),existing=allocation(item.productId,item.variantId);
        if(!d?.valid||!o)throw Error('Понуда или исправни подаци о паковању више нису доступни. Освежи податке.');
        const next=num(existing?.broj_pakovanja)+item.count;
        const others=allAllocated(item.productId,item.variantId)-num(existing?.broj_pakovanja);
        if(next+others>d.packages)throw Error('Захтев прелази потребну количину за '+(product(item.productId)?.name||'производ')+'.');
        if(existing) {
          const result=await client.from('tura_nabavka_dodele').update({broj_pakovanja:next,nabavna_cena:num(o.purchase_price),updated_at:new Date().toISOString()}).eq('id',existing.id).select('id,broj_pakovanja').maybeSingle();
          if(result.error)throw Error(result.error.message);if(!result.data||num(result.data.broj_pakovanja)!==next)throw Error('База није потврдила измену захтева.');
        } else {
          const result=await client.from('tura_nabavka_dodele').insert({tura_id:Number(tourId),product_id:item.productId,variant_id:item.variantId,gazdinstvo_id:Number(state.farmId),broj_pakovanja:item.count,nabavna_cena:num(o.purchase_price),naruceno:false,naruceno_pakovanja:0,potvrdjeno_pakovanja:0,preuzeto_pakovanja:0,viber_status:'not_sent'}).select('id,broj_pakovanja').single();
          if(result.error)throw Error(result.error.message);if(!result.data||num(result.data.broj_pakovanja)!==item.count)throw Error('База није потврдила нови захтев.');
        }
        wrote=true;
      }
      state.cart=[];await load();setNotice('Захтеви су сачувани и поново прочитани из базе.');
    } catch(e){if(wrote){try{await load();}catch(_){}}setNotice('Чување није у потпуности успело: '+(e.message||String(e)),true);}
    finally{state.busy=false;render();}
  }
  async function saveTracking(id) {
    if(state.busy)return;
    if(state.tour?.status!=='processing')return setNotice('Евиденција је само за читање док тура није у статусу processing.',true);
    const row=state.allocations.find(x=>String(x.id)===String(id));if(!row)return setNotice('Ставка није пронађена. Освежи податке.',true);
    const inputs=[...host.querySelectorAll('[data-track="'+id+'"]')];
    const values=Object.fromEntries(inputs.map(x=>[x.dataset.field,Number(x.value)]));
    const ordered=values.naruceno_pakovanja,confirmed=values.potvrdjeno_pakovanja,collected=values.preuzeto_pakovanja;
    if(![ordered,confirmed,collected].every(x=>Number.isInteger(x)&&x>=0)||ordered>num(row.broj_pakovanja)||confirmed>ordered||collected>confirmed)return setNotice('Услови нису испуњени: преузето ≤ потврђено ≤ наручено ≤ активирано. Количине морају бити цели ненегативни бројеви.',true);
    const d=demand(row.product_id,row.variant_id),siblings=state.allocations.filter(x=>pair(x.product_id,x.variant_id)===pair(row.product_id,row.variant_id));
    const confirmedOthers=siblings.filter(x=>String(x.id)!==String(id)).reduce((s,x)=>s+num(x.potvrdjeno_pakovanja),0);
    const collectedOthers=siblings.filter(x=>String(x.id)!==String(id)).reduce((s,x)=>s+num(x.preuzeto_pakovanja),0);
    if(confirmedOthers+confirmed>num(d?.packages)||collectedOthers+collected>num(d?.packages))return setNotice('Збир потврђених или преузетих паковања свих газдинстава не сме премашити потребу туре.',true);
    state.busy=true;render();
    try{
      const patch={naruceno_pakovanja:ordered,naruceno:ordered>0,potvrdjeno_pakovanja:confirmed,preuzeto_pakovanja:collected,updated_at:new Date().toISOString()};
      if(confirmed!==num(row.potvrdjeno_pakovanja)|| (confirmed>0&&!row.potvrdjeno_at))patch.potvrdjeno_at=confirmed>0?new Date().toISOString():null;
      const result=await client.from('tura_nabavka_dodele').update(patch).eq('id',row.id).select('id,naruceno_pakovanja,potvrdjeno_pakovanja,preuzeto_pakovanja').maybeSingle();
      if(result.error)throw Error(result.error.message);
      if(!result.data||num(result.data.naruceno_pakovanja)!==ordered||num(result.data.potvrdjeno_pakovanja)!==confirmed||num(result.data.preuzeto_pakovanja)!==collected)throw Error('База није потврдила све количине.');
      await load();setNotice('Обрачун је сачуван и потврђен читањем из базе.');
    }catch(e){setNotice('Обрачун није сачуван: '+(e.message||String(e)),true);}
    finally{state.busy=false;render();}
  }
  async function setViberStatus(status) {
    if(state.busy)return;if(state.tour?.status!=='processing')return setNotice('Статус се мења само док је тура у статусу processing.',true);
    const rows=rowsForFarm();if(!rows.length)return;
    state.busy=true;render();let changed=0;
    try{
      const now=new Date().toISOString();
      for(const row of rows){
        const patch={viber_status:status,updated_at:now};
        if(status==='sent'&&!row.viber_poslato_at)patch.viber_poslato_at=now;
        const result=await client.from('tura_nabavka_dodele').update(patch).eq('id',row.id).select('id,viber_status').maybeSingle();
        if(result.error)throw Error(result.error.message);if(!result.data||result.data.viber_status!==status)throw Error('База није потврдила Viber статус за ставку '+row.id+'.');changed++;
      }
      await load();setNotice(status==='sent'?'Слање ручно означено за изабрано газдинство.':'Одговор произвођача је евидентиран.');
    }catch(e){if(changed){try{await load();}catch(_){}}setNotice('Статус није у потпуности сачуван: '+(e.message||String(e)),true);}
    finally{state.busy=false;render();}
  }
  host.addEventListener('input',e=>{if(e.target.matches('[data-quantity]'))state.quantity=e.target.value;});
  host.addEventListener('change',e=>{
    if(e.target.matches('[data-farm]')){state.farmId=e.target.value;state.cart=[];render();}
    if(e.target.matches('[data-product]')){state.productId=e.target.value;const d=state.demands.find(x=>String(x.productId)===String(state.productId)&&x.valid&&offer(x.productId,x.variantId));state.variantId=d?String(d.variantId):'';render();}
    if(e.target.matches('[data-variant]')){state.variantId=e.target.value;render();}
  });
  host.addEventListener('click',async e=>{
    const b=e.target.closest('[data-action]');if(!b)return;const a=b.dataset.action;
    if(a==='back')return onBack?.();
    if(a==='add-cart'){
      const count=Number(state.quantity),d=demand(state.productId,state.variantId);
      if(!Number.isInteger(count)||count<=0)return setNotice('Унеси цео позитиван број паковања.',true);
      if(!d?.valid||!offer(state.productId,state.variantId))return setNotice('Изабрани производ нема исправну активну понуду за ово газдинство.',true);
      const already=state.cart.filter(x=>pair(x.productId,x.variantId)===pair(state.productId,state.variantId)).reduce((s,x)=>s+x.count,0);
      if(already+count>remaining(state.productId,state.variantId))return setNotice('Количина у корпи прелази преосталу потребу туре ('+fmt(remaining(state.productId,state.variantId))+' паковања).',true);
      const pending=state.cart.find(x=>pair(x.productId,x.variantId)===pair(state.productId,state.variantId));if(pending)pending.count+=count;else state.cart.push({productId:state.productId,variantId:state.variantId,count});state.notice='';render();return;
    }
    if(a==='remove-cart'){state.cart.splice(Number(b.dataset.index),1);render();return;}
    if(a==='save-cart')return persistCart();
    if(a==='save-tracking')return saveTracking(b.dataset.id);
    if(a==='mark-sent')return setViberStatus('sent');
    if(a==='mark-replied')return setViberStatus('replied');
    if(a==='copy'){try{await navigator.clipboard.writeText(messageForFarm());setNotice('Viber порука је копирана. Статус слања није промењен.');}catch(_){setNotice('Копирање није успело у овом прегледачу.',true);}return;}
    if(a==='viber'){const phone=String(farm(state.farmId)?.phone||'').replace(/[^\d+]/g,'');if(phone)location.href='viber://chat?number='+encodeURIComponent(phone);return;}
  });
  try{await load();if(state.disposed)return {destroy(){}};render();}
  catch(e){host.innerHTML='<div class="ndp2-empty"><strong>Набавка није учитана</strong><p>'+esc(e.message||String(e))+'</p><button class="ndp2-btn" data-action="back">Назад</button></div>';}
  return {destroy(){state.disposed=true;style.remove();root.replaceChildren();}};
}
