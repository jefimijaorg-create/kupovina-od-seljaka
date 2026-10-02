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
const api=async(path)=>{const sep=path.includes('?')?'&':'?';const r=await fetch(SUPABASE_URL+'/rest/v1/'+path+sep+'_ts='+Date.now(),{headers,cache:'no-store'});if(!r.ok)throw new Error(await r.text());return r.json()};
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
  b.disabled=false;
  b.textContent=qty ? 'Изабери место преузимања →' : 'Наручи производе';
  b.onclick=()=>{
    if(cartQty()) location.href='mapa.html';
    else document.getElementById('proizvodi')?.scrollIntoView({behavior:'smooth',block:'start'});
  };
}

function formatDeliveryDate(dateString){
  const d=new Date(dateString+'T12:00:00');
  return d.toLocaleDateString('sr-RS',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
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

async function getCurrentTour(){
  const today=new Date().toISOString().slice(0,10);
  const rows=await api('ture?select=id,naziv,datum,status&status=in.(open,scheduled)&datum=gte.'+today+'&order=datum.asc,id.desc&limit=1');
  return rows[0]||null;
}

async function getTourConfig(tourId){
  const [tp,tv]=await Promise.all([
    api('tura_punktovi?select=punkt_id,redosled&tura_id=eq.'+tourId+'&aktivan=eq.true&order=redosled.asc'),
    api('tura_proizvodi?select=proizvod_id&tura_id=eq.'+tourId+'&aktivan=eq.true')
  ]);
  return {pointIds:tp.map(x=>String(x.punkt_id)),productIds:tv.map(x=>String(x.proizvod_id))};
}

async function renderProducts(){
  const box=document.getElementById('products');
  if(!box)return;
  try{
    const fields='id,name,description,category,price,currency,stock,unit,image_url,producer_name,is_active,gazdinstvo_id,has_variants';
    const tour=await getCurrentTour();
    if(!tour){
      box.innerHTML='<div class="card"><b>Тренутно нема отворене туре за Београд.</b></div>';
      const s=document.getElementById('productStatus'); if(s)s.textContent='Нема активне туре';
      return;
    }
    window.currentTour=tour;
    const config=await getTourConfig(tour.id);
    const psAll=await api('products?select='+fields+'&is_active=eq.true&order=name.asc&limit=100');
    const ps=config.productIds.length ? psAll.filter(p=>config.productIds.includes(String(p.id))) : [];
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
          const variantRows=variants.length
            ? '<div class="variant-list">'+variants.map(v=>{
                const cartId=String(p.id)+'::'+String(v.id);
                const inCart=state.cart.find(x=>String(x.cartId||x.id)===cartId);
                const qty=Number(inCart?.qty||0);
                return '<div class="variant-row">'+
                  '<div class="variant-info"><strong>'+esc(v.name)+'</strong><span>'+money(v.price)+'</span></div>'+
                  '<div class="variant-qty" aria-label="Количина '+esc(v.name)+'">'+
                    '<button type="button" class="variant-minus" data-variant-dec="'+esc(p.id)+'" data-variant-id="'+esc(v.id)+'" aria-label="Смањи">−</button>'+
                    '<b data-variant-qty="'+esc(cartId)+'">'+qty+'</b>'+
                    '<button type="button" class="variant-plus" data-variant-inc="'+esc(p.id)+'" data-variant-id="'+esc(v.id)+'" aria-label="Повећај">+</button>'+
                  '</div>'+
                '</div>';
              }).join('')+'</div>'
            : '<div class="product-bottom"><div><div class="price">'+money(p.price)+'</div><div class="unit">'+esc(p.unit||'ком')+'</div></div><button class="btn primary add-btn" data-add="'+esc(p.id)+'" type="button">Додај</button></div>';
          return `
          <article class="product">
            ${p.image_url?'<img src="'+esc(p.image_url)+'" alt="" loading="lazy">':''}
            <h3>${esc(p.name||'Производ')}</h3>
            ${p.description?'<div class="meta">'+esc(p.description)+'</div>':''}
            ${variantRows}
          </article>`;
        }).join('')}
      </div>
    </section>`).join('');

  const changeVariantQty=(productId,variantId,delta)=>{
    const p=ps.find(x=>String(x.id)===String(productId));
    if(!p)return;
    const variants=variantsByProduct[p.id]||[];
    const v=variants.find(x=>String(x.id)===String(variantId));
    if(!v)return;
    const cartId=String(p.id)+'::'+String(v.id);
    const x=state.cart.find(i=>String(i.cartId||i.id)===cartId);
    if(delta>0){
      if(x)x.qty+=delta;
      else state.cart.push({cartId,id:p.id,variant_id:v.id,variant_name:v.name,name:p.name,price:Number(v.price)||0,unit:p.unit||'ком',qty:delta});
    }else if(x){
      x.qty+=delta;
      if(x.qty<=0)state.cart.splice(state.cart.indexOf(x),1);
    }
    save();
    cartCount();
    renderProductGroups(ps,variantsByProduct,filter);
  };

  box.querySelectorAll('.variant-plus').forEach(b=>b.onclick=()=>changeVariantQty(b.dataset.variantInc,b.dataset.variantId,1));
  box.querySelectorAll('.variant-minus').forEach(b=>b.onclick=()=>changeVariantQty(b.dataset.variantDec,b.dataset.variantId,-1));

  box.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>{
    const p=ps.find(x=>String(x.id)===b.dataset.add);
    if(p)add(p,null);
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
    const tour=window.currentTour||await getCurrentTour();
    if(!tour){box.innerHTML='<div class="card">Тренутно нема активне туре.</div>';return;}
    const config=await getTourConfig(tour.id);
    const ids=config.pointIds;
    const query=ids.length?'&id=in.('+ids.join(',')+')':'&id=eq.0';
    const ps=await api('punktovi?select=id,name,city,address,latitude,longitude,is_active,description,viber_group,maps_url,vreme,aktivan,slug&order=sort_order.asc&limit=100'+query);
    const active=ps.filter(p=>ids.includes(String(p.id))&&String(p.is_active).toLowerCase()!=='false'&&String(p.aktivan).toLowerCase()!=='false');

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
    const suggestionBox=document.getElementById('addressSuggestions');
    const locationButton=document.getElementById('useMyLocation');
    const locationStatus=document.getElementById('locationStatus');

    const distanceKm=(a,b)=>{
      const R=6371, r=Math.PI/180;
      const dLat=(b.lat-a.lat)*r, dLon=(b.lng-a.lng)*r;
      const x=Math.sin(dLat/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dLon/2)**2;
      return 2*R*Math.asin(Math.sqrt(x));
    };

    const showNearest=async(user,label='унете адресе')=>{
      const nearest=active.filter(p=>Number.isFinite(Number(p.latitude))&&Number.isFinite(Number(p.longitude)))
        .map(p=>({...p,distance:distanceKm(user,{lat:Number(p.latitude),lng:Number(p.longitude)})}))
        .sort((a,b)=>a.distance-b.distance)[0];
      if(!nearest)return;
      if(searchResult){
        searchResult.classList.remove('hidden');
        searchResult.innerHTML='<span class="eyebrow">Предлажемо ти најближи пункт</span>'+
          '<strong>'+esc(nearest.name||'Пункт')+'</strong>'+
          '<span class="distance">'+nearest.distance.toFixed(1)+' км од '+esc(label)+'</span>'+
          '<button type="button" id="chooseNearest">Изабери овај пункт</button>';
        document.getElementById('chooseNearest')?.addEventListener('click',()=>selectPoint(nearest));
      }
      selectPoint(nearest);
    };

    const reverseCurrentLocation=async(pos)=>{
      const user={lat:Number(pos.coords.latitude),lng:Number(pos.coords.longitude)};
      try{
        const r=await fetch('https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat='+user.lat+'&lon='+user.lng+'&zoom=18&addressdetails=1',{headers:{Accept:'application/json'}});
        const place=await r.json();
        const label=place.display_name||'Твоја тренутна локација';
        if(searchInput)searchInput.value=label;
        if(locationStatus)locationStatus.textContent='Локација је пронађена.';
        await showNearest(user,'твоје локације');
      }catch(e){
        if(locationStatus)locationStatus.textContent='Локација је пронађена, али адреса није.';
        await showNearest(user,'твоје локације');
        console.error(e);
      }
    };

    const useCurrentLocation=()=>{
      if(!navigator.geolocation){
        if(locationStatus)locationStatus.textContent='Овај уређај не подржава локацију.';
        return;
      }
      if(locationStatus)locationStatus.textContent='Читам твоју локацију...';
      if(locationButton)locationButton.disabled=true;
      navigator.geolocation.getCurrentPosition(
        reverseCurrentLocation,
        err=>{
          if(locationStatus)locationStatus.textContent=err.code===1?'Дозвола за локацију није дата.':'Нисмо успели да прочитамо локацију.';
          if(locationButton)locationButton.disabled=false;
        },
        {enableHighAccuracy:true,timeout:10000,maximumAge:300000}
      );
    };

    let autocompleteTimer=null;
    const loadSuggestions=async()=>{
      const q=(searchInput?.value||'').trim();
      if(!suggestionBox)return;
      if(q.length<3){suggestionBox.classList.add('hidden');return;}
      try{
        const geo=await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=5&countrycodes=rs&accept-language=sr&q='+encodeURIComponent(q),{headers:{Accept:'application/json'}});
        const places=await geo.json();
        suggestionBox.innerHTML=places.map((p,i)=>'<button type="button" class="address-suggestion" data-suggestion="'+i+'">'+esc(p.display_name)+'</button>').join('');
        suggestionBox.classList.toggle('hidden',!places.length);
        suggestionBox.querySelectorAll('.address-suggestion').forEach((b,i)=>{
          b.onclick=()=>{
            const p=places[i];
            searchInput.value=p.display_name||q;
            suggestionBox.classList.add('hidden');
            showNearest({lat:Number(p.lat),lng:Number(p.lon)},'унете адресе');
          };
        });
      }catch(e){
        suggestionBox.classList.add('hidden');
        console.error(e);
      }
    };

    if(locationButton)locationButton.onclick=useCurrentLocation;
    if(searchInput){
      searchInput.addEventListener('input',()=>{
        clearTimeout(autocompleteTimer);
        autocompleteTimer=setTimeout(loadSuggestions,500);
      });
      searchInput.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();choosePointFromSearch()}});
    }

    const choosePointFromSearch=async()=>{
      const q=(searchInput?.value||'').trim();
      if(!q){ if(searchResult){searchResult.classList.remove('hidden');searchResult.textContent='Унеси адресу или место.';} return; }
      suggestionBox?.classList.add('hidden');

      // Прво тражимо међу нашим активним пунктовима.
      const ql=q.toLocaleLowerCase('sr');
      const pointMatch=active.find(p=>
        String(p.name||'').toLocaleLowerCase('sr').includes(ql) ||
        String(p.address||'').toLocaleLowerCase('sr').includes(ql) ||
        String(p.city||'').toLocaleLowerCase('sr').includes(ql)
      );
      if(pointMatch){
        selectPoint(pointMatch);
        if(searchResult){
          searchResult.classList.remove('hidden');
          searchResult.innerHTML='<span class="eyebrow">Пункт пронађен</span><strong>'+esc(pointMatch.name||'Пункт')+'</strong><span class="distance">'+esc(pointMatch.address||'')+'</span>';
        }
        return;
      }

      try{
        const geo=await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=rs&q='+encodeURIComponent(q),{headers:{Accept:'application/json'}});
        const places=await geo.json();
        if(!places.length){ if(searchResult){searchResult.classList.remove('hidden');searchResult.textContent='Нисмо пронашли ту адресу или пункт. Пробај назив улице, број или назив пункта.';} return; }
        await showNearest({lat:Number(places[0].lat),lng:Number(places[0].lon)},'унете адресе');
      }catch(e){
        if(searchResult){searchResult.classList.remove('hidden');searchResult.textContent='Претрага тренутно није доступна.';}
        console.error(e);
      }
    };

    if(searchButton)searchButton.onclick=choosePointFromSearch;

    const toggle=document.getElementById('togglePoints');
    const panel=document.getElementById('pointsPanel');
    if(toggle&&panel){
      toggle.onclick=()=>{
        const open=!panel.classList.contains('hidden');
        panel.classList.toggle('hidden',open);
        toggle.textContent=open?'☰ Листа пунктова':'✕ Затвори листу';
      };
    }

    const markerBounds=[];
    active.forEach(p=>{
      const lat=Number(p.latitude),lng=Number(p.longitude);
      if(!Number.isFinite(lat)||!Number.isFinite(lng))return;
      const m=L.marker([lat,lng]).addTo(pickupMap);
      pickupMarkers[p.id]=m;
      markerBounds.push([lat,lng]);
      m.bindPopup('<strong>'+esc(p.name||'Пункт')+'</strong><br><small>'+esc(p.address||'')+'</small>');
    });
    if(markerBounds.length>1)pickupMap.fitBounds(markerBounds,{padding:[24,24],maxZoom:12});

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
    }else if(navigator.geolocation){
      setTimeout(useCurrentLocation,400);
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

function renderCart(){
  const box=document.getElementById('cartBox');
  if(!box)return;
  const count=cartQty();
  const total=state.cart.reduce((s,x)=>s+Number(x.price||0)*Number(x.qty||0),0);

  if(!count){
    box.innerHTML='<div class="card cart-empty-box"><h2>Корпа је празна</h2><p>Изабери производе које желиш, па се врати овде да провериш поруџбину.</p><a href="index.html" class="btn primary">Погледај производе →</a></div>';
    const cont=document.getElementById('cartContinue');
    if(cont)cont.disabled=true;
    return;
  }

  box.innerHTML='<div class="cart-list">'+state.cart.map((x,i)=>`
    <article class="cart-item">
      <div class="cart-item-main">
        <strong>${esc(x.name)}</strong>
        ${x.variant_name?'<small>'+esc(x.variant_name)+'</small>':''}
        <span>${money(x.price)} / ${esc(x.unit||'ком')}</span>
      </div>
      <div class="qty-control" aria-label="Количина">
        <button type="button" data-cart-dec="${i}" aria-label="Смањи количину">−</button>
        <b>${x.qty}</b>
        <button type="button" data-cart-inc="${i}" aria-label="Повећај количину">+</button>
      </div>
      <div class="cart-item-total">${money(Number(x.price||0)*Number(x.qty||0))}</div>
      <button type="button" class="cart-remove" data-cart-remove="${i}">Уклони</button>
    </article>`).join('')+'</div>'+
    '<div class="cart-total"><span>Укупно</span><strong>'+money(total)+'</strong></div>';

  box.querySelectorAll('[data-cart-inc]').forEach(b=>b.onclick=()=>{
    state.cart[Number(b.dataset.cartInc)].qty++;
    save();renderCart();cartCount();
  });
  box.querySelectorAll('[data-cart-dec]').forEach(b=>b.onclick=()=>{
    const i=Number(b.dataset.cartDec);
    state.cart[i].qty--;
    if(state.cart[i].qty<=0)state.cart.splice(i,1);
    save();renderCart();cartCount();
  });
  box.querySelectorAll('[data-cart-remove]').forEach(b=>b.onclick=()=>{
    state.cart.splice(Number(b.dataset.cartRemove),1);
    save();renderCart();cartCount();
  });

  const cont=document.getElementById('cartContinue');
  if(cont){
    cont.disabled=false;
    cont.onclick=()=>{if(cartQty())location.href='mapa.html'};
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
        <span><strong>${esc(x.name)}</strong>${x.variant_name?'<small>'+esc(x.variant_name)+'</small>':''}<small>× ${x.qty}</small></span>
        <b>${money(x.price*x.qty)}</b>
      </div>`).join('');
  }
  const totalEl=document.getElementById('orderTotal');
  if(totalEl)totalEl.textContent=money(total);

  const f=document.getElementById('orderForm');
  if(f)f.onsubmit=async e=>{
    e.preventDefault();
    const submit=f.querySelector('button[type="submit"]');
    const result=document.getElementById('result');
    const d=new FormData(f);
    const name=String(d.get('name')||'').trim();
    const phone=String(d.get('phone')||'').trim();
    const note=String(d.get('note')||'').trim();

    if(!name||!phone){
      if(result){
        result.classList.remove('hidden');
        result.innerHTML='<strong>Недостају подаци.</strong><span>Унеси име и број телефона.</span>';
      }
      return;
    }

    if(state.delivery==='punkt'&&!state.point?.id){
      if(result){
        result.classList.remove('hidden');
        result.innerHTML='<strong>Није изабран пункт.</strong><span>Врати се корак назад и изабери место преузимања.</span>';
      }
      return;
    }

    if(state.delivery==='dogovor'&&!String(state.proposalAddress||'').trim()){
      if(result){
        result.classList.remove('hidden');
        result.innerHTML='<strong>Није унето место.</strong><span>Унеси предложену адресу или место преузимања.</span>';
      }
      return;
    }

    if(!state.cart.length)return;

    if(submit){
      submit.disabled=true;
      submit.textContent='Чувам поруџбину...';
    }
    if(result){
      result.classList.remove('hidden');
      result.innerHTML='<span>Поруџбина се уписује...</span>';
    }

    try{
      const rpcBody={
        p_name:name,
        p_phone:phone,
        p_note:note,
        p_point_id:state.delivery==='punkt' ? Number(state.point.id) : null,
        p_pickup_address:state.delivery==='dogovor' ? String(state.proposalAddress||'').trim() : null,
        p_items:state.cart.map(x=>({
          product_id:x.id,
          variant_id:x.variant_id||null,
          qty:Number(x.qty||0)
        }))
      };

      const r=await fetch(SUPABASE_URL+'/rest/v1/rpc/create_web_order',{
        method:'POST',
        headers,
        body:JSON.stringify(rpcBody)
      });

      if(!r.ok){
        let message='Поруџбина није уписана.';
        try{
          const err=await r.json();
          message=err.message||err.error_description||message;
        }catch(_){}
        throw new Error(message);
      }

      const saved=await r.json();
      const orderId=saved?.order_id;
      const savedTotal=Number(saved?.total||total);

      localStorage.setItem('lastOrder',JSON.stringify({
        order_id:orderId,
        customer:{ime:name,telefon:phone,napomena:note},
        products:state.cart,
        pickup:state.delivery==='punkt'
          ?{method:'punkt',point_id:state.point?.id,point_name:state.point?.name,time:state.point?.vreme,address:state.point?.address}
          :{method:'dogovor',address:state.proposalAddress},
        total:savedTotal
      }));

      state.cart=[];
      state.point=null;
      state.proposalAddress='';
      state.delivery='punkt';
      save();

      if(result){
        result.classList.remove('hidden');
        result.innerHTML='<strong>Поруџбина је примљена.</strong><span>Број поруџбине: #'+esc(orderId||'')+'</span><span>Укупно: '+money(savedTotal)+'</span><span>Ускоро ћемо потврдити поруџбину и место преузимања.</span>';
      }
      f.reset();
      cartCount();
      if(submit)submit.textContent='Поруџбина је послата';
    }catch(err){
      console.error(err);
      if(result){
        result.classList.remove('hidden');
        result.innerHTML='<strong>Нисмо успели да упишемо поруџбину.</strong><span>'+esc(err.message||'Покушај поново.')+'</span>';
      }
      if(submit){
        submit.disabled=false;
        submit.textContent='Покушај поново';
      }
    }
  };
  cartCount();
}

const page=document.body.dataset.page;
if(page==='home'){cartCount();renderNextDelivery();renderProducts()}
if(page==='cart'){cartCount();renderCart()}
if(page==='map')initMap();
if(page==='confirm')initConfirm();