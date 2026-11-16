/* NARUCI DOMACE — namenski radni panel jednog proizvoda.
   Koristi postojece globalne Supabase/API i poslovne funkcije iz pregled-ture.html. */
(function(){
 'use strict';
 const ID='nd-product-procurement-panel';
 let activeProductId='',activeTab='demand',busy=false;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const num=v=>Number(v||0);
 const fmt=v=>num(v).toLocaleString('sr-RS',{maximumFractionDigits:3});
 const demand=()=>typeof procurementDemandData==='function'?procurementDemandData():[];
 const product=()=>demand().find(p=>String(p.rows?.[0]?.productId)===String(activeProductId));
 const allocations=()=>Array.isArray(tourAllocations)?tourAllocations.filter(a=>String(a.tura_id)===String(tourId)&&String(a.product_id)===String(activeProductId)):[];

 function ensure(){
  if(document.getElementById(ID))return;
  const style=document.createElement('style');
  style.textContent=`
  #${ID}[hidden]{display:none!important}#${ID}{position:fixed;inset:0;z-index:135;background:rgba(2,6,23,.84);backdrop-filter:blur(7px);display:flex;align-items:flex-end;justify-content:center}
  #${ID} .ndp-dialog{width:100%;max-width:820px;max-height:92dvh;overflow:auto;background:#111c32;color:#f8fafc;border:1px solid #334155;border-radius:22px 22px 0 0;padding:0 14px calc(20px + env(safe-area-inset-bottom));box-shadow:0 -15px 50px rgba(0,0,0,.45)}
  #${ID} .ndp-head{position:sticky;top:0;z-index:2;background:#111c32;border-bottom:1px solid #334155;margin:0 -14px 14px;padding:14px;display:flex;align-items:center;justify-content:space-between;gap:12px}
  #${ID} .ndp-kicker{font-size:10px;font-weight:900;letter-spacing:.14em;color:#f4b36f}
  #${ID} h2{font-size:22px;font-weight:900;line-height:1.2;margin-top:5px}
  #${ID} .ndp-close{min-width:44px;min-height:44px;border-radius:12px;border:1px solid #475569;background:#1e293b;color:#fdba74;font-size:23px}
  #${ID} .ndp-tabs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-bottom:14px}
  #${ID} .ndp-tab{min-height:48px;padding:8px 5px;border:1px solid #334155;border-radius:12px;background:#0b1426;color:#aab8cc;font-size:11px;font-weight:800}
  #${ID} .ndp-tab[aria-selected=true]{background:rgba(234,88,12,.16);border-color:#c77b3e;color:#ffd09d}
  #${ID} .ndp-card{border:1px solid #334155;background:#0c1629;border-radius:15px;padding:13px;margin:9px 0}
  #${ID} .ndp-row{display:flex;align-items:center;justify-content:space-between;gap:12px}
  #${ID} .ndp-muted{color:#9eacc1;font-size:12px;line-height:1.5}
  #${ID} .ndp-value{font-weight:900;color:#f7c58f}
  #${ID} .ndp-action{width:100%;min-height:48px;border-radius:12px;padding:11px 14px;background:#9a4d20;color:white;font-weight:900;margin-top:12px}
  #${ID} .ndp-empty{padding:18px;text-align:center;color:#9eacc1;border:1px dashed #475569;border-radius:14px;font-size:13px}
  @media(min-width:768px){#${ID}{align-items:center;padding:20px}#${ID} .ndp-dialog{border-radius:22px;max-height:86dvh}}
  `;
  document.head.appendChild(style);
  const root=document.createElement('div');root.id=ID;root.hidden=true;
  root.innerHTML='<section class="ndp-dialog" role="dialog" aria-modal="true" aria-labelledby="ndp-title"><header class="ndp-head"><div><div class="ndp-kicker">НАБАВКА · РАДНИ ПАНЕЛ ПРОИЗВОДА</div><h2 id="ndp-title">Производ</h2><div id="ndp-tour" class="ndp-muted"></div></div><button class="ndp-close" type="button" aria-label="Затвори">×</button></header><nav class="ndp-tabs" aria-label="Целине набавке"><button class="ndp-tab" data-tab="demand" aria-selected="true">1. Потражња</button><button class="ndp-tab" data-tab="allocation" aria-selected="false">2. Расподела</button><button class="ndp-tab" data-tab="confirmed" aria-selected="false">3. Потврђена набавка</button></nav><div id="ndp-content" aria-live="polite"></div></section>';
  root.querySelector('.ndp-close').addEventListener('click',close);
  root.addEventListener('click',e=>{if(e.target===root)close()});
  root.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>{activeTab=b.dataset.tab;render()}));
  document.body.appendChild(root);
 }
 function close(){const root=document.getElementById(ID);if(root)root.hidden=true;document.body.classList.remove('nd-product-panel-open')}
 function setTab(tab){activeTab=tab;render()}
 function render(){
  const root=document.getElementById(ID),p=product(),content=root?.querySelector('#ndp-content');
  if(!root||!p||!content)return;
  root.querySelector('#ndp-title').textContent=p.name||'Производ';
  const tour=(Array.isArray(tours)?tours:[]).find(t=>String(t.id)===String(tourId));
  root.querySelector('#ndp-tour').textContent=(tour?.naziv||('Тура '+tourId))+' · У реализацији';
  root.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.tab===activeTab)));
  const saved=allocations();
  if(activeTab==='demand'){
   content.innerHTML='<div class="ndp-card"><div class="ndp-kicker">УКУПНА ПОТРАЖЊА</div><div class="ndp-row" style="margin-top:7px"><strong style="font-size:25px">'+fmt(p.packages)+' паковања</strong><strong class="ndp-value">'+fmt(p.total)+' '+esc(p.rows[0]?.unit||'')+'</strong></div><div class="ndp-muted">Подаци се читају из ставки поруџбина за изабрану туру.</div></div>'+p.rows.map(r=>'<article class="ndp-card"><div class="ndp-row"><strong>'+esc(fmt(r.size)+' '+r.unit)+'</strong><span class="ndp-value">'+fmt(r.packages)+' пак.</span></div><div class="ndp-muted">'+fmt(r.packages)+' паковања × '+fmt(r.size)+' '+esc(r.unit)+' = <b>'+fmt(r.total)+' '+esc(r.unit)+'</b> · '+fmt(r.orders)+' поруџбина</div></article>').join('');
  }else if(activeTab==='allocation'){
   const sum=saved.reduce((s,a)=>s+num(a.broj_pakovanja),0);
   content.innerHTML='<div class="ndp-card"><div class="ndp-kicker">РАСПОДЕЛА ПО ГАЗДИНСТВИМА</div><div class="ndp-row" style="margin-top:7px"><strong>'+saved.length+' ставки</strong><strong class="ndp-value">'+fmt(sum)+' паковања</strong></div><div class="ndp-muted">Требовања се воде по производу, амбалажи и газдинству. Viber поруке се припремају у постојећем радном току.</div></div>'+(saved.map(a=>{const f=(farms||[]).find(x=>String(x.id)===String(a.gazdinstvo_id))||{};const v=(variantCatalog||[]).find(x=>String(x.id)===String(a.variant_id))||{};return '<article class="ndp-card"><div class="ndp-row"><strong>'+esc(f.name||('Газдинство #'+a.gazdinstvo_id))+'</strong><span class="ndp-value">'+fmt(a.broj_pakovanja)+' пак.</span></div><div class="ndp-muted">'+esc(v.name||v.size_label||'Амбалажа')+' · '+(a.naruceno?'Наручено':'У припреми')+'</div></article>'}).join('')||'<div class="ndp-empty">За овај производ још нема сачуване расподеле.</div>')+'<button class="ndp-action" id="ndp-edit-allocation" '+(busy?'disabled':'')+'>+ Додај газдинство / измени расподелу</button>';
   content.querySelector('#ndp-edit-allocation')?.addEventListener('click',()=>{if(typeof tourCanEditProcurement!=='function'||!tourCanEditProcurement()){say('Расподела је доступна само док је тура у реализацији.',true);return}close();openProcurementAllocation(activeProductId)});
  }else{
   const confirmed=saved.filter(a=>a.naruceno===true&&a.potvrdjeno_pakovanja!==null&&a.potvrdjeno_pakovanja!==undefined);
   const count=confirmed.reduce((s,a)=>s+num(a.potvrdjeno_pakovanja),0);
   content.innerHTML='<div class="ndp-card"><div class="ndp-kicker">СТВАРНО ПОТВРЂЕНА НАБАВКА</div><div class="ndp-row" style="margin-top:7px"><strong style="font-size:25px">'+fmt(count)+' паковања</strong><strong class="ndp-value">'+confirmed.length+' потврда</strong></div><div class="ndp-muted">Приказују се количине које су добављачи стварно потврдили и које су сачуване у бази.</div></div>'+(confirmed.map(a=>{const f=(farms||[]).find(x=>String(x.id)===String(a.gazdinstvo_id))||{};const v=(variantCatalog||[]).find(x=>String(x.id)===String(a.variant_id))||{};return '<article class="ndp-card"><div class="ndp-row"><strong>'+esc(f.name||('Газдинство #'+a.gazdinstvo_id))+'</strong><strong class="ndp-value">'+fmt(a.potvrdjeno_pakovanja)+' пак.</strong></div><div class="ndp-muted">'+esc(v.name||v.size_label||'Амбалажа')+' · Потврђено</div></article>'}).join('')||'<div class="ndp-empty">Још нема евидентираних потврда добављача за овај производ.</div>')+'<button class="ndp-action" id="ndp-confirm-procurement">Отвори радни ток за потврду набавке</button>';
   content.querySelector('#ndp-confirm-procurement')?.addEventListener('click',()=>{if(typeof tourCanEditProcurement!=='function'||!tourCanEditProcurement()){say('Потврда набавке је доступна само док је тура у реализацији.',true);return}close();openProcurementAllocation(activeProductId)});
  }
 }
 async function open(productId){
  if(typeof tourCanEditProcurement!=='function'||!tourCanEditProcurement()){openProcurementDemandDetail(productId);return}
  activeProductId=String(productId||'');activeTab='demand';ensure();
  const root=document.getElementById(ID),content=root.querySelector('#ndp-content');
  root.hidden=false;document.body.classList.add('nd-product-panel-open');
  content.innerHTML='<div class="ndp-empty">Учитавање података производа…</div>';
  try{
   const rows=await api('tura_nabavka_dodele?select=*&tura_id=eq.'+encodeURIComponent(tourId)+'&product_id=eq.'+encodeURIComponent(activeProductId)+'&order=id.asc');
   if(!Array.isArray(rows))throw Error('База није вратила исправну расподелу.');
   tourAllocations=[...(tourAllocations||[]).filter(a=>!(String(a.tura_id)===String(tourId)&&String(a.product_id)===activeProductId)),...rows];
   if(!product())throw Error('Производ није пронађен у потражњи изабране туре.');
   render();
  }catch(e){content.innerHTML='<div class="ndp-empty">Подаци нису учитани: '+esc(e.message||String(e))+'</div>'}
 }
 window.openProcurementProductPanel=open;
 window.NDProductProcurementPanel={open,close};
})();