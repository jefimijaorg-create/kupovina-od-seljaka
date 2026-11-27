/* ADMIN Nabavka · UX rekonstrukcija u postojećem modulu, sa postojećom Supabase šemom */
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const q=x=>Math.max(0,Number(x)||0),fmt=x=>q(x).toLocaleString('sr-RS',{maximumFractionDigits:2});
export async function mountProcurementProductsModule({root,core,tourId,onBack,initialStage='request',initialProductId=null}){
 if(!root||!core?.client||!tourId)throw Error('Недостаје ADMIN база или ID туре.');
 root.innerHTML='<section class="nd-proc-live"><div class="ndp-empty">Учитавам поруџбине и набавку…</div></section>';
 const db=core.client;let stage=({orders:1,request:2,confirm:3,pickup:4,shortage:1})[initialStage]||2,farmFilter='all',rows=[],items=[],orders=[],customers=[],products=[],variants=[],farms=[],tour=null,disposed=false;
 const fail=(r,l)=>{if(r.error)throw Error(l+': '+r.error.message);return r.data||[]};
 const sent=a=>a.viber_status==='sent'||Boolean(a.viber_poslato_at);
 const req=a=>q(a.naruceno_pakovanja)||q(a.broj_pakovanja);
 const conf=a=>Math.min(req(a),q(a.potvrdjeno_pakovanja));
 const rejected=a=>Math.min(Math.max(0,req(a)-conf(a)),q(a.odbijeno_pakovanja));
 const pending=a=>sent(a)?Math.max(0,req(a)-conf(a)-rejected(a)):0;
 const waitingFarm=a=>sent(a)?pending(a):req(a);
 const picked=a=>Math.min(conf(a),q(a.preuzeto_pakovanja));
 const toPick=a=>Math.max(0,conf(a)-picked(a));
 const pName=id=>products.find(x=>String(x.id)===String(id))?.name||'Производ';
 const vName=id=>{let v=variants.find(x=>String(x.id)===String(id));return v?.name||v?.size_label||([v?.package_value,v?.package_unit].filter(Boolean).join(' '))||'Амбалажа'};
 const fName=id=>farms.find(x=>String(x.id)===String(id))?.name||'Газдинство #'+id;
 const key=(p,v)=>String(p)+'|'+String(v);
 const groups=(arr,fn)=>{let m=new Map();arr.forEach(a=>{let k=key(a.product_id,a.variant_id);if(!m.has(k))m.set(k,{p:a.product_id,v:a.variant_id,rows:[]});m.get(k).rows.push(a)});return [...m.values()].map(g=>({...g,total:fn?g.rows.reduce((s,a)=>s+q(fn(a)),0):0}))};
 const allGroupRows=g=>rows.filter(a=>key(a.product_id,a.variant_id)===key(g.p,g.v));
 const groupRows=g=>allGroupRows(g).filter(a=>farmFilter==='all'||String(a.gazdinstvo_id)===String(farmFilter));
 const demandGroups=()=>groups(items,a=>a.package_count??a.broj_pakovanja??a.kolicina).filter(g=>farmFilter==='all'||groupRows(g).length>0||String(products.find(p=>String(p.id)===String(g.p))?.gazdinstvo_id)===String(farmFilter));
 const sums=g=>{let r=groupRows(g),all=allGroupRows(g);return {P:g.total,R:r.reduce((s,a)=>s+req(a),0),pending:r.reduce((s,a)=>s+waitingFarm(a),0),K:r.reduce((s,a)=>s+conf(a),0),U:r.reduce((s,a)=>s+picked(a),0),free:Math.max(0,g.total-all.reduce((s,a)=>s+req(a),0)),pickup:r.reduce((s,a)=>s+toPick(a),0),short:Math.max(0,g.total-all.reduce((s,a)=>s+req(a),0))}};
 async function load(){
  let tr=await db.from('ture').select('id,naziv,status').eq('id',tourId).maybeSingle();if(tr.error)throw tr.error;if(!tr.data)throw Error('Тура није пронађена.');tour=tr.data;
  items=fail(await db.from('stavke_porudzbine').select('id,porudzbina_id,product_id,variant_id,package_count,broj_pakovanja,package_size,package_unit,recipient_name,proizvod,kolicina,jedinica,gazdinstvo_id').eq('tura_id',tourId),'Поруџбине');
  let orderIds=[...new Set(items.map(x=>x.porudzbina_id).filter(Boolean))];orders=orderIds.length?fail(await db.from('porudzbine').select('id,kupac_id').in('id',orderIds),'Купци поруџбина'):[];let customerIds=[...new Set(orders.map(x=>x.kupac_id).filter(Boolean))];customers=customerIds.length?fail(await db.from('kupci').select('id,ime_prezime').in('id',customerIds),'Имена купаца'):[];items=items.map(x=>({...x,customer_name:customers.find(k=>String(k.id)===String(orders.find(o=>String(o.id)===String(x.porudzbina_id))?.kupac_id))?.ime_prezime}));
  rows=fail(await db.from('tura_nabavka_dodele').select('id,tura_id,product_id,variant_id,gazdinstvo_id,broj_pakovanja,nabavna_cena,naruceno,naruceno_pakovanja,potvrdjeno_pakovanja,odbijeno_pakovanja,preuzeto_pakovanja,viber_status,viber_poslato_at,potvrdjeno_at,isporuceno_pakovanja').eq('tura_id',tourId).order('id'),'Набавка');
  let ids=[...new Set([...items,...rows].map(x=>x.product_id).filter(Boolean))],vids=[...new Set([...items,...rows].map(x=>x.variant_id).filter(Boolean))],fids=[...new Set(rows.map(x=>x.gazdinstvo_id).filter(Boolean))];
  products=ids.length?fail(await db.from('products').select('id,name,gazdinstvo_id,producer_name,purchase_price').in('id',ids),'Производи'):[];
  variants=vids.length?fail(await db.from('product_variants').select('id,product_id,name,size_label,package_value,package_unit,unit').in('id',vids),'Амбалажа'):[];
  fids=[...new Set([...fids,...products.map(x=>x.gazdinstvo_id)].filter(Boolean))];
  farms=fids.length?fail(await db.from('gazdinstva').select('id,name,phone,is_active').in('id',fids),'Газдинства'):[];
 }
 const css=`
 .nd-proc-live{--ink:#20312a;--muted:#718078;--line:#e1e9e2;--bg:#f4f7f4;--green:#285b3c;--orange:#e99a36;--blue:#377fbd;--red:#d94b4b;font:14px/1.4 system-ui,-apple-system,sans-serif;color:var(--ink);max-width:1050px;margin:auto;padding:8px 10px 90px}
 .nd-proc-live *{box-sizing:border-box}.ndp-head{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 2px 12px}.ndp-head small{font-size:10px;color:var(--green);font-weight:900;letter-spacing:.05em}.ndp-head h2{font-size:21px;margin:2px 0;font-weight:900}.ndp-count{background:#e8f1eb;color:var(--green);padding:8px 11px;border-radius:12px;font-weight:900;white-space:nowrap}
 .ndp-obligations{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;margin:5px 0 12px}.ndp-tile{border:1px solid var(--line);border-radius:12px;background:white;padding:10px 8px;text-align:left;cursor:pointer;min-width:0}.ndp-tile b{display:block;font-size:20px}.ndp-tile small{display:block;font-size:10px;font-weight:800;line-height:1.25}.ndp-tile.active{outline:2px solid currentColor}.ndp-tile.orange{color:#a9610b;background:#fff7eb;border-color:#f1d4a9}.ndp-tile.blue{color:#246da8;background:#eff7ff;border-color:#c9e1f5}.ndp-tile.red{color:#bd3434;background:#fff1f1;border-color:#f3cccc}
 .ndp-farms{display:flex;gap:6px;overflow:auto;padding:2px 0 9px}
 
 .nd-proc-live{max-width:1280px!important;width:100%;padding:0 12px 12px!important;background:#EEF2EC;--ink:#132218;--muted:#526358;--line:#D5DFD5;--green:#1B4332}
 .ndp-tabletbar{height:48px;background:#1B4332;color:#fff;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:0 12px;margin:0 -12px 10px;position:sticky;top:0;z-index:20}
 .ndp-brand{display:flex;align-items:center;gap:8px;white-space:nowrap}.ndp-brand b{font-size:13px;font-weight:900}.ndp-brand span{font-size:10px;font-weight:750;background:#ffffff20;padding:4px 7px;border-radius:99px}
 .ndp-module-tabs{display:flex;align-items:center;gap:3px;overflow:auto;scrollbar-width:none}.ndp-module-tabs span,.ndp-module-tabs b{font-size:11px;font-weight:750;padding:7px 9px;white-space:nowrap}.ndp-module-tabs b{background:#fff;color:#1B4332;border-radius:7px}
 .ndp-top-actions{display:flex;gap:5px;white-space:nowrap}.ndp-top-actions .ndp-btn{height:30px;padding:0 9px;font-size:10px}
 .ndp-toolbar{position:sticky;top:48px;background:#EEF2EC;z-index:15;padding:2px 0 7px}
 .ndp-obligations{grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:0 0 7px}.ndp-tile{height:50px;display:flex;align-items:center;justify-content:space-between;padding:5px 10px;border-radius:10px}.ndp-tile small{font-size:10px}.ndp-tile.green{color:#15803D;background:#DCFCE7;border-color:#b9e3c5}
 .ndp-farmsbar{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:34px}.ndp-farms{gap:6px;padding:0;overflow-x:auto;scrollbar-width:none}.ndp-farms::-webkit-scrollbar,.ndp-module-tabs::-webkit-scrollbar{display:none}.ndp-farms button{height:32px;padding:0 12px;font-size:11px}
 .ndp-farm-phone-visible{display:flex;align-items:center;gap:8px;background:#e4f2e8;border:1px solid #bddac6;border-radius:99px;padding:3px 5px 3px 10px;white-space:nowrap;font-size:11px}.ndp-farm-phone-visible span{font-weight:850;color:#1B4332}.ndp-farm-phone-visible .btn-call-farm{height:26px;padding:0 9px;font-size:10px}
 .ndp-split{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(300px,1fr);gap:12px;align-items:start}
 .ndp-left{min-width:0}.ndp-products-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
 .ndp-product-card{background:#fff;border:1px solid #D5DFD5;border-radius:14px;padding:10px 11px;min-width:0;box-shadow:0 1px 2px #183b2410}
 .ndp-product-cardhead{display:flex;align-items:center;justify-content:space-between;gap:6px;border-bottom:1px solid #E6ECE6;padding:0 0 8px;margin-bottom:7px}.ndp-product-cardhead strong{font-size:14px;font-weight:900}.ndp-product-total{background:#E6F2EC;color:#1B4332;border:1px solid #B7D8C6;padding:3px 7px;border-radius:99px;font-size:11px;font-weight:900;white-space:nowrap}
 .ndp-packline{display:flex;align-items:center;justify-content:space-between;gap:6px;width:100%;border:1px solid #E3EAE3;background:#F7F9F6;border-radius:9px;padding:7px;margin:0 0 6px;text-align:left;cursor:pointer;color:#132218}.ndp-packline:last-child{margin-bottom:0}.ndp-packline.selected{border-color:#1B4332;background:#E6F2EC}
 .ndp-packdesc{display:flex;flex-direction:column;gap:3px;min-width:0}.ndp-packdesc b{font-size:11px}.ndp-packdesc small{font-size:9px;color:#526358;line-height:1.25}.ndp-pack-farms{max-width:220px;overflow-wrap:anywhere}
 .ndp-pack-badges{display:flex;flex-direction:column;align-items:flex-end;gap:3px;flex-shrink:0}.ndp-pack-badges .st-pill{font-size:9px;padding:3px 5px}.ndp-pack-badges small{font-size:8px;color:#526358;text-align:right}
 .ndp-sidepanel{position:sticky;top:108px;min-width:0;background:#fff;border:1px solid #D5DFD5;border-radius:14px;padding:11px;max-height:calc(100dvh - 120px);overflow:auto;box-shadow:0 2px 5px #183b2408}
 .ndp-selected-head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:10px}.ndp-selected-head small{font-size:9px;color:#526358;font-weight:900}.ndp-selected-head h3{font-size:15px;margin:2px 0}.ndp-selected-head span{font-size:11px;color:#526358}.ndp-selected-head>b{font-size:11px;color:#1B4332;background:#E6F2EC;border-radius:8px;padding:6px;white-space:nowrap}
 .ndp-panel-tabs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:3px;padding:3px;background:#F7F9F6;border-radius:9px;margin-bottom:9px}.ndp-panel-tabs button{border:0;border-radius:6px;background:transparent;padding:7px 3px;font-size:9px;font-weight:850;color:#526358;cursor:pointer}.ndp-panel-tabs button.active{background:white;color:#1B4332;box-shadow:0 1px 3px #0001}.ndp-panel-tabs button.alert{color:#B91C1C;background:#FEE2E2}
 .ndp-sidepanel .ndp-panel{padding:9px;background:#F7F9F6}.ndp-sidepanel .ndp-line{gap:5px;flex-wrap:wrap}.ndp-sidepanel .ndp-line>span{min-width:0;flex:1}.ndp-sidepanel .ndp-input{width:58px;padding:6px}.ndp-sidepanel .ndp-btn{padding:7px 9px;font-size:10px}
 @media(min-width:768px) and (max-width:1280px){.ndp-split{grid-template-columns:minmax(0,1.7fr) minmax(285px,1fr)}.ndp-sidepanel{top:108px}}
 @media(max-width:900px){.ndp-split{grid-template-columns:minmax(0,1fr)}.ndp-sidepanel{position:fixed;z-index:10001;left:0;right:0;bottom:0;top:auto;max-height:78dvh;border-radius:18px 18px 0 0;box-shadow:0 -8px 30px #0002;padding:14px;display:none}.ndp-sidepanel.is-open{display:block}.ndp-products-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
 @media(max-width:650px){.ndp-products-grid{grid-template-columns:1fr}.ndp-tabletbar{height:auto;min-height:48px;flex-wrap:wrap;padding:7px 10px}.ndp-module-tabs{order:3;width:100%}.ndp-toolbar{top:48px}.ndp-obligations{grid-template-columns:repeat(2,minmax(0,1fr))}.ndp-farmsbar{align-items:flex-start;flex-direction:column}.ndp-farm-phone-visible{max-width:100%;flex-wrap:wrap;border-radius:12px}.ndp-top-actions .ndp-btn{font-size:9px}.ndp-pack-badges .st-pill{white-space:normal;text-align:right}}

 .ndp-products-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;align-items:start}
 .ndp-products-grid>.ndp-product{margin:0;min-width:0}
 .ndp-farm-contact{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:12px 14px;margin:8px 0;border:1px solid var(--line);border-radius:14px;background:#fff}
 .ndp-farm-contact strong{display:block;font-size:14px}
 .ndp-farm-contact small{display:block;color:var(--muted);font-size:11px;margin-top:3px}
 .ndp-farm-phone{display:inline-flex;align-items:center;gap:7px;padding:9px 12px;border-radius:10px;background:#e8f1eb;color:var(--green);font-weight:900;text-decoration:none;white-space:nowrap}
 @media(max-width:650px){.ndp-products-grid{grid-template-columns:minmax(0,1fr)}}.ndp-farms button{border:1px solid var(--line);background:white;border-radius:99px;padding:8px 12px;white-space:nowrap;font-size:12px;font-weight:850;color:var(--ink)}.ndp-farms button.active{background:var(--green);color:white;border-color:var(--green)}
 .ndp-copy{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 12px}.ndp-btn{border:0;border-radius:10px;padding:10px 13px;background:var(--green);color:white;font-weight:850;font-size:12px;cursor:pointer}.ndp-btn.secondary{background:#e8f1eb;color:var(--green)}.ndp-btn.orange{background:var(--orange);color:#38230c}.ndp-btn:disabled{opacity:.45}
 .ndp-product{border:1px solid var(--line);border-radius:15px;background:white;margin:9px 0;overflow:hidden}.ndp-product-head{padding:12px 14px;display:flex;justify-content:space-between;align-items:center;gap:8px;background:#fbfdfb}.ndp-product-head h3{font-size:15px;margin:0;font-weight:900}.ndp-product-head small{font-size:11px;color:var(--muted);display:block;margin-top:3px}.ndp-variant{padding:12px;border-top:1px solid var(--line)}.ndp-vtitle{display:flex;justify-content:space-between;gap:8px;align-items:center;font-weight:900;font-size:13px;margin-bottom:9px}.ndp-action{font-size:11px;font-weight:900;color:#a9610b;background:#fff4e4;border:1px solid #f0d3a5;padding:5px 8px;border-radius:99px;white-space:nowrap}
 .ndp-stages{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:5px}.ndp-stage{border:1px solid var(--line);background:#f7faf7;border-radius:9px;padding:7px 3px;text-align:center;cursor:pointer;color:var(--ink);min-width:0}.ndp-stage b{font-size:14px;display:block}.ndp-stage small{display:block;font-size:9px;line-height:1.2;font-weight:800;margin-top:3px}.ndp-stage[data-open="1"]{border-color:var(--green);box-shadow:inset 0 0 0 1px var(--green)}.ndp-stage.warn{background:#fff6e8;border-color:#f1d3a6;color:#9c5c10}.ndp-stage.wait{background:#eff7ff;border-color:#c9e1f5;color:#246da8}.ndp-stage.bad{background:#fff0f0;border-color:#f0cccc;color:#bc3737}.ndp-stage.done{background:#eaf4ed;border-color:#c6dccb;color:#285b3c}
 .ndp-panel{background:#f7faf7;border-top:1px solid var(--line);padding:12px}
 .ndp-sheet-backdrop{position:fixed;inset:0;background:rgba(18,32,24,.42);z-index:10000;display:flex;align-items:flex-end;justify-content:center}
 .ndp-sheet{width:min(100%,760px);max-height:82dvh;overflow:auto;background:#f7faf7;border-radius:20px 20px 0 0;padding:12px 14px calc(18px + env(safe-area-inset-bottom));box-shadow:0 -8px 30px rgba(0,0,0,.16);animation:ndp-sheet-up .18s ease-out}
 .ndp-sheet-handle{width:38px;height:4px;border-radius:99px;background:#c7d2c9;margin:0 auto 12px}
 .ndp-sheet-top{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:8px}
 .ndp-sheet-top h3{font-size:17px;margin:0;font-weight:900}
 .ndp-sheet-close{border:0;border-radius:99px;background:#e6eee8;color:#285b3c;font-weight:900;font-size:20px;width:36px;height:36px;cursor:pointer}
 .ndp-sheet .ndp-variant{border:0;padding:0}
 @keyframes ndp-sheet-up{from{transform:translateY(30px);opacity:.6}to{transform:translateY(0);opacity:1}}
 @media(min-width:700px){.ndp-sheet-backdrop{align-items:center;padding:20px}.ndp-sheet{border-radius:20px;max-height:80vh}}.ndp-panel h4{margin:0 0 8px;font-size:13px}.ndp-line{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 0;border-top:1px solid var(--line)}.ndp-line:first-of-type{border-top:0}.ndp-line small{display:block;color:var(--muted);font-size:11px}.ndp-input{width:72px;border:1px solid #cbd8ce;border-radius:8px;padding:8px;text-align:center;font-size:16px;font-weight:900;background:white}.ndp-empty{padding:18px;text-align:center;color:var(--muted);background:white;border:1px dashed var(--line);border-radius:12px}


 /* Три јасна бројчана показатеља на картици производа */
 .ndp-quantity-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px;margin-top:8px;max-width:440px}
 .ndp-quantity-summary>span{display:flex;flex-direction:column;gap:2px;padding:6px 8px;border:1px solid #e4ebe5;border-radius:8px;background:#f6f9f6;min-width:0}
 .ndp-quantity-summary em{font-style:normal;font-size:9px;line-height:1.2;font-weight:750;color:#6d7d72;white-space:normal}
 .ndp-quantity-summary b{font-size:15px;line-height:1.2;color:#263b2d;font-weight:900}
 .ndp-quantity-summary .is-free{background:#fff6e8;border-color:#f0d7b0}
 .ndp-quantity-summary .is-free b{color:#a9610b}
 .ndp-quantity-summary .is-zero{background:#edf5ef;border-color:#d5e5d8}
 .ndp-quantity-summary .is-zero b{color:#285b3c}
 @media(max-width:520px){.ndp-quantity-summary{gap:4px;margin-top:7px}.ndp-quantity-summary>span{padding:5px 6px}.ndp-quantity-summary em{font-size:8px}.ndp-quantity-summary b{font-size:14px}}

 /* Финално визуелно уједначавање картица производа: јасна типографија, без прегломазних елемената */
 .ndp-product{margin:8px 0;border-radius:14px;border-color:#e2e9e3;box-shadow:0 1px 2px rgba(28,55,38,.035)}
 .ndp-product-head{padding:11px 13px!important;min-height:72px;align-items:center}
 .ndp-product-head h3{font-size:16px;line-height:1.25;letter-spacing:-.2px;color:#23382c}
 .ndp-product-head small{font-size:11px;line-height:1.55;margin-top:5px;color:#65766b}
 .ndp-action{font-size:10px;line-height:1.25;padding:7px 9px;max-width:142px;text-align:center;white-space:normal;flex:0 0 auto;border-radius:10px}
 .ndp-product-head>span:first-child{min-width:0;flex:1}
 .ndp-variant{padding:10px 12px}
 .ndp-vtitle{font-size:12px;margin-bottom:7px}
 .ndp-stages{gap:5px}
 .ndp-stage{padding:8px 3px;border-radius:9px}
 .ndp-stage b{font-size:15px;font-weight:850}
 .ndp-stage small{font-size:9px;letter-spacing:-.1px}
 .ndp-panel{border-radius:11px;padding:11px}
 .ndp-panel h4{font-size:13px;color:#30483a}
 .ndp-line{padding:9px 0}
 .ndp-line b{font-size:13px}
 .ndp-line small{font-size:10px;line-height:1.45}
 .ndp-empty{font-size:12px}
 @media(max-width:520px){
  .ndp-product-head{padding:10px 11px!important;min-height:68px}
  .ndp-product-head h3{font-size:15px}
  .ndp-product-head small{font-size:10px;line-height:1.5}
  .ndp-action{font-size:9px;padding:6px 7px;max-width:112px}
  .ndp-variant{padding:9px}
  .ndp-stage b{font-size:14px}
  .ndp-stage small{font-size:8px}
 }
\n @media(max-width:520px){.ndp-obligations{grid-template-columns:repeat(2,minmax(0,1fr))}.ndp-stages{gap:3px}.ndp-stage{padding:7px 1px}.ndp-stage small{font-size:8px}.ndp-stage b{font-size:13px}.ndp-head h2{font-size:18px}}
 `;
 let style=document.createElement('style');style.dataset.ndProcUx='1';style.textContent=css;document.head.appendChild(style);
 let expanded=new Set(),opened=new Map(),inputs=new Map(),events=new AbortController();
 const tileCounts=()=>{let gs=groups(items,a=>a.package_count??a.broj_pakovanja??a.kolicina);return {free:gs.reduce((s,g)=>s+Math.max(0,g.total-allGroupRows(g).reduce((n,a)=>n+req(a),0)),0),pending:rows.reduce((s,a)=>s+waitingFarm(a),0),pickup:rows.reduce((s,a)=>s+toPick(a),0),short:gs.reduce((s,g)=>s+Math.max(0,g.total-allGroupRows(g).reduce((n,a)=>n+req(a),0)),0)}};
 function actionFor(g){let s=sums(g),list=farmFilter==='all'?allGroupRows(g):groupRows(g),notSent=list.filter(x=>!sent(x)).reduce((n,x)=>n+req(x),0);if(s.P<=0)return {label:'Наручено: 0',stage:1,kind:'done'};if(notSent>0)return {label:'За слање газдинству · '+fmt(notSent),stage:3,kind:'blue'};if(s.pending>0)return {label:'Чека одговор газдинства · '+fmt(s.pending),stage:3,kind:'blue'};if(s.pickup>0)return {label:'Потврђено за преузимање · '+fmt(s.pickup),stage:4,kind:'orange'};if(s.free>0)return {label:(s.R>0?'Вишак за доделу · ':'Додели газдинству · ')+fmt(s.free),stage:2,kind:'orange'};if(s.short>0)return {label:'Недостаје за купце · '+fmt(s.short),stage:1,kind:'red'};return {label:'Завршено',stage:5,kind:'done'}}
 function panel(g,step){let a=groupRows(g).filter(x=>farmFilter==='all'||String(x.gazdinstvo_id)===String(farmFilter));let html='<div class="ndp-panel"><h4>'+['','Купци · Наручено','Требовање · Расподела','Чека одговор газдинства','Потврђено за преузимање','Преузето'][step]+'</h4>';
 if(step===1){let buyers=items.filter(x=>key(x.product_id,x.variant_id)===key(g.p,g.v));html+=buyers.map(x=>'<div class="ndp-line"><span>Купац '+esc(x.customer_name||(x.recipient_name&&x.recipient_name!=='Glavna porudžbina'?x.recipient_name:'поруџбина #'+x.porudzbina_id))+'<small>Поруџбина #'+esc(x.porudzbina_id||'—')+'</small></span><b>'+fmt(x.package_count??x.broj_pakovanja??x.kolicina)+' пак.</b></div>').join('')||'<small>Нема детаља купаца у овим ставкама.</small>'}
 if(step===2){if(farmFilter!=='all'){html+='<p><small>Требовање овог газдинства: <b>'+fmt(s.R)+'</b> паковања. Овде се не приказује слободна количина нити се аутоматски додељује ново газдинство.</small></p>'}else{html+='<p><small>Слободно за требовање у целој тури: <b>'+fmt(sums(g).free)+'</b> паковања.</small></p>'}html+=a.map(x=>'<div class="ndp-line"><span>'+esc(fName(x.gazdinstvo_id))+'<small>Додељено '+fmt(req(x))+' · послато '+(sent(x)?'да':'не')+'</small></span><button class="ndp-btn secondary" data-sent="'+x.id+'">'+(sent(x)?'Послато ✓':'Означи послато')+'</button></div>').join('');if(farmFilter==='all'){let owner=products.find(x=>String(x.id)===String(g.p))?.gazdinstvo_id,eligible=owner&&farms.some(f=>String(f.id)===String(owner));if(sums(g).free>0&&eligible){let existing=rows.find(x=>key(x.product_id,x.variant_id)===key(g.p,g.v)&&String(x.gazdinstvo_id)===String(owner));html+='<div class="ndp-line"><span><b>Додели слободну количину</b><small>'+esc(fName(owner))+' · расположиво '+fmt(sums(g).free)+' пак.</small></span><span><input class="ndp-input" type="number" min="1" max="'+sums(g).free+'" value="'+sums(g).free+'" data-alloc-input="'+esc(key(g.p,g.v))+'"><button class="ndp-btn" data-allocate="'+esc(key(g.p,g.v))+'" data-farmid="'+esc(owner)+'" data-existing="'+esc(existing?.id||'')+'">Додели</button></span></div>'}if(!a.length&&!eligible)html+='<div class="ndp-empty">За овај производ база не наводи повезано газдинство. Нећу нагађати добављача; додај расподелу кроз постојећи прозор производа.</div>'}}
 if(step===3){let wait=a.filter(x=>waitingFarm(x)>0);html+=wait.map(x=>!sent(x)?'<div class="ndp-line"><span>'+esc(fName(x.gazdinstvo_id))+'<small>Додељено '+fmt(req(x))+' · није послато</small></span><button class="ndp-btn" data-sent="'+x.id+'">Означи као послато</button></div>':'<div class="ndp-line"><span>'+esc(fName(x.gazdinstvo_id))+'<small>Послато '+fmt(req(x))+' · чека потврду '+fmt(pending(x))+'</small></span><span><input class="ndp-input" type="number" min="0" max="'+pending(x)+'" value="'+pending(x)+'" data-confirm-input="'+x.id+'"><button class="ndp-btn" data-confirm="'+x.id+'">ОК</button></span></div>').join('')||'<div class="ndp-empty">Нема захтева који чекају газдинство.</div>'}
 if(step===4){let ready=a.filter(x=>toPick(x)>0);html+=ready.map(x=>'<div class="ndp-line"><span>'+esc(fName(x.gazdinstvo_id))+'<small>Потврђено '+fmt(conf(x))+' · остаје '+fmt(toPick(x))+'</small></span><span><input class="ndp-input" type="number" min="0" max="'+conf(x)+'" value="'+toPick(x)+'" data-pick-input="'+x.id+'"><button class="ndp-btn" data-pick="'+x.id+'">Сачувај</button></span></div>').join('')||'<div class="ndp-empty">Нема потврђене робе за преузимање.</div>'}
 if(step===5){html+=a.map(x=>'<div class="ndp-line"><span>'+esc(fName(x.gazdinstvo_id))+'<small>Преузето '+fmt(picked(x))+' од потврђених '+fmt(conf(x))+'</small></span><b>'+(picked(x)===conf(x)?'✓':'Остало '+fmt(toPick(x)))+'</b></div>').join('')||'<small>Нема евидентираних количина.</small>'}
 return html+'</div>'}
 function render(){
  if(disposed)return;
  const c=tileCounts(),ob=c.free+c.pending+c.pickup;
  let gs=demandGroups().filter(g=>{let z=sums(g);if(stage===2)return z.P>0&&z.free>0;if(stage===3)return z.pending>0;if(stage===4)return z.pickup>0; if(stage===1)return z.short>0;return true});
  const farmIds=[...new Set([...rows.map(x=>x.gazdinstvo_id),...products.map(x=>x.gazdinstvo_id)].filter(Boolean).map(String))];
  const activeFarms=farms.filter(f=>farmIds.includes(String(f.id)));
  const selectedKey=window.__ndpSelectedKey||null;
  let selected=selectedKey?demandGroups().find(g=>key(g.p,g.v)===selectedKey):null;
  if(!selected&&gs.length)selected=gs[0];
  if(selected)window.__ndpSelectedKey=key(selected.p,selected.v);
  const measure=(g,count)=>{
   const v=variants.find(x=>String(x.id)===String(g.v)),sample=allGroupRows(g)[0]||items.find(x=>key(x.product_id,x.variant_id)===key(g.p,g.v))||{};
   const n=Number(v?.package_value??sample.package_size??0),unit=String(v?.package_unit??sample.package_unit??v?.unit??sample.jedinica??'').toLowerCase();
   if(!n||!unit)return '';
   const u=unit.includes('l')?'l':unit.includes('kg')?'kg':unit.includes('g')?'g':unit.includes('kom')?'kom':unit;
   return fmt(count*n)+' '+u;
  };
  const statusRows=g=>allGroupRows(g).filter(a=>farmFilter==='all'||String(a.gazdinstvo_id)===String(farmFilter));
  const header='<div class="ndp-tabletbar"><div class="ndp-brand"><b>NARUČI DOMAĆE</b><span>ТУРА #'+esc(tourId)+' · '+esc(tour?.naziv||'Недеља')+'</span></div><div class="ndp-module-tabs"><span>Porudžbine</span><span>Proizvodi</span><b>Nabavka</b><span>Dostava</span><span>Dugovanja</span></div><div class="ndp-top-actions"><button class="ndp-btn secondary" data-copy-all>📋 Viber spisak</button><button class="ndp-btn secondary" data-back>← Nazad</button></div></div>';
  let h=header+'<div class="ndp-toolbar"><div class="ndp-obligations">'+[['free','Za dodelu',c.free,2,'orange'],['pending','Čeka odgovor',c.pending,3,'blue'],['pickup','Za preuzimanje',c.pickup,4,'green'],['short','Manjak kupaca',c.short,1,'red']].map(x=>'<button class="ndp-tile '+x[4]+' '+(stage===x[3]?'active':'')+'" data-stage="'+x[3]+'"><b>'+fmt(x[2])+'</b><small>'+x[1]+'</small></button>').join('')+'</div>';
  h+='<div class="ndp-farmsbar"><div class="ndp-farms"><button class="'+(farmFilter==='all'?'active':'')+'" data-farm="all">Sva gazdinstva</button>'+activeFarms.map(f=>'<button class="'+(String(farmFilter)===String(f.id)?'active':'')+'" data-farm="'+f.id+'">'+esc(f.name)+'</button>').join('')+'</div>';
  if(farmFilter!=='all'){let f=farms.find(x=>String(x.id)===String(farmFilter)),phone=String(f?.phone||'').trim();h+='<div class="ndp-farm-phone-visible"><b>'+esc(f?.name||fName(farmFilter))+'</b><span>Telefon: '+(phone?esc(phone):'није унет у базу')+'</span>'+(phone?'<a class="btn-call-farm" href="tel:'+esc(phone)+'">☎ Pozovi gazdinstvo</a>':'')+'</div>'}
  h+='</div></div><div class="ndp-split"><section class="ndp-left"><div class="ndp-products-grid">';
  const productIds=[...new Set(gs.map(g=>String(g.p)))];
  productIds.forEach(pid=>{
   const pg=products.find(p=>String(p.id)===pid),pGroups=gs.filter(g=>String(g.p)===pid);
   if(!pGroups.length)return;
   const allP=demandGroups().filter(g=>String(g.p)===pid),orderedTotal=allP.reduce((n,g)=>n+g.total,0);
   let units=new Set(allP.map(g=>{let v=variants.find(x=>String(x.id)===String(g.v));return String(v?.package_unit||v?.unit||'')}));
   const totalMeasure=units.size===1?allP.map(g=>measure(g,g.total)).filter(Boolean).join(' + '):fmt(orderedTotal)+' пак.';
   h+='<article class="ndp-product-card"><header class="ndp-product-cardhead"><strong>'+esc(pg?.name||pName(pid))+'</strong><span class="ndp-product-total">'+esc(totalMeasure||fmt(orderedTotal)+' пак.')+'</span></header>';
   pGroups.sort((a,b)=>{let va=variants.find(v=>String(v.id)===String(a.v)),vb=variants.find(v=>String(v.id)===String(b.v));return Number(vb?.package_value||0)-Number(va?.package_value||0)}).forEach(g=>{
    const keyg=key(g.p,g.v),r=statusRows(g),assigned=r.reduce((n,a)=>n+req(a),0),sentQty=r.filter(sent).reduce((n,a)=>n+req(a),0),unordered=Math.max(0,g.total-sentQty),confirmed=r.reduce((n,a)=>n+conf(a),0),pickedQty=r.reduce((n,a)=>n+picked(a),0),calc=measure(g,g.total),isSelected=keyg===window.__ndpSelectedKey;
    h+='<button class="ndp-packline '+(isSelected?'selected':'')+'" data-select-pack="'+esc(keyg)+'"><span class="ndp-packdesc"><b>'+esc(vName(g.v))+'</b><small>'+fmt(g.total)+' пак.'+(calc?' · '+esc(calc):'')+'</small><small class="ndp-pack-farms">'+r.filter(a=>req(a)>0).map(a=>esc(fName(a.gazdinstvo_id))+': '+fmt(req(a))+' (потв. '+fmt(conf(a))+')').join(' · ')+'</small></span><span class="ndp-pack-badges"><em class="st-pill st-ordered">Поручено '+fmt(sentQty)+(measure(g,sentQty)?' ('+esc(measure(g,sentQty))+')':'')+'</em><em class="st-pill '+(unordered?'st-unordered':'st-done')+'">'+(unordered?'Непоручено '+fmt(unordered)+(measure(g,unordered)?' ('+esc(measure(g,unordered))+')':''):'✓ Све поручено')+'</em><small>Додељено '+fmt(assigned)+' · потв. '+fmt(confirmed)+' · преузето '+fmt(pickedQty)+'</small></span></button>';
   });
   h+='</article>';
  });
  h+='</div></section><aside class="ndp-sidepanel">';
  if(selected){
   let k=key(selected.p,selected.v),step=opened.get(k)||2;
   h+='<div class="ndp-selected-head"><div><small>ИЗАБРАНА АМБАЛАЖА</small><h3>'+esc(pName(selected.p))+'</h3><span>'+esc(vName(selected.v))+'</span></div><b>'+fmt(selected.total)+' пак. '+(measure(selected,selected.total)?'· '+esc(measure(selected,selected.total)):'')+'</b></div><div class="ndp-panel-tabs">'+[['Требовање',2],['Потврда',3],['Преузимање',4],['Купци (мањак)',1]].map(x=>'<button class="'+(step===x[1]?'active':'')+(x[1]===1&&sums(selected).short?' alert':'')+'" data-open="'+x[1]+'" data-key="'+esc(k)+'">'+x[0]+'</button>').join('')+'</div>';
   h+=panel(selected,step);
  }else h+='<div class="ndp-empty">Изабери производ и паковање са леве стране.</div>';
  h+='</aside></div>';
  root.querySelector('.nd-proc-live').innerHTML=h;
 }
  async function saveRow(id,patch,verify){let r=await db.from('tura_nabavka_dodele').update({...patch,updated_at:new Date().toISOString()}).eq('id',id).select('*').maybeSingle();if(r.error)throw r.error;if(!r.data||Object.entries(verify).some(([k,v])=>String(r.data[k])!==String(v)))throw Error('База није потврдила измену.');rows=rows.map(a=>String(a.id)===String(id)?r.data:a)}
 async function copyFarm(id){let a=rows.filter(x=>String(x.gazdinstvo_id)===String(id)&&req(x)>0);let msg='Захтев за набавку · тура '+tourId+'\n'+fName(id)+'\n\n'+a.map(x=>pName(x.product_id)+' · '+vName(x.variant_id)+': '+fmt(req(x))+' пак.').join('\n')+'\n\nМолим потврду количина.';try{await navigator.clipboard.writeText(msg);alert('Списак је копиран. Пошаљи га газдинству.')}catch{alert(msg)}}
 root.addEventListener('click',async e=>{if(e.target.matches('[data-sheet-backdrop]')){let k=e.target.getAttribute('data-sheet-backdrop');expanded.delete(k);opened.delete(k);render();return}let b=e.target.closest('button');if(!b)return;try{b.disabled=true;if(b.hasAttribute('data-back')){onBack?.();return}if(b.dataset.stage){stage=Number(b.dataset.stage);render();return}if(b.dataset.actionStage){let k=b.dataset.productAction;stage=Number(b.dataset.actionStage);expanded.add(k);opened.set(k,stage);render();return}if(b.dataset.farm!==undefined){farmFilter=b.dataset.farm;render();return}if(b.dataset.closeSheet){expanded.delete(b.dataset.closeSheet);opened.delete(b.dataset.closeSheet);render();return}
if(b.dataset.expand){let k=b.dataset.expand;expanded.has(k)?expanded.delete(k):expanded.add(k);render();return}if(b.dataset.open){let k=b.dataset.key;opened.set(k,Number(b.dataset.open));render();return}if(b.dataset.copyFarm){await copyFarm(b.dataset.copyFarm);return}if(b.dataset.allocate){let g=demandGroups().find(x=>key(x.p,x.v)===b.dataset.allocate),sel=root.querySelector('[data-target-farm="'+b.dataset.allocate+'"]'),owner=b.dataset.selectfarm?Number(sel?.value):Number(b.dataset.farmid),v=Number(root.querySelector('[data-alloc-input="'+b.dataset.allocate+'"]').value),max=sums(g).free;if(!owner||String(owner)===String(farmFilter))throw Error('Изабери друго газдинство за слободну количину.');if(!Number.isInteger(v)||v<1||v>max)throw Error('Количина мора бити цео број од 1 до '+max+'.');let product=products.find(x=>String(x.id)===String(g.p)),existing=rows.find(x=>key(x.product_id,x.variant_id)===key(g.p,g.v)&&String(x.gazdinstvo_id)===String(owner)&&!sent(x));if(!confirm('Доделити '+v+' паковања газдинству '+fName(owner)+'? Захтев још није послат.'))return;let result=existing?await db.from('tura_nabavka_dodele').update({broj_pakovanja:req(existing)+v,updated_at:new Date().toISOString()}).eq('id',existing.id).select('*').maybeSingle():await db.from('tura_nabavka_dodele').insert({tura_id:Number(tourId),product_id:g.p,variant_id:g.v,gazdinstvo_id:Number(owner),broj_pakovanja:v,nabavna_cena:q(product?.purchase_price),naruceno:false,naruceno_pakovanja:0,potvrdjeno_pakovanja:0,preuzeto_pakovanja:0}).select('*').maybeSingle();if(result.error)throw result.error;if(!result.data)throw Error('База није потврдила нову расподелу.');rows=existing?rows.map(x=>String(x.id)===String(existing.id)?result.data:x):[...rows,result.data];render();return}if(b.dataset.sent){let a=rows.find(x=>String(x.id)===b.dataset.sent);if(!a)return;if(!confirm('Означити захтев као послат?'))return;await saveRow(a.id,{naruceno:true,naruceno_pakovanja:req(a),viber_status:'sent',viber_poslato_at:new Date().toISOString()},{naruceno:true});render();return}if(b.dataset.confirm){let a=rows.find(x=>String(x.id)===b.dataset.confirm),v=Number(root.querySelector('[data-confirm-input="'+a.id+'"]').value),max=pending(a);if(!Number.isInteger(v)||v<0||v>max)throw Error('Унеси цео број од 0 до '+max+'.');let freed=max-v;if(!confirm('Потврђено '+v+' паковања. Мањак '+freed+' се враћа у слободно требовање. Сачувати?'))return;let newReq=req(a)-freed,newConf=conf(a)+v,newReject=rejected(a)+freed;await saveRow(a.id,{broj_pakovanja:newReq,naruceno_pakovanja:newReq,potvrdjeno_pakovanja:newConf,odbijeno_pakovanja:newReject,naruceno:true,potvrdjeno_at:new Date().toISOString()},{broj_pakovanja:newReq,potvrdjeno_pakovanja:newConf,odbijeno_pakovanja:newReject});render();return}if(b.dataset.pick){let a=rows.find(x=>String(x.id)===b.dataset.pick),v=Number(root.querySelector('[data-pick-input="'+a.id+'"]').value),max=conf(a);if(!Number.isInteger(v)||v<0||v>max)throw Error('Унеси цео број од 0 до '+max+'.');await saveRow(a.id,{preuzeto_pakovanja:v,isporuceno_pakovanja:v},{preuzeto_pakovanja:v});render();return}}catch(err){alert(err.message||String(err))}finally{b.disabled=false}},{signal:events.signal});
 try{await load();if(disposed)return;render()}catch(e){root.innerHTML='<div class="ndp-empty"><b>Набавка није учитана</b><p>'+esc(e.message||e)+'</p><button class="ndp-btn" data-retry>Покушај поново</button></div>';root.addEventListener('click',e=>{if(e.target.closest('[data-retry]'))mountProcurementProductsModule({root,core,tourId,onBack,initialStage,initialProductId})},{once:true})}
 return {destroy(){disposed=true;events.abort();root.replaceChildren();style.remove()},async refresh(){await load();render()}};
}