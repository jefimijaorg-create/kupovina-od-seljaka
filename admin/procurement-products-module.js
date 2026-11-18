/*
 * NARUČI DOMAĆE — PROCUREMENT PRODUCTS MODULE
 * Version: 1.0.2
 * Updated: 2026-11-18
 * Description: Fixes KPI quantity aggregation initialization and accumulation in the procurement operations dashboard.
 * Scope: ADMIN Workspace only; existing Supabase client, tables, RLS and triggers.
 */
import { mountProcurementManagement } from './procurement-management-panel.js';
import { loadProcurementData } from './data/admin-repository.js';
import { buildProcurementDemands } from './procurement/procurement-calculations.js';
const n=v=>Number.isFinite(Number(v))?Number(v):0;
const fmt=v=>n(v).toLocaleString('sr-RS',{maximumFractionDigits:3});
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const CSS=`
.nd-products-module{color:#e8eef8;background:#0b1426;border:1px solid #27364e;border-radius:22px;padding:14px;min-height:70vh}
.ndpm-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:8px 2px 16px}
.ndpm-kicker{color:#f5b978;font-size:10px;font-weight:900;letter-spacing:.16em}
.ndpm-head h1{font-size:clamp(22px,4vw,32px);line-height:1.1;margin:6px 0}
.ndpm-head p{margin:0;color:#91a1b8;font-size:13px}
.ndpm-back{min-height:44px;padding:0 14px;border:1px solid #35445c;border-radius:12px;background:#15233a;color:#f4c28d;font-weight:800}
.ndpm-kpis{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-bottom:14px}
.ndpm-kpi{padding:12px;border:1px solid #2b3b55;border-radius:15px;background:linear-gradient(145deg,#172740,#101c31)}
.ndpm-kpi b{display:block;color:#ffc58c;font-size:24px;line-height:1.15}
.ndpm-kpi span{display:block;color:#9cabc0;font-size:11px;margin-top:5px}
.ndpm-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;align-items:start}
.ndpm-main,.ndpm-side{min-width:0;border:1px solid #293952;border-radius:17px;background:#101c31;padding:12px}
.ndpm-section-title{font-size:14px;font-weight:900;margin:0 0 10px}
.ndpm-shortcuts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-bottom:12px}
.ndpm-shortcut{min-height:58px;text-align:left;padding:10px;border:1px solid #33445e;border-radius:13px;background:#0b1528;color:#e8eef8;font-weight:800}
.ndpm-shortcut small{display:block;color:#9aaac0;font-size:10px;font-weight:600;margin-top:4px}
.ndpm-shortcut[aria-pressed=true]{border-color:#c17a43;background:#33271f}
.ndpm-farm{padding:10px 0;border-top:1px solid #293952}
.ndpm-farm strong{display:block;font-size:13px}.ndpm-farm span{color:#9cabc0;font-size:11px}
.ndpm-empty{color:#9cabc0;font-size:12px;padding:12px;border:1px dashed #394a64;border-radius:12px}
.ndpm-engine .nd-proc-head,.ndpm-engine .nd-proc-notice:has(strong),.ndpm-engine .nd-proc-foot{display:none}
.ndpm-engine .nd-proc-tabs{position:sticky;top:0;z-index:2;background:#101c31;padding:6px 0}
.ndpm-engine .nd-proc-content{padding-top:8px}
.ndpm-engine .nd-proc-card,.ndpm-engine .nd-proc-farm-record{background:#0b1629;border-color:#2b3c56;border-radius:15px}
.ndpm-engine .nd-proc-metrics span,.ndpm-engine .nd-proc-allocation-recap span{background:#17263d;border-radius:12px}
.ndpm-engine .nd-proc-primary{min-height:48px;border-radius:12px}
@media(min-width:760px){.nd-products-module{padding:20px}.ndpm-kpis{grid-template-columns:repeat(4,minmax(0,1fr))}.ndpm-grid{grid-template-columns:minmax(0,1.7fr) minmax(260px,.8fr)}.ndpm-side{position:sticky;top:14px}.ndpm-shortcuts{grid-template-columns:1fr}}
@media(max-width:420px){.nd-products-module{padding:10px;border-radius:16px}.ndpm-kpi{padding:10px}.ndpm-kpi b{font-size:21px}}
`;
export async function mountProcurementProductsModule({root,core,tourId,onBack,initialProductId=null}){
 if(!root||!core?.client||!tourId)throw Error('Недостаје ADMIN контекст или ID туре.');
 if(!['admin','super_admin'].includes(core.getState?.()?.role))throw Error('Немате дозволу за управљање набавком.');
 const style=document.createElement('style');style.textContent=CSS;style.dataset.ndProcurementProducts='1';document.head.appendChild(style);
 root.innerHTML='<section class="nd-products-module"><div class="ndpm-empty">Учитавам оперативну таблу набавке…</div></section>';
 const host=root.querySelector('.nd-products-module');
 let engine=null,disposed=false;
 try{
  const data=await loadProcurementData({client:core.client,tourId});
  if(disposed)return {destroy(){}};
  const demands=buildProcurementDemands({items:data.items,products:data.products,variants:data.variants});
  const totals=demands.reduce((a,d)=>({needed:a.needed+d.packages,quantity:a.quantity+d.totalQuantity}),{needed:0,quantity:0}),alloc=data.allocations;
  const assigned=alloc.reduce((s,r)=>s+n(r.broj_pakovanja),0),ordered=alloc.reduce((s,r)=>s+n(r.naruceno_pakovanja),0),collected=alloc.reduce((s,r)=>s+n(r.preuzeto_pakovanja),0);
  const farms=new Map();for(const r of alloc){const id=String(r.gazdinstvo_id);if(!farms.has(id))farms.set(id,{a:0,o:0,c:0,p:0});const x=farms.get(id);x.a+=n(r.broj_pakovanja);x.o+=n(r.naruceno_pakovanja);x.c+=n(r.potvrdjeno_pakovanja);x.p+=n(r.preuzeto_pakovanja);}
  const farmHtml=[...farms].map(([id,x])=>{const farm=data.farms.find(v=>String(v.id)===id);return '<div class="ndpm-farm"><strong>'+esc(farm?.name||('Газдинство #'+id))+'</strong><span>Додељено '+fmt(x.a)+' · Наручено '+fmt(x.o)+' · Потврђено '+fmt(x.c)+' · Преузето '+fmt(x.p)+'</span></div>';}).join('');
  host.innerHTML='<header class="ndpm-head"><div><div class="ndpm-kicker">ОПЕРАТИВНА НАБАВКА · ТУРА #'+esc(tourId)+'</div><h1>'+esc(data.tour.naziv||('Тура #'+tourId))+'</h1><p>Производи · расподела · захтеви · потврде · преузимање</p></div><button class="ndpm-back" type="button" data-back>← Назад</button></header>'+
   '<section class="ndpm-kpis"><div class="ndpm-kpi"><b>'+fmt(totals.needed)+'</b><span>Потребно паковања</span></div><div class="ndpm-kpi"><b>'+fmt(assigned)+'</b><span>Активирано / распоређено</span></div><div class="ndpm-kpi"><b>'+fmt(ordered)+'</b><span>Наручено</span></div><div class="ndpm-kpi"><b>'+fmt(Math.max(0,totals.needed-ordered))+'</b><span>Преостало за наручивање</span></div></section>'+
   '<div class="ndpm-grid"><section class="ndpm-main"><h2 class="ndpm-section-title">Производи и расподела по газдинствима</h2><div class="ndpm-engine" data-engine></div></section><aside class="ndpm-side"><h2 class="ndpm-section-title">Оперативни ток</h2><div class="ndpm-shortcuts"><button class="ndpm-shortcut" data-tab="products" aria-pressed="true">Производи и расподела<small>Потребе и додела газдинствима</small></button><button class="ndpm-shortcut" data-tab="farms" aria-pressed="false">Потврде и преузимање<small>Наручено · потврђено · преузето</small></button><button class="ndpm-shortcut" data-tab="viber" aria-pressed="false">Корпа захтева и Viber<small>Спецификације по газдинству</small></button></div><h3 class="ndpm-section-title">Стање по газдинствима</h3>'+(farmHtml||'<div class="ndpm-empty">Још нема сачуваних расподела.</div>')+'<div class="ndpm-empty" style="margin-top:12px">Преузето укупно: <strong>'+fmt(collected)+' паковања</strong><br>Количина робе: '+fmt(totals.quantity)+' '+esc(demands[0]?.packageUnit||'')+'</div></aside></div>';
  host.querySelector('[data-back]').addEventListener('click',()=>onBack?.());
  const engineRoot=host.querySelector('[data-engine]'),legacy=await import('./procurement-management-panel.js');
  engine=await legacy.mountProcurementManagement({root:engineRoot,core,tourId,onBack:()=>onBack?.(),initialProductId});
  host.querySelectorAll('[data-tab]').forEach(button=>button.addEventListener('click',()=>{engineRoot.querySelector('[data-tab="'+button.dataset.tab+'"]')?.click();host.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));}));
 }catch(error){style.remove();host.innerHTML='<div class="ndpm-empty"><strong>Набавка није учитана</strong><p>'+esc(error.message||String(error))+'</p><button type="button" data-back>Назад</button></div>';host.querySelector('[data-back]')?.addEventListener('click',()=>onBack?.());}
 return {destroy(){disposed=true;engine?.destroy?.();style.remove();root.replaceChildren();}};
}
