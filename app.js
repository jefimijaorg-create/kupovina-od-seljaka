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

async function renderProducts(){
  const box=document.getElementById('products');if(!box)return;
  try{
    const fields='id,name,description,category,price,currency,stock,unit,image_url,producer_name,is_active,gazdinstvo_id,has_variants';
    const ps=await api('products?select='+fields+'&is_active=eq.true&order=name.asc&limit=100');
    box.innerHTML=ps.map(p=>{
      const stock=Number(p.stock);
      const stockText=stock>0?'Доступно: '+stock+' '+esc(p.unit||'ком'):'Количина се договара';
      return '<article class="product">'+
        (p.image_url?'<img src="'+esc(p.image_url)+'" alt="" loading="lazy" style="width:100%;height:150px;object-fit:cover;border-radius:12px;margin-bottom:12px">':'')+
        '<h3>'+esc(p.name||'Производ')+'</h3>'+
        '<div class="meta">'+esc(p.description||p.producer_name||p.unit||'Домаћи производ')+'</div>'+
        '<div class="price">'+money(p.price)+'</div>'+
        '<div class="meta">'+stockText+(p.has_variants?' • више варијанти':'')+'</div>'+
        '<button class="btn primary" data-add="'+esc(p.id)+'">Додај</button>'+
      '</article>';
    }).join('');
    box.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>{
      const p=ps.find(x=>String(x.id)===b.dataset.add);
      if(p)add(p);
    });
    const status=document.getElementById('productStatus');
    if(status)status.textContent=ps.length+' производа из Supabase-а';
  }catch(e){
    const status=document.getElementById('productStatus');if(status)status.textContent='Грешка при учитавању';
    box.innerHTML='<div class="card"><b>Производи тренутно нису доступни.</b><p>Провери везу са Supabase базом.</p></div>';
    console.error('Supabase products:',e);
  }
}

async function renderPoints(){
  const box=document.getElementById('points');if(!box)return;
  try{
    const ps=await api('punktovi?select=*&limit=100');
    box.innerHTML=ps.map(p=>'<button class="point '+(state.point?.id==p.id?'active':'')+'" data-id="'+p.id+'"><strong>'+esc(p.name||p.naziv||p.address||'Пункт')+'</strong><small>'+esc(p.address||p.adresa||'')+'</small></button>').join('');
    box.querySelectorAll('.point').forEach(b=>b.onclick=()=>{state.point=ps.find(p=>String(p.id)===b.dataset.id);save();renderPoints();updateContinue()});
    document.getElementById('pointStatus').textContent=ps.length+' понуђених пунктова';
    if(window.L){
      const map=L.map('map').setView([44.78,20.45],11);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
      ps.forEach(p=>{const lat=Number(p.latitude),lng=Number(p.longitude);if(Number.isFinite(lat)&&Number.isFinite(lng))L.marker([lat,lng]).addTo(map).bindPopup(esc(p.name||p.address||'Пункт'));});
    }
  }catch(e){
    document.getElementById('pointStatus').textContent='Пунктови се још повезују';
    box.innerHTML='<div class="card">Нема учитаних пунктова.</div>';
  }
}
function updateContinue(){const b=document.getElementById('continue');if(b)b.disabled=!state.point||!state.cart.length}
function initMap(){
  document.querySelectorAll('.delivery').forEach(b=>b.onclick=()=>{state.delivery=b.dataset.method;save();document.querySelectorAll('.delivery').forEach(x=>x.classList.remove('active'));b.classList.add('active')});
  const b=document.getElementById('continue');if(b)b.onclick=()=>location.href='potvrdi.html';
  renderPoints();updateContinue();cartCount();
}
function initConfirm(){
  const summary=document.getElementById('deliverySummary');
  if(summary)summary.textContent=(state.delivery==='punkt'?'Преузимање на пункту: ':'Преузимање по договору: ')+(state.point?.name||state.point?.address||'изабрано место');
  const items=document.getElementById('orderItems');
  if(items)items.innerHTML=state.cart.length?state.cart.map(i=>'<div class="order-row"><span>'+esc(i.name)+' × '+i.qty+'</span><b>'+money(i.price*i.qty)+'</b></div>').join(''):'Нема производа.';
  const f=document.getElementById('orderForm');
  if(f)f.onsubmit=async e=>{e.preventDefault();const d=new FormData(f);const result=document.getElementById('result');result.classList.remove('hidden');result.textContent='Провера поруџбине...';try{const customer={ime:d.get('name'),telefon:d.get('phone')};localStorage.setItem('lastOrder',JSON.stringify({customer,state}));result.textContent='Поруџбина је припремљена. Следећи корак је упис у табеле поруџбине.';}catch(err){result.textContent='Дошло је до грешке: '+err.message}};
  cartCount();
}
const page=document.body.dataset.page;
if(page==='home'){cartCount();renderProducts()}
if(page==='map')initMap();
if(page==='confirm')initConfirm();