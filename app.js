const SUPABASE_URL='https://kszkehxrcuagymlfowqj.supabase.co';
const SUPABASE_ANON_KEY='sb_publishable_TRZp6skXsdIUsE4Vl65_2Q_QskFb532';
const headers={'apikey':SUPABASE_ANON_KEY,'Authorization':'Bearer '+SUPABASE_ANON_KEY,'Content-Type':'application/json'};
const state=JSON.parse(localStorage.getItem('seljaciState')||'{}');
state.cart=state.cart||[];state.delivery=state.delivery||'punkt';state.point=state.point||null;
const save=()=>localStorage.setItem('seljaciState',JSON.stringify(state));
const money=n=>new Intl.NumberFormat('sr-RS',{minimumFractionDigits:0,maximumFractionDigits:2}).format(Number(n)||0)+' RSD';
const api=async(path)=>{const r=await fetch(SUPABASE_URL+'/rest/v1/'+path,{headers});if(!r.ok)throw new Error(await r.text());return r.json()};
function cartCount(){const e=document.getElementById('cartCount');if(e)e.textContent=state.cart.reduce((s,x)=>s+x.qty,0)}
function add(p){const x=state.cart.find(i=>i.id===p.id);if(x)x.qty++;else state.cart.push({id:p.id,name:p.name,price:Number(p.price)||0,unit:p.unit||'kom',qty:1});save();cartCount();renderProducts()}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}

async function renderNextDelivery(){
 const title=document.getElementById('deliveryTitle'),info=document.getElementById('deliveryInfo');if(!title)return;
 try{const rows=await api('ture?select=id,naziv,datum,status,kapacitet&status=in.(open,scheduled)&datum=gte.'+new Date().toISOString().slice(0,10)+'&order=datum.asc,id.desc&limit=1');if(!rows.length){title.textContent='Нема заказане следеће доставе';if(info)info.textContent='';return}const t=rows[0],d=new Date(t.datum+'T12:00:00');title.textContent=d.toLocaleDateString('sr-RS',{weekday:'long',day:'numeric',month:'long'});if(info)info.textContent=(t.naziv||'Следећа тура')+' • поруџбине су отворене'}catch(e){title.textContent='Следећа достава';if(info)info.textContent='Провера података...'}}
async function renderProducts(){
 const box=document.getElementById('products');if(!box)return;
 try{const fields='id,name,description,category,price,currency,stock,unit,image_url,producer_name,is_active,gazdinstvo_id,has_variants';const ps=await api('products?select='+fields+'&is_active=eq.true&order=name.asc&limit=100');box.innerHTML=ps.map(p=>'<article class="product">'+(p.image_url?'<img src="'+esc(p.image_url)+'" alt="" loading="lazy" style="width:100%;height:150px;object-fit:cover;border-radius:12px;margin-bottom:12px">':'')+'<h3>'+esc(p.name||'Производ')+'</h3><div class="meta">'+esc(p.description||p.producer_name||p.unit||'Домаћи производ')+'</div><div class="price">'+money(p.price)+'</div><div class="meta">'+(Number(p.stock)>0?'Доступно: '+p.stock+' '+esc(p.unit||'ком'):'Количина се договара')+(p.has_variants?' • више варијанти':'')+'</div><button class="btn primary" data-add="'+esc(p.id)+'">Додај</button></article>').join('');box.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>{const p=ps.find(x=>String(x.id)===b.dataset.add);if(p)add(p)});const s=document.getElementById('productStatus');if(s)s.textContent=ps.length+' производа из Supabase-а'}catch(e){const s=document.getElementById('productStatus');if(s)s.textContent='Грешка при учитавању';box.innerHTML='<div class="card"><b>Производи тренутно нису доступни.</b></div>'}}
async function renderPoints(){
 const box=document.getElementById('points');if(!box)return;
 try{
  const ps=await api('punktovi?select=id,name,city,address,latitude,longitude,is_active,description,viber_group,maps_url,vreme,aktivan,slug&order=sort_order.asc&limit=100');
  const active=ps.filter(p=>String(p.is_active).toLowerCase()!=='false'&&String(p.aktivan).toLowerCase()!=='false');
  box.innerHTML=active.map(p=>'<button class="point '+(state.point?.id==p.id?'active':'')+'" data-id="'+p.id+'"><strong>'+esc(p.name||p.address||'Пункт')+'</strong><small>'+esc(p.address||p.city||'')+(p.vreme?' • '+esc(p.vreme):'')+'</small></button>').join('');
  const map=L.map('map',{zoomControl:false,scrollWheelZoom:false}).setView([44.78,20.45],11);L.control.zoom({position:'topright'}).addTo(map);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap'}).addTo(map);
  const markers={};
  active.forEach(p=>{const lat=Number(p.latitude),lng=Number(p.longitude);if(!Number.isFinite(lat)||!Number.isFinite(lng))return;const m=L.marker([lat,lng]).addTo(map);markers[p.id]=m;m.bindTooltip(esc(p.name||'Пункт'),{direction:'top',offset:[0,-8]});});
  const select=p=>{state.point=p;save();box.querySelectorAll('.point').forEach(x=>x.classList.toggle('active',x.dataset.id==p.id));const lat=Number(p.latitude),lng=Number(p.longitude);if(Number.isFinite(lat)&&Number.isFinite(lng)){map.setView([lat,lng],16,{animate:true});if(markers[p.id])markers[p.id].openPopup()}const card=document.getElementById('mapCard');if(card){card.classList.remove('hidden');card.innerHTML='<strong>'+esc(p.name||'Пункт')+'</strong><span>'+esc([p.address,p.city].filter(Boolean).join(', '))+'</span>'+(p.vreme?'<span>🕒 '+esc(p.vreme)+'</span>':'')+(p.description?'<p>'+esc(p.description)+'</p>':'')+(p.maps_url?'<a target="_blank" rel="noopener" href="'+esc(p.maps_url)+'">Отвори у Google Maps ↗</a>':'');}updateContinue()};
  box.querySelectorAll('.point').forEach(b=>b.onclick=()=>{const p=active.find(x=>String(x.id)===b.dataset.id);if(p)select(p)});
  document.getElementById('pointStatus').textContent=active.length+' пунктова';
  if(state.point){const p=active.find(x=>String(x.id)===String(state.point.id));if(p)select(p)}
 }catch(e){document.getElementById('pointStatus').textContent='Пунктови нису доступни';box.innerHTML='<div class="card">Нема учитаних пунктова.</div>';console.error(e)}
}
function updateContinue(){const b=document.getElementById('continue');if(b)b.disabled=!state.point||!state.cart.length}
function initMap(){document.querySelectorAll('.delivery').forEach(b=>b.onclick=()=>{state.delivery=b.dataset.method;save();document.querySelectorAll('.delivery').forEach(x=>x.classList.remove('active'));b.classList.add('active')});const b=document.getElementById('continue');if(b)b.onclick=()=>location.href='potvrdi.html';renderPoints();updateContinue();cartCount()}
function initConfirm(){const s=document.getElementById('deliverySummary');if(s)s.textContent=(state.delivery==='punkt'?'Преузимање на пункту: ':'Преузимање по договору: ')+(state.point?.name||state.point?.address||'изабрано место');const i=document.getElementById('orderItems');if(i)i.innerHTML=state.cart.length?state.cart.map(x=>'<div class="order-row"><span>'+esc(x.name)+' × '+x.qty+'</span><b>'+money(x.price*x.qty)+'</b></div>').join(''):'Нема производа.';const f=document.getElementById('orderForm');if(f)f.onsubmit=e=>{e.preventDefault();const d=new FormData(f),r=document.getElementById('result');r.classList.remove('hidden');localStorage.setItem('lastOrder',JSON.stringify({customer:{ime:d.get('name'),telefon:d.get('phone')},state}));r.textContent='Поруџбина је припремљена.'};cartCount()}
const page=document.body.dataset.page;if(page==='home'){cartCount();renderNextDelivery();renderProducts()}if(page==='map')initMap();if(page==='confirm')initConfirm();