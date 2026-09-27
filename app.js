const SUPABASE_URL='https://kszkehxrcuagymlfowqj.supabase.co';
const SUPABASE_ANON_KEY='sb_publishable_TRZp6skXsdIUsE4Vl65_2Q_QskFb532';
const headers={'apikey':SUPABASE_ANON_KEY,'Authorization':'Bearer '+SUPABASE_ANON_KEY,'Content-Type':'application/json'};

const state=JSON.parse(localStorage.getItem('seljaciState')||'{}');
state.cart=Array.isArray(state.cart)?state.cart:[];
state.delivery=state.delivery||'punkt';
state.point=state.point||null;
state.proposalAddress=state.proposalAddress||'';

const save=()=>localStorage.setItem('seljaciState',JSON.stringify(state));
const money=n=>new Intl.NumberFormat('sr-RS',{minimumFractionDigits:0,maximumFractionDigits:2}).format(Number(n)||0)+' RSD';
const api=async(path)=>{const r=await fetch(SUPABASE_URL+'/rest/v1/'+path,{headers});if(!r.ok)throw new Error(await r.text());return r.json()};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function cartQty(){return state.cart.reduce((s,x)=>s+Number(x.qty||0),0)}
function cartCount(){
  const qty=cartQty();
  const e=document.getElementById('cartCount');
  if(e)e.textContent=qty;
  const link=document.getElementById('cartLink');
  if(link){
    link.classList.toggle('cart-empty',qty===0);
    link.setAttribute('aria-disabled',qty===0?'true':'false');
  }
  updateHomeContinue();
}
function add(p,variant=null){
  const cartId=variant?String(p.id)+'::'+String(variant.id):String(p.id);
  const x=state.cart.find(i=>String(i.cartId||i.id)===cartId);
  if(x)x.qty++;
  else state.cart.push({
    cartId,
    id:p.id,
    variant_id:variant?.id||null,
    variant_name:variant?.name||'',
    name:p.name,
    price:Number(variant?.price ?? p.price)||0,
    unit:p.unit||'ком',
    qty:1
  });
  save();
  cartCount();
  renderProducts();
}
function updateHomeContinue(){
  const b=document.getElementById('homeContinue');
  if(!b)return;
  const qty=cartQty();
  b.disabled=qty===0;
  b.textContent=qty ? 'Изабери место преузимања →' : 'Изабери место преузимања';
  b.onclick=()=>{if(cartQty())location.href='mapa.html'};
}

function formatDeliveryDate(dateString){
  const d=new Date(dateString+'T12:00:00');
  return d.toLocaleDateString('sr-RS',{weekday:'long',day:'numeric',month:'long'});
}
function orderDeadline(dateString){
  const d=new Date(dateString+'T12:00:00');
  d.setDate(d.getDate()-4);
  return d.toLocaleDateString('sr-RS',{weekday:'long',day:'numeric',month:'long'})+' у 22:00';
}

async function renderNextDelivery(){
  const title=document.getElementById('deliveryTitle');
  const info=document.getElementById('deliveryInfo');
  if(!title)return;
  try{
    const rows=await api('ture?select=id,naziv,datum,status&status=in.(open,scheduled)&datum=gte.'+new Date().toISOString().slice(0,10)+'&order=datum.asc,id.desc&limit=1');
    if(!rows.length){
      title.textContent='Нема заказане следеће доставе';
      if(info)info.textContent='';
      return;
    }
    const t=rows[0];
    title.textContent=formatDeliveryDate(t.datum);
    if(info)info.textContent='Поруџбине до '+orderDeadline(t.datum);
  }catch(e){
    title.textContent='Следећа достава';
    if(info)info.textContent='Поруџбине до среде у 22:00';
  }
}

async function renderProducts(){
  const box=document.getElementById('products');
  if(!box)return;
  try{
    const fields='id,name,description,category,price,currency,stock,unit,image_url,producer_name,is_active,gazdinstvo_id,has_variants';
    const ps=await api('products?select='+fields+'&is_active=eq.true&order=name.asc&limit=100');
    const vs=await api('product_variants?select=id,product_id,name,price,is_active&is_active=eq.true&limit=100');
    const variantsByProduct={};
    vs.forEach(v=>(variantsByProduct[v.product_id]??=[]).push(v));

    const categories=[...new Set(ps.map(p=>String(p.category||'Остало').trim()||'Остало'))];
    const filter=document.getElementById('productFilter');
    if(filter){
      filter.innerHTML='<button type="button" class="filter-btn active" data-filter="all">Све</button>'+
        categories.map(c=>'<button type="button" class="filter-btn" data-filter="'+esc(c)+'">'+esc(c)+'</button>').join('');
      filter.querySelectorAll('.filter-btn').forEach(b=>b.onclick=()=>{
        filter.querySelectorAll('.filter-btn').forEach(x=>x.classList.toggle('active',x===b));
        renderProductGroups(ps,variantsByProduct,b.dataset.filter);
      });
    }
    renderProductGroups(ps,variantsByProduct,'all');
  }catch(e){
    const s=document.getElementById('productStatus');
    if(s)s.textContent='Грешка при учитавању';
    box.innerHTML='<div class="card"><b>Производи тренутно нису доступни.</b></div>';
    console.error(e);
  }
}

function renderProductGroups(ps,variantsByProduct,filter='all'){
  const box=document.getElementById('products');
  const groups={};
  ps.filter(p=>filter==='all'||String(p.category||'Остало')===filter).forEach(p=>{
    const cat=String(p.category||'Остало').trim()||'Остало';
    (groups[cat]??=[]).push(p);
  });

  box.innerHTML=Object.entries(groups).map(([cat,items])=>`
    <section class="product-group">
      <div class="product-group-title"><h3>${esc(cat)}</h3><span>${items.length}</span></div>
      <div class="products-group-grid">
        ${items.map(p=>{
          const variants=variantsByProduct[p.id]||[];
          const variantSelect=variants.length
            ? '<label class="variant-label">Паковање<select class="variant-select" data-variant-for="'+esc(p.id)+'">'+
                variants.map(v=>'<option value="'+esc(v.id)+'">'+esc(v.name)+' — '+money(v.price)+'</option>').join('')+
              '</select></label>'
            : '';
          const displayPrice=variants.length?variants[0].price:p.price;
          return `
          <article class="product">
            ${p.image_url?'<img src="'+esc(p.image_url)+'" alt="" loading="lazy">':''}
            <h3>${esc(p.name||'Производ')}</h3>
            ${p.description?'<div class="meta">'+esc(p.description)+'</div>':''}
            ${p.producer_name?'<div class="producer">'+esc(p.producer_name)+'</div>':''}
            ${variantSelect}
            <div class="product-bottom">
              <div><div class="price">${money(displayPrice)}</div><div class="unit">${esc(p.unit||'ком')}</div></div>
              <button class="btn primary add-btn" data-add="${esc(p.id)}" type="button">Додај</button>
            </div>
          </article>`;
        }).join('')}
      </div>
    </section>`).join('');

  box.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>{
    const p=ps.find(x=>String(x.id)===b.dataset.add);
    if(!p)return;
    const variants=variantsByProduct[p.id]||[];
    const select=box.querySelector('[data-variant-for="'+p.id+'"]');
    const variant=variants.find(v=>String(v.id)===String(select?.value))||null;
    add(p,variant);
  });
  box.querySelectorAll('.variant-select').forEach(select=>select.onchange=()=>{
    const p=ps.find(x=>String(x.id)===select.dataset.variantFor);
    const v=(variantsByProduct[p.id]||[]).find(x=>String(x.id)===String(select.value));
    const price=select.closest('.product')?.querySelector('.price');
    if(price&&v)price.textContent=money(v.price);
  });
  const s=document.getElementById('productStatus');
  if(s)s.textContent=ps.filter(p=>filter==='all'||String(p.category||'Остало')===filter).length+' производа';
}

let pickupMap=null;
let pickupMarkers={};

async function renderPoints(){
  const box=document.getElementById('points');
  if(!box)return;
  try{
    const ps=await api('punktovi?select=id,name,city,address,latitude,longitude,is_active,description,viber_group,maps_url,vreme,aktivan,slug&order=sort_order.asc&limit=100');
    const active=ps.filter(p=>String(p.is_active).toLowerCase()!=='false'&&String(p.aktivan).toLowerCase()!=='false');

    box.innerHTML=active.map(p=>`
      <button class="point ${state.point?.id==p.id?'active':''}" data-id="${esc(p.id)}" type="button">
        <strong>${esc(p.name||p.address||'Пункт')}</strong>
        <small>${esc(p.address||p.city||'')}${p.vreme?' • '+esc(p.vreme):''}</small>
      </button>`).join('');

    pickupMap=L.map('map',{zoomControl:false,scrollWheelZoom:false}).setView([44.78,20.45],11);
    L.control.zoom({position:'topright'}).addTo(pickupMap);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap'}).addTo(pickupMap);

    pickupMarkers={};

    const searchInput=document.getElementById('pointSearch');
    const searchButton=document.getElementById('searchPoint');
    const searchResult=document.getElementById('searchResult');

    const distanceKm=(a,b)=>{
      const R=6371, r=Math.PI/180;
      const dLat=(b.lat-a.lat)*r, dLon=(b.lng-a.lng)*r;
      const x=Math.sin(dLat/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dLon/2)**2;
      return 2*R*Math.asin(Math.sqrt(x));
    };

    const choosePointFromSearch=async()=>{
      const q=(searchInput?.value||'').trim();
      if(!q){ if(searchResult){searchResult.classList.remove('hidden');searchResult.textContent='Унеси адресу или место.';} return; }
      try{
        const geo=await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=rs&q='+encodeURIComponent(q),{headers:{Accept:'application/json'}});
        const places=await geo.json();
        if(!places.length){ if(searchResult){searchResult.classList.remove('hidden');searchResult.textContent='Нисмо пронашли ту адресу. Пробај назив улице, број или крај.';} return; }
        const user={lat:Number(places[0].lat),lng:Number(places[0].lon)};
        const nearest=active.filter(p=>Number.isFinite(Number(p.latitude))&&Number.isFinite(Number(p.longitude)))
          .map(p=>({...p,distance:distanceKm(user,{lat:Number(p.latitude),lng:Number(p.longitude)})}))
          .sort((a,b)=>a.distance-b.distance)[0];
        if(!nearest)return;
        if(searchResult){
          searchResult.classList.remove('hidden');
          searchResult.innerHTML='<span>Најближи пункт</span><strong>'+esc(nearest.name||'Пункт')+'</strong><small>'+nearest.distance.toFixed(1)+' км од тражене адресе</small>';
        }
        selectPoint(nearest);
      }catch(e){
        if(searchResult){searchResult.classList.remove('hidden');searchResult.textContent='Претрага тренутно није доступна.';}
        console.error(e);
      }
    };

    if(searchButton)searchButton.onclick=choosePointFromSearch;
    if(searchInput)searchInput.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();choosePointFromSearch()}});

    const toggle=document.getElementById('togglePoints');
    const panel=document.getElementById('pointsPanel');
    if(toggle&&panel){
      toggle.onclick=()=>{
        const open=!panel.classList.contains('hidden');
        panel.classList.toggle('hidden',open);
        toggle.textContent=open?'☰ Листа пунктова':'✕ Затвори листу';
      };
    }

    active.forEach(p=>{
      const lat=Number(p.latitude),lng=Number(p.longitude);
      if(!Number.isFinite(lat)||!Number.isFinite(lng))return;
      const m=L.marker([lat,lng]).addTo(pickupMap);
      pickupMarkers[p.id]=m;
      m.bindPopup('<strong>'+esc(p.name||'Пункт')+'</strong>');
    });

    let selectPoint; 
    selectPoint=p=>{
      state.point=p;
      state.delivery='punkt';
      save();
      document.querySelectorAll('.delivery').forEach(x=>x.classList.toggle('active',x.dataset.method==='punkt'));
      box.querySelectorAll('.point').forEach(x=>x.classList.toggle('active',x.dataset.id==p.id));

      const lat=Number(p.latitude),lng=Number(p.longitude);
      if(Number.isFinite(lat)&&Number.isFinite(lng)){
        pickupMap.setView([lat,lng],16,{animate:true});
        if(pickupMarkers[p.id])pickupMarkers[p.id].openPopup();
      }

      const card=document.getElementById('mapCard');
      if(card){
        card.classList.remove('hidden');
        card.innerHTML='<strong>'+esc(p.name||'Пункт')+'</strong>'+
          '<span>'+esc([p.address,p.city].filter(Boolean).join(', '))+'</span>'+
          (p.vreme?'<span>🕒 '+esc(p.vreme)+'</span>':'')+
          (p.description?'<p>'+esc(p.description)+'</p>':'')+
          (p.maps_url?'<a target="_blank" rel="noopener" href="'+esc(p.maps_url)+'">Отвори у Google Maps ↗</a>':'');
      }

      const selected=document.getElementById('selectedPoint');
      if(selected){
        selected.classList.remove('hidden');
        selected.innerHTML='<span>Изабрани пункт</span><strong>'+esc(p.name||'Пункт')+'</strong>';
      }
      updateContinue();
    };

    box.querySelectorAll('.point').forEach(b=>b.onclick=()=>{
      const p=active.find(x=>String(x.id)===b.dataset.id);
      if(p)selectPoint(p);
    });

    const status=document.getElementById('pointStatus');
    if(status)status.textContent=active.length+' активних';
    if(state.point){
      const p=active.find(x=>String(x.id)===String(state.point.id));
      if(p)selectPoint(p);
    }
  }catch(e){
    const status=document.getElementById('pointStatus');
    if(status)status.textContent='Пунктови нису доступни';
    box.innerHTML='<div class="card">Нема учитаних пунктова.</div>';
    console.error(e);
  }
}

function updateContinue(){
  const b=document.getElementById('continue');
  if(!b)return;
  if(state.delivery==='dogovor'){
    const input=document.getElementById('proposalAddress');
    b.disabled=!String(input?.value||state.proposalAddress).trim()||!cartQty();
  }else{
    b.disabled=!state.point||!cartQty();
  }
}

function initMap(){
  if(!cartQty()){
    location.href='index.html';
    return;
  }
  document.querySelectorAll('.delivery').forEach(b=>b.onclick=()=>{
    state.delivery=b.dataset.method;
    save();
    document.querySelectorAll('.delivery').forEach(x=>x.classList.toggle('active',x===b));

    const pointMode=document.getElementById('pointMode');
    const dogovorMode=document.getElementById('dogovorMode');
    if(pointMode)pointMode.classList.toggle('hidden',state.delivery!=='punkt');
    if(dogovorMode)dogovorMode.classList.toggle('hidden',state.delivery!=='dogovor');

    updateContinue();
  });

  const input=document.getElementById('proposalAddress');
  if(input){
    input.value=state.proposalAddress||'';
    input.addEventListener('input',()=>{
      state.proposalAddress=input.value;
      save();
      updateContinue();
    });
  }

  const b=document.getElementById('continue');
  if(b)b.onclick=()=>{
    if(state.delivery==='dogovor'){
      state.proposalAddress=(input?.value||'').trim();
      state.point=null;
    }
    save();
    location.href='potvrdi.html';
  };

  if(state.delivery==='dogovor'){
    document.querySelector('[data-method="dogovor"]')?.click();
  }
  renderPoints();
  updateContinue();
  cartCount();
}

function initConfirm(){
  if(!cartQty()){
    location.href='index.html';
    return;
  }

  const summary=document.getElementById('deliverySummary');
  if(summary){
    if(state.delivery==='punkt'){
      summary.innerHTML=
        '<span>Пункт</span><strong>'+esc(state.point?.name||'Није изабран')+'</strong>'+
        (state.point?.address?'<small>'+esc(state.point.address)+'</small>':'')+
        (state.point?.vreme?'<small>Време преузимања: '+esc(state.point.vreme)+'</small>':'');
    }else{
      summary.innerHTML=
        '<span>По договору</span><strong>Предложена локација</strong>'+
        '<small>'+esc(state.proposalAddress||'Није унета адреса')+'</small>';
    }
  }

  const items=document.getElementById('orderItems');
  const total=state.cart.reduce((s,x)=>s+Number(x.price||0)*Number(x.qty||0),0);
  if(items){
    items.innerHTML=state.cart.map(x=>`
      <div class="order-row">
        <span>${esc(x.name)} <small>× ${x.qty}</small></span>
        <b>${money(x.price*x.qty)}</b>
      </div>`).join('');
  }
  const totalEl=document.getElementById('orderTotal');
  if(totalEl)totalEl.textContent=money(total);

  const f=document.getElementById('orderForm');
  if(f)f.onsubmit=e=>{
    e.preventDefault();
    const d=new FormData(f);
    const result=document.getElementById('result');
    const order={
      customer:{ime:d.get('name'),telefon:d.get('phone'),napomena:d.get('note')},
      products:state.cart,
      pickup:state.delivery==='punkt'
        ?{method:'punkt',point_id:state.point?.id,point_name:state.point?.name,time:state.point?.vreme,address:state.point?.address}
        :{method:'dogovor',address:state.proposalAddress},
      total
    };
    localStorage.setItem('lastOrder',JSON.stringify(order));
    if(result){
      result.classList.remove('hidden');
      result.innerHTML='<strong>Поруџбина је припремљена.</strong><span>Хвала! Ускоро ћемо потврдити поруџбину и место преузимања.</span>';
    }
  };
  cartCount();
}

const page=document.body.dataset.page;
if(page==='home'){cartCount();renderNextDelivery();renderProducts()}
if(page==='map')initMap();
if(page==='confirm')initConfirm();