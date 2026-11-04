const SUPABASE_URL='https://kszkehxrcuagymlfowqj.supabase.co';
const SUPABASE_ANON_KEY='sb_publishable_TRZp6skXsdIUsE4Vl65_2Q_QskFb532';
const headers={'apikey':SUPABASE_ANON_KEY,'Content-Type':'application/json'};

const state=JSON.parse(localStorage.getItem('seljaciState')||'{}');
state.cart=Array.isArray(state.cart)?state.cart:[];
state.delivery=state.delivery||'punkt';
state.point=state.point||null;
state.proposalAddress=state.proposalAddress||'';

const save=()=>localStorage.setItem('seljaciState',JSON.stringify(state));
const money=n=>new Intl.NumberFormat('sr-RS',{minimumFractionDigits:0,maximumFractionDigits:2}).format(Number(n)||0)+' RSD';
const api=async(path)=>{const r=await fetch(SUPABASE_URL+'/rest/v1/'+path,{headers,cache:'no-store'});if(!r.ok)throw new Error(await r.text());return r.json()};
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
    // Приказујемо најновију отворену туру из постојеће базе.
    const rows=await api('ture?select=id,naziv,datum,status&status=eq.open&order=datum.desc,id.desc&limit=1');
    if(!rows.length){
      title.textContent='Нема отворене туре';
      if(info)info.textContent='';
      return;
    }
    const t=rows[0];
    const d=new Date(t.datum+'T12:00:00');
    title.textContent=d.toLocaleDateString('sr-RS',{day:'numeric',month:'numeric',year:'numeric'});
    if(info)info.textContent=(t.naziv||'Отворена тура')+(String(t.naziv||'').toLocaleLowerCase('sr').includes('test')?' · пробна тура за проверу система':'');
  }catch(e){
    title.textContent='Датум није доступан';
    if(info)info.textContent='';
    console.error(e);
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
    // Понуда на почетној страници = сви активни производи из базе.
    // Не филтрирамо производе по тури, датуму или tura_proizvodi.
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

async function renderPoints(){
  const box=document.getElementById('points');
  if(!box)return;
  try{
    const tour=window.currentTour||await getCurrentTour();
    if(!tour){box.innerHTML='<div class="text-sm text-gray-600 p-3">Тренутно нема отворене туре.</div>';return;}
    const config=await getTourConfig(tour.id);
    const ids=config.pointIds;
    const query=ids.length?'&id=in.('+ids.join(',')+')':'&id=eq.0';
    const rows=await api('punktovi?select=id,name,city,address,is_active,description,viber_group,maps_url,vreme,aktivan,slug&order=sort_order.asc&limit=100'+query);
    const active=rows.filter(p=>ids.includes(String(p.id))&&String(p.is_active).toLowerCase()!=='false'&&String(p.aktivan).toLowerCase()!=='false');
    if(!active.length){box.innerHTML='<div class="text-sm text-gray-600 p-3">За ову туру још нису подешени пунктови.</div>';return;}

    const selectedBox=document.getElementById('selectedPoint');
    const renderSelected=()=>{
      const p=state.point;
      if(!selectedBox||!p){selectedBox?.classList.add('hidden');return;}
      selectedBox.classList.remove('hidden');
      selectedBox.innerHTML=
        '<span class="eyebrow">Изабрани главни пункт</span>'+
        '<h2>'+esc(p.name||p.address||'Пункт')+'</h2>'+
        '<p class="muted">'+esc([p.address,p.city].filter(Boolean).join(', ')||p.description||'Главно место преузимања')+'</p>'+
        '<div class="pickup-options">'+
          '<label class="pickup-option"><input type="radio" name="pickupMode" value="main" '+(state.pickupMode!=='proposal'?'checked':'')+'>'+
            '<span><strong>Могу да дођем на главни пункт</strong><small>Преузимам поруџбину на '+esc(p.name||'изабраном пункту')+'.</small></span></label>'+
          '<label class="pickup-option"><input type="radio" name="pickupMode" value="proposal" '+(state.pickupMode==='proposal'?'checked':'')+'>'+
            '<span><strong>Више ми одговара друго место у близини</strong><small>Предложићу место које је повезано са овим главним пунктом.</small></span></label>'+
        '</div>'+
        '<div id="nearbyField" class="nearby-field '+(state.pickupMode==='proposal'?'':'hidden')+'">'+
          '<label for="nearbyPlace">Предложи место у близини</label>'+
          '<p>Напиши нам у ком делу овог краја би ти одговарало преузимање. Проверићемо да ли можемо да организујемо долазак.</p>'+
          '<textarea id="nearbyPlace" maxlength="180" placeholder="На пример: улица, насеље или познато место">'+esc(state.proposalAddress||'')+'</textarea>'+
        '</div>'+
        '<div class="selection-note">Твој предлог остаје повезан са главним пунктом <strong>'+esc(p.name||'')+'</strong>. Преузимање на предложеном месту потврђујемо накнадно.</div>';

      selectedBox.querySelectorAll('input[name="pickupMode"]').forEach(input=>{
        input.addEventListener('change',()=>{
          state.pickupMode=input.value;
          if(input.value==='main')state.proposalAddress='';
          save();
          renderSelected();
          updateContinue();
        });
      });
      selectedBox.querySelector('#nearbyPlace')?.addEventListener('input',e=>{
        state.proposalAddress=e.target.value;
        save();
        updateContinue();
      });
    };

    box.innerHTML=active.map(p=>'<button class="point '+(state.point?.id==p.id?'active':'')+'" data-id="'+esc(p.id)+'" type="button">'+
      '<span><strong>'+esc(p.name||p.address||'Пункт')+'</strong><small>'+esc([p.address,p.city].filter(Boolean).join(', ')||p.description||'Место преузимања')+'</small></span>'+
      '<span class="point-check">'+(state.point?.id==p.id?'✓':'○')+'</span></button>').join('');

    box.querySelectorAll('.point').forEach(button=>button.addEventListener('click',()=>{
      const p=active.find(x=>String(x.id)===button.dataset.id);
      if(!p)return;
      state.point=p;
      state.pickupMode='main';
      state.proposalAddress='';
      state.delivery='punkt';
      save();
      box.querySelectorAll('.point').forEach(x=>{
        const isSelected=x.dataset.id===String(p.id);
        x.classList.toggle('active',isSelected);
        const mark=x.querySelector('.point-check');
        if(mark)mark.textContent=isSelected?'✓':'○';
      });
      renderSelected();
      updateContinue();
      selectedBox?.scrollIntoView({behavior:'smooth',block:'nearest'});
    }));

    const status=document.getElementById('pointStatus');
    if(status)status.textContent=active.length+' пунктова';
    if(state.point){
      const current=active.find(p=>String(p.id)===String(state.point.id));
      if(current){state.point=current;renderSelected();}
      else {state.point=null;state.pickupMode='main';state.proposalAddress='';save();}
    }
    updateContinue();
  }catch(e){
    const status=document.getElementById('pointStatus');
    if(status)status.textContent='Пунктови нису доступни';
    box.innerHTML='<div class="text-sm text-red-700 p-3">Нисмо успели да учитамо пунктове. Покушај поново.</div>';
    console.error(e);
  }
}

function updateContinue(){
  const b=document.getElementById('continue');
  if(!b)return;
  const needsProposal=state.pickupMode==='proposal';
  b.disabled=!state.point||!cartQty()||(needsProposal&&!String(state.proposalAddress||'').trim());
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
  state.delivery='punkt';
  save();
  const b=document.getElementById('continue');
  if(b)b.onclick=()=>{
    if(!state.point)return;
    if(state.pickupMode==='proposal'&&!String(state.proposalAddress||'').trim())return;
    save();
    location.href='potvrdi.html';
  };
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
        '<span>Главни пункт</span><strong>'+esc(state.point?.name||'Није изабран')+'</strong>'+
        (state.point?.address?'<small>'+esc(state.point.address)+'</small>':'')+
        (state.pickupMode==='proposal'?'<small>Предложени под-пункт: '+esc(state.proposalAddress||'')+'</small>':'<small>Преузимање на главном пункту</small>')+
        (state.point?.vreme?'<small>Време преузимања: '+esc(state.point.vreme)+'</small>':'');
    }else{
      summary.innerHTML=
        '<span>Предлог места преузимања</span><strong>По договору</strong>'+
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
        p_note:[note,state.pickupMode==='proposal'&&String(state.proposalAddress||'').trim()?('Предложени под-пункт уз главни пункт '+String(state.point?.name||'')+': '+String(state.proposalAddress).trim()):''].filter(Boolean).join('\\n'),
        p_point_id:Number(state.point.id),
        p_pickup_address:null,
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
          ?{method:'punkt',point_id:state.point?.id,point_name:state.point?.name,time:state.point?.vreme,address:state.point?.address,pickup_mode:state.pickupMode||'main',proposed_subpoint:state.pickupMode==='proposal'?state.proposalAddress:''}
          :{method:'dogovor',address:state.proposalAddress},
        total:savedTotal
      }));

      state.cart=[];
      state.point=null;
      state.pickupMode='main';
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