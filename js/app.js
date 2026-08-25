import { isValidItalianPhone, estimateMinutes, formatTimer, summarizeOrders, calculateCustomizedPrice, DEMO_PAYMENT_METHODS, mergeMenuDefaults, customizationLines } from './domain.js';
import { resolveBusinessDate, resolveClosure } from './operations.js';
import { dailyReport } from './reports.js';
import { calendarPanel, holidayException, openingException } from './views/calendar.js';
import { historyDates, orderHistoryPanel } from './views/order-history.js';
import { orderEditorPanel, previewTotal, revisionItems, revisionIsValid } from './views/order-editor.js';
import { calculateAdjustment } from './payments.js';
import { LOCALES, translate, translatePaymentMethod, translateProduct } from './i18n.js';
import { buildCustomerRecap, orderReceiptPanel } from './views/order-receipt.js';
import { draftFromProduct, emptyDraft, menuPanel, menuProductPayload } from './views/menu-editor.js';
import { buildCloseDialog, closeService, nextServiceSequence, serviceAcceptsOrders, servicePanel, shiftLabel, startServiceWithCalendar } from './views/service.js';
import { dialogMarkup, restoreDialogFocus, trapDialogFocus } from './ui/dialog.js';
import { appConfig } from './config.js';
import { bootstrapDataLayer, isCreatorSession } from './bootstrap.js';
import { applyRepositorySnapshot, createRepositoryRefreshCoordinator } from './app-state.js';

const defaults={view:'customer',creator:false,locale:'it',receipt:null,shift:null,capacity:90,online:true,cart:[],calendar:{closedWeekdays:[2],exceptions:[]},services:{lunch:null,dinner:null},activeDay:null,menu:[
 {id:'margherita',type:'pizza',name:'Margherita',price:8,emoji:'🍕',ingredients:['Pomodoro','Mozzarella','Basilico'],allergens:['Glutine','Latte'],additions:[{name:'Mozzarella di bufala',price:2},{name:'Prosciutto cotto',price:2},{name:'Olive',price:1}],available:true},
 {id:'diavola',type:'pizza',name:'Diavola',price:10,emoji:'🌶️',ingredients:['Pomodoro','Mozzarella','Salame piccante'],allergens:['Glutine','Latte'],additions:[{name:'Cipolla',price:1},{name:'Olive',price:1},{name:'Bufala',price:2}],available:true},
 {id:'bufala',type:'pizza',name:'Bufala',price:11,emoji:'🍅',ingredients:['Pomodoro','Bufala','Basilico'],allergens:['Glutine','Latte'],additions:[{name:'Prosciutto crudo',price:2.5},{name:'Acciughe',price:2}],available:true},
 {id:'cola',type:'drink',name:'Cola',price:3,emoji:'🥤',ingredients:[],available:true}],orders:[]};
let state=load(); const runtime=await bootstrapDataLayer({config:appConfig,supabase:globalThis.supabase,storage:localStorage,initialState:{menu:state.menu,calendar:state.calendar,services:state.services,activeDay:state.activeDay,shift:state.shift,online:state.online,orders:state.orders}}); const repository=runtime.repository; state.creator=runtime.mode==='local'?state.creator:isCreatorSession(runtime.session); let adminSection='service'; let customizing=null; let productFilter='pizza'; let menuDraft=null; let historyFilters={}; let editingOrderId=null; let editorQuantities={}; let refocusHistoryQuery=false; let pendingDialog=null; let releaseDialogTrap=null; let dialogReturnFocus=null; let hasRendered=false;
function load(){try{const saved=JSON.parse(localStorage.getItem('hm-state')||'{}');return {...defaults,...saved,calendar:{...defaults.calendar,...(saved.calendar||{}),exceptions:saved.calendar?.exceptions||[]},services:{...defaults.services,...(saved.services||{})},menu:mergeMenuDefaults(saved.menu||[],defaults.menu)}}catch{return structuredClone(defaults)}}
function save(){localStorage.setItem('hm-state',JSON.stringify(state))}
function reportRepositoryError(){toast('Dati salvati in locale: connessione non disponibile.')}
const stateRefresh=createRepositoryRefreshCoordinator({repository,apply(snapshot){state=applyRepositorySnapshot(state,snapshot);save();if(hasRendered)render()},onError:reportRepositoryError});
async function refreshRepositoryState(){try{await stateRefresh.refresh()}catch{}}
function t(key){return translate(key,state.locale)}
function pname(product){return translateProduct(product.names??{it:product.name},state.locale)||product.name||''}
function localIngredient(name,translations){const match=(translations||[]).find(entry=>entry.it===name);return match?translateProduct(match,state.locale):name}
function money(v){return new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(v)}
function toast(text){const el=document.querySelector('#toast');el.textContent=text;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2200)}
function pizzasAhead(){return state.orders.filter(o=>o.status==='preparing').reduce((n,o)=>n+o.items.reduce((s,i)=>s+i.quantity,0),0)}
function currentClosure(date=resolveBusinessDate(Date.now(),state.activeDay)){const closure=resolveClosure(date,state.calendar.closedWeekdays,state.calendar.exceptions);return {...closure,date,message:closure.message||(closure.closed?'Chiuso per riposo settimanale':'')}}
function orderingOpen(){return Boolean(state.shift&&state.services[state.shift]?.status==='open'&&state.online&&!currentClosure().closed)}
function esc(value=''){return String(value).replace(/[&<>'"]/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'})[character])}
function render(){document.documentElement.lang=state.locale;releaseDialogTrap?.();releaseDialogTrap=null;document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{state.view=b.dataset.view;pendingDialog=null;save();render()});const side=document.querySelector('#topbar-side');if(side)side.innerHTML=state.view==='customer'?langSwitch():'';document.querySelector('#app').innerHTML=(state.view==='customer'?customer():state.view==='creator'?creator():kitchen())+dialogMarkup(pendingDialog,money);bind()}
function langSwitch(){return `<div class="lang-switch">${LOCALES.map(code=>`<button class="btn ${state.locale===code?'primary':'secondary'} lang-pick" data-locale="${code}">${code.toUpperCase()}</button>`).join('')}</div>`}
function finishDialog(){const selector=dialogReturnFocus;pendingDialog=null;render();restoreDialogFocus(selector);dialogReturnFocus=null}
function customer(){
  if(state.receipt)return orderReceiptPanel(state.receipt,state.locale,money);
  const eta=estimateMinutes(pizzasAhead(),state.capacity),closure=currentClosure(),open=orderingOpen();
  const total=state.cart.reduce((n,i)=>n+i.price,0);
  return `<section class="menu-hero">
      <div><span class="eyebrow">${t('app.tagline')}</span><h1>${t('app.headline')}</h1><p>${t('app.subtitle')}</p></div>
      <div class="status ${closure.closed?'closed-status':''}"><b>${open?t('status.open'):t('status.closed')}</b>${closure.closed?`<p class="closure-reason"><strong>${esc(closure.message)}</strong><br>${closure.date}</p>`:`<p>${t('status.wait')}: ${eta}\u2013${eta+5} ${t('status.minutes')}</p>`}</div>
    </section>
    <nav class="menu-nav">
      <button class="btn ${productFilter==='pizza'?'primary':'secondary'}" data-filter="pizza">${t('tabs.pizzas')}</button>
      <button class="btn ${productFilter==='drink'?'primary':'secondary'}" data-filter="drink">${t('tabs.drinks')}</button>
    </nav>
    <section class="grid dish-grid" id="products">${products(productFilter)}</section>
    ${state.cart.length?`<div class="cart-bar"><span>${state.cart.length} \u00b7 <strong>${money(total)}</strong></span><button class="btn primary" id="cart-open">${t('tabs.cart')}</button></div>`:''}
    <aside id="cart" class="drawer hidden">${cart()}</aside>
    ${customizing?customizer():''}`;
}

// La foto e' il primo argomento di vendita: quando manca si mostra comunque un
// riquadro caldo, mai un'immagine rotta.
function dishPhoto(product,variant='dish'){
  const inner=product.imageUrl
    ? `<img src="${esc(product.imageUrl)}" alt="${esc(pname(product))}" loading="lazy">`
    : `<span class="emoji">${product.emoji||'\u{1F355}'}</span>`;
  const base=variant==='modal'?'modal-photo':'dish-photo';
  return `<div class="${base}${product.imageUrl?'':' empty'}">${inner}</div>`;
}

function products(type){
  const closed=currentClosure().closed;
  const list=state.menu.filter(p=>p.type===type&&p.available);
  if(!list.length)return `<p>${t('product.drink')}</p>`;
  return list.map(p=>{
    const ingredients=(p.ingredients||[]).map(name=>localIngredient(name,p.ingredientNames)).join(', ');
    const description=translateProduct(p.descriptions??{},state.locale);
    return `<article class="dish${closed?' sold-out':''}">
      ${dishPhoto(p)}
      <div class="dish-body">
        <h2>${esc(pname(p))}</h2>
        <p class="dish-ingredients">${esc(description||ingredients||t('product.drink'))}</p>
        <div class="dish-foot">
          <span class="price">${money(p.price)}</span>
          <button class="btn primary add" data-id="${esc(p.id)}" ${closed?'disabled':''}>${closed?t('product.closed'):t('product.customize')}</button>
        </div>
      </div>
    </article>`;
  }).join('');
}

function cart(){const total=state.cart.reduce((n,i)=>n+i.price,0),closed=currentClosure().closed;return `<div class="cart-head"><h2>${t('cart.title')}</h2><button class="btn secondary" id="cart-close">${t('cart.close')}</button></div>${state.cart.map((i,x)=>{const extra=[i.removed?.length?`${t('cart.without')}: ${i.removed.map(name=>localIngredient(name,i.ingredientNames)).join(', ')}`:'',i.additions?.filter(a=>a.quantity).map(a=>`${a.quantity}\u00d7 ${translateProduct(a.names??{it:a.name},state.locale)}`).join(', ')||'',i.note||''].filter(Boolean);return `<div class="cart-line"><div><b>${esc(pname(i))}</b>${extra.map(line=>`<p>${esc(line)}</p>`).join('')}</div><div class="cart-line-side"><span>${money(i.price)}</span><button class="btn secondary" data-remove="${x}">${t('cart.remove')}</button></div></div>`}).join('')||`<p>${t('cart.empty')}</p>`}<h3 class="cart-total">${t('cart.total')} ${money(total)}</h3>${state.cart.length?`<div class="field"><label>${t('cart.name')}<input id="name"></label></div><div class="field"><label>${t('cart.phone')}<input id="phone" inputmode="tel"></label></div><div class="field"><label>${t('cart.email')}<input id="email" type="email" inputmode="email"></label></div><div class="field"><span>${t('cart.payment')}</span><div class="payment-grid">${DEMO_PAYMENT_METHODS.map((method,index)=>`<label class="payment-option"><input type="radio" name="payment" value="${method.id}" ${index===0?'checked':''}> <b>${translatePaymentMethod(method.id,state.locale)}</b></label>`).join('')}</div></div><button class="btn primary" id="checkout" ${closed?'disabled':''}>${closed?t('product.closed'):t('cart.confirm')}</button>`:''}`}


function customizer(){const p=customizing.product,price=calculateCustomizedPrice(p.price,customizing.additions);return `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-label="${t('custom.title')}"><div class="modal-head"><div><span class="eyebrow">${t('custom.title')}</span><h2>${pname(p)}</h2></div><button class="btn secondary" id="custom-close">${t('cart.close')}</button></div>${dishPhoto(p,'modal')}<h3>${t('custom.included')}</h3>${p.ingredients.map((ingredient,index)=>`<div class="option-row${customizing.removed.includes(ingredient)?' removed':''}"><span>${localIngredient(ingredient,p.ingredientNames)}</span><div class="stepper"><button class="btn secondary ingredient-toggle" data-index="${index}">${customizing.removed.includes(ingredient)?'+':'\u2212'}</button><b>${customizing.removed.includes(ingredient)?t('custom.removed'):t('custom.kept')}</b></div></div>`).join('')}<h3>${t('custom.additions')}</h3>${customizing.additions.map((addition,index)=>`<div class="option-row"><span>${translateProduct(addition.names??{it:addition.name},state.locale)} \u00b7 ${money(addition.price)}</span><div class="stepper"><button class="btn secondary addition-minus" data-index="${index}">\u2212</button><b>${addition.quantity}</b><button class="btn secondary addition-plus" data-index="${index}">+</button></div></div>`).join('')}<div class="allergens"><b>${t('custom.allergens')}: ${(p.allergenLabels||[]).map(label=>translateProduct(label,state.locale)).join(', ')||(p.allergens||[]).join(', ')||t('custom.none')}</b><p>${t('allergens.warning')}</p></div><div class="field"><label>${t('custom.note')}<textarea id="custom-note" rows="3" placeholder="${t('custom.notePlaceholder')}">${customizing.note}</textarea></label></div><button class="btn primary" id="custom-add">${t('custom.add')} \u00b7 ${money(price)}</button></section></div>`}

function creator(){if(!state.creator)return `<div class="card" style="max-width:440px;margin:auto"><span class="eyebrow">Area riservata</span><h1 style="font-size:44px">Creator</h1><div class="field"><label>${runtime.mode==='supabase'?'Email':'Username'}<input id="user" ${runtime.mode==='supabase'?'type="email" autocomplete="username"':''}></label></div><div class="field"><label>Password<input id="pass" type="password" autocomplete="current-password"></label></div><button class="btn primary" id="login">Accedi</button></div>`;return `${editingOrder()?orderEditorPanel(editingOrder(),editorQuantities,money):''}<div class="admin"><aside class="sidebar">${['service','calendar','orders','history','menu','report'].map(s=>`<button class="btn ${adminSection===s?'primary':'secondary'} admin-nav" data-section="${s}">${({service:'Servizio',calendar:'Calendario',orders:'Ordini',history:'Storico',menu:'Menu',report:'Report'})[s]}</button>`).join('')}</aside><section>${adminContent()}</section></div>`}
function ordersWithAdjustments(){const movements=state.adjustments||[];return (state.orders||[]).map(order=>({...order,adjustments:movements.filter(movement=>String(movement.orderId)===String(order.id))}))}
function editingOrder(){return editingOrderId?state.orders.find(o=>String(o.id)===String(editingOrderId)):null}
function adminContent(){if(adminSection==='service')return servicePanel(state,Date.now());if(adminSection==='calendar')return calendarPanel(state.calendar);if(adminSection==='history')return orderHistoryPanel(state.orders,historyFilters,state.adjustments||[],money);if(adminSection==='orders')return `<h1>Ordini</h1><div class="actions"><button class="btn primary" id="external">+ Ordine dal ristorante</button><button class="btn secondary" id="toggle-online">Online: ${state.online?'attivi':'sospesi'}</button></div>${state.orders.map(orderCard).join('')||'<p>Nessun ordine.</p>'}`;if(adminSection==='menu')return menuPanel(state.menu,menuDraft,state.allergens||[],money,typeof repository.uploadProductPhoto==='function');const day=state.activeDay?.date||historyDates(state.orders)[0]||'';const rows=ordersWithAdjustments();return `<h1>Report</h1><p class="history-count">Giornata ${day||'non ancora aperta'}</p><div class="grid">${reportCard('Pranzo',dailyReport(rows,day,'lunch'))}${reportCard('Serale',dailyReport(rows,day,'dinner'))}${reportCard('Giornata',dailyReport(rows,day))}</div>`}
function reportCard(label,r){return `<article class="card"><span class="eyebrow">${label}</span><div class="metric">${money(r.net)}</div><p>${r.orders} ordini · ${r.pizzas} pizze</p><small>Lordo ${money(r.gross)} · Trattenute ${money(r.fees)}<br>Supplementi ${money(r.supplements||0)} · Rimborsi ${money(r.refunds||0)}</small></article>`}
function itemDetails(item){const changes=customizationLines(item);return `<p><b>${item.quantity}× ${item.name}</b>${changes.map(line=>`<br>${line}`).join('')}${item.note?`<br><span class="${/allerg|celiac|intoller/i.test(item.note)?'warning':''}">${item.note}</span>`:''}</p>`}
function orderNumber(order){return order.sequence?`#${String(order.sequence).padStart(2,'0')}`:`#${order.id}`}
function orderCard(o){return `<article class="card order"><span class="pill">${orderNumber(o)} · ${o.source}</span><h3>${o.customer}</h3><p>${o.payment||'Pagamento non indicato'}</p>${o.items.map(itemDetails).join('')}</article>`}
function kitchen(){const active=state.orders.filter(o=>o.status==='preparing');return `<h1>Cucina</h1><p>${active.length} ordini in preparazione</p><div class="grid">${active.map(o=>{const seconds=Math.floor((o.readyAt-Date.now())/1000),timer=formatTimer(seconds);return `<article class="card order ${timer.late?'late':''}"><span class="pill">${orderNumber(o)} · ${o.source}</span><div class="timer">${timer.text}</div><p>Ordinato alle ${new Date(o.createdAt).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'})} · ${o.payment||'Pagamento non indicato'}</p>${o.items.map(itemDetails).join('')}<button class="btn primary ready" data-id="${o.id}">ORDINE PRONTO</button></article>`}).join('')||'<div class="card"><h2>Coda libera</h2><p>Nessuna comanda da preparare.</p></div>'}</div>`}
function bind(){
  // Riscrivere solo #products lasciava i nuovi bottoni senza gestori: dopo un
  // cambio scheda "Personalizza e aggiungi" non rispondeva piu'.
  document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{productFilter=b.dataset.filter;render()});
  document.querySelectorAll('.add').forEach(b=>b.onclick=()=>{
    const product=state.menu.find(x=>x.id===b.dataset.id);
    customizing={product,removed:[],additions:(product.additions||[]).map(a=>({...a,quantity:0})),note:''};
    render();
  });
  document.querySelector('#custom-close')?.addEventListener('click',()=>{customizing=null;render()});
  document.querySelectorAll('.ingredient-toggle').forEach(b=>b.onclick=()=>{
    const ingredient=customizing.product.ingredients[Number(b.dataset.index)];
    customizing.note=document.querySelector('#custom-note').value;
    customizing.removed=customizing.removed.includes(ingredient)?customizing.removed.filter(x=>x!==ingredient):[...customizing.removed,ingredient];
    render();
  });
  document.querySelectorAll('.addition-minus').forEach(b=>b.onclick=()=>{
    customizing.note=document.querySelector('#custom-note').value;
    const addition=customizing.additions[Number(b.dataset.index)];
    addition.quantity=Math.max(0,addition.quantity-1);render();
  });
  document.querySelectorAll('.addition-plus').forEach(b=>b.onclick=()=>{
    customizing.note=document.querySelector('#custom-note').value;
    const addition=customizing.additions[Number(b.dataset.index)];
    addition.quantity=Math.min(5,addition.quantity+1);render();
  });
  document.querySelector('#custom-add')?.addEventListener('click',()=>{
    const note=document.querySelector('#custom-note').value.trim();
    const price=calculateCustomizedPrice(customizing.product.price,customizing.additions);
    state.cart.push({...customizing.product,price,removed:[...customizing.removed],additions:customizing.additions.map(a=>({...a})),note});
    customizing=null;save();render();toast('Pizza aggiunta al carrello');
  });
  document.querySelector('#cart-open')?.addEventListener('click',()=>document.querySelector('#cart').classList.remove('hidden'));
  document.querySelector('#cart-close')?.addEventListener('click',()=>document.querySelector('#cart').classList.add('hidden'));
  document.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{state.cart.splice(+b.dataset.remove,1);save();render()});
  document.querySelectorAll('.lang-pick').forEach(b=>b.onclick=()=>{state.locale=b.dataset.locale;save();render()});
  document.querySelector('#recap-new')?.addEventListener('click',()=>{state.receipt=null;save();render()});
  document.querySelector('#recap-sms')?.addEventListener('click',()=>toast(t('recap.sent')));
  document.querySelector('#recap-email')?.addEventListener('click',()=>toast(t('recap.sent')));
  document.querySelector('#checkout')?.addEventListener('click',async()=>{
    const phone=document.querySelector('#phone').value;
    const email=document.querySelector('#email')?.value.trim()||'';
    if(!orderingOpen())return toast(currentClosure().closed?currentClosure().message:'Il servizio online non è aperto.');
    if(!isValidItalianPhone(phone))return toast('Inserisci un numero di telefono italiano valido.');
    if(email&&!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))return toast('Controlla l indirizzo email.');
    const paymentId=document.querySelector('input[name="payment"]:checked').value;
    const payment=DEMO_PAYMENT_METHODS.find(method=>method.id===paymentId);
    const total=state.cart.reduce((n,i)=>n+i.price,0),eta=estimateMinutes(pizzasAhead(),state.capacity),businessDate=state.activeDay.date,service=state.services[state.shift],sequence=nextServiceSequence(state.orders,service,state.activeDay),fees=total*payment.feeRate;
    const cartItems=state.cart.map(i=>({...i,quantity:1}));
    const order={id:143+state.orders.length,requestToken:crypto.randomUUID(),sequence,businessDate,businessDayId:state.activeDay.id,serviceId:service.id,source:'WEB',customer:document.querySelector('#name').value||'Cliente',phone,email,paymentMethod:payment.id,payment:payment.label,status:'preparing',shift:state.shift,createdAt:Date.now(),readyAt:Date.now()+eta*60000,total,gross:total,fee:fees,fees,items:cartItems};
    try{
      // Numero pubblico e totale li decide il server: l'anteprima locale
      // servirebbe solo a mostrare un numero che poi cambia.
      const receipt=await repository.createOrder(order);
      state.receipt=buildCustomerRecap({
        ...order,...receipt,
        total:Number(receipt?.total??total),
        items:cartItems
      },{locale:state.locale,pizzeriaPhone:appConfig.pizzeriaPhone??null});
      state.cart=[];save();
      await stateRefresh.refresh();
      render();toast('Ordine demo inviato in cucina!');
    }catch{reportRepositoryError()}
  });
  document.querySelector('#login')?.addEventListener('click',async()=>{try{const session=await runtime.auth.signIn(document.querySelector('#user').value,document.querySelector('#pass').value);state.creator=isCreatorSession(session);await refreshRepositoryState()}catch{toast('Credenziali non corrette')}});
  document.querySelectorAll('.admin-nav').forEach(b=>b.onclick=()=>{adminSection=b.dataset.section;render()});
  document.querySelectorAll('.service-action').forEach(b=>b.onclick=async()=>{
    const shift=b.dataset.shift,action=b.dataset.serviceAction,existing=state.services[shift];
    if(action==='close'){
      const summary=dailyReport(state.orders,existing.businessDate,shift);
      pendingDialog={...buildCloseDialog(existing,state.orders,summary),serviceId:existing.id,label:shiftLabel(shift)};
      dialogReturnFocus=`.service-action[data-shift="${shift}"]`;
      render();
      return;
    }
    if(state.shift&&state.shift!==shift)return toast(`Chiudi prima il servizio ${shiftLabel(state.shift)}.`);
    const result=startServiceWithCalendar(state,shift,Date.now(),action,state.calendar);
    if(!result.started)return toast(result.closure.message||'Chiuso per riposo settimanale');
    state=result.state;
    try{await repository.openService({...state.services[shift],action:result.mode==='reopen'?'reopen':'open',online:serviceAcceptsOrders(state.services[shift],result.mode),capacity:state.capacity});if(runtime.mode==='supabase')await refreshRepositoryState();else{save();render()};toast(result.mode==='reopen'?'Servizio riaperto.':result.mode==='new-day'?'Nuova giornata aperta.':'Servizio aperto.')}catch{reportRepositoryError()}
  });
  document.querySelectorAll('[data-dialog-action]').forEach(b=>b.onclick=()=>{
    if(b.dataset.dialogAction==='confirm-close'){
      const shift=pendingDialog.shift,service=state.services[shift];
      if(service?.id===pendingDialog.serviceId){
        state.services[shift]=closeService(service);
        void repository.closeService(service.id,{closeBusinessDay:shift==='dinner'&&document.querySelector('#close-business-day')?.checked}).then(()=>runtime.mode==='supabase'?refreshRepositoryState():undefined).catch(reportRepositoryError);
        if(state.shift===shift)state.shift=null;
        if(shift==='dinner'&&document.querySelector('#close-business-day')?.checked)state.activeDay={...state.activeDay,date:service.businessDate,status:'closed'};
        save();toast(shift==='dinner'?'Servizio serale chiuso.':'Servizio pranzo chiuso.');
      }
    }
    finishDialog();
  });
  async function persistCalendar(action,message){try{await action();await stateRefresh.refresh();toast(message)}catch{reportRepositoryError()}}
  document.querySelector('#weekly-closure-form')?.addEventListener('submit',event=>{event.preventDefault();const form=new FormData(event.currentTarget);void persistCalendar(()=>repository.saveWeeklyClosure(Number(form.get('weekday'))),'Chiusura settimanale aggiornata.')});
  document.querySelector('#holiday-form')?.addEventListener('submit',event=>{event.preventDefault();const form=new FormData(event.currentTarget),holiday={from:form.get('from'),to:form.get('to'),message:form.get('message')};if(holiday.from>holiday.to)return toast('La data finale deve seguire quella iniziale.');void persistCalendar(()=>repository.addClosureException(holidayException(holiday)),'Periodo di ferie aggiunto.')});
  document.querySelector('#exceptional-opening-form')?.addEventListener('submit',event=>{event.preventDefault();const form=new FormData(event.currentTarget);void persistCalendar(()=>repository.addClosureException(openingException({date:form.get('date'),message:form.get('message')})),'Apertura straordinaria aggiunta.')});
  document.querySelectorAll('.remove-calendar-exception').forEach(b=>b.onclick=()=>{const id=b.dataset.closureId;if(!id)return toast('Eccezione senza identificativo: ricarica la pagina.');void persistCalendar(()=>repository.removeClosureException(id),'Eccezione rimossa.')});
  document.querySelector('#toggle-online')?.addEventListener('click',async()=>{const service=state.services[state.shift];if(!service)return toast('Apri prima un servizio.');try{await repository.setServiceOnline(service.id,!state.online);if(runtime.mode==='supabase')await refreshRepositoryState();else{state.online=!state.online;save();render()}}catch{reportRepositoryError()}});
  document.querySelector('#external')?.addEventListener('click',()=>{if(!state.shift)return toast('Apri prima un servizio.');toast('La schermata ordine ristorante sarà il prossimo flusso operativo.')});
  ['date','shift','source','status'].forEach(key=>{const el=document.querySelector(`#history-${key}`);if(el)el.onchange=()=>{historyFilters={...historyFilters,[key]:el.value};render()}});
  const historyQuery=document.querySelector('#history-query');
  if(historyQuery)historyQuery.oninput=()=>{historyFilters={...historyFilters,query:historyQuery.value};refocusHistoryQuery=true;render()};
  if(refocusHistoryQuery){refocusHistoryQuery=false;const field=document.querySelector('#history-query');if(field){field.focus();field.setSelectionRange(field.value.length,field.value.length)}}
  document.querySelectorAll('.history-edit').forEach(b=>b.onclick=()=>{editingOrderId=b.dataset.id;editorQuantities={};render()});
  document.querySelector('#editor-close')?.addEventListener('click',()=>{editingOrderId=null;editorQuantities={};render()});
  document.querySelectorAll('.editor-minus,.editor-plus').forEach(b=>b.onclick=()=>{
    const order=editingOrder();if(!order)return;
    const item=order.items.find(i=>String(i.id)===b.dataset.id);if(!item)return;
    const current=editorQuantities[item.id]===undefined?Number(item.quantity??1):Number(editorQuantities[item.id]);
    const next=b.classList.contains('editor-plus')?Math.min(20,current+1):Math.max(0,current-1);
    editorQuantities={...editorQuantities,[item.id]:next};render();
  });
  document.querySelector('#editor-save')?.addEventListener('click',async()=>{
    const order=editingOrder();if(!order)return;
    if(!revisionIsValid(order,editorQuantities))return toast('Un ordine non puo restare vuoto.');
    const reason=document.querySelector('#editor-reason')?.value.trim()||'Modifica del Creator';
    const method=document.querySelector('input[name="adjustment-method"]:checked')?.value;
    const previousTotal=Number(order.total??0);
    const expected=calculateAdjustment(previousTotal,previewTotal(order,editorQuantities));
    try{
      await repository.reviseOrder(order.id,{items:revisionItems(order,editorQuantities),reason});
      // Il totale va letto dallo snapshot restituito: un refresh piu' recente
      // innescato dal Realtime puo' scartare l'applicazione di questo, e lo
      // stato in memoria resterebbe indietro per un istante.
      const snapshot=await stateRefresh.refresh();
      const revised=snapshot.orders.find(o=>String(o.id)===String(order.id));
      const movement=calculateAdjustment(previousTotal,Number(revised?.total??previewTotal(order,editorQuantities)));
      if(movement.type!=='none'){
        await repository.recordPaymentAdjustment(order.id,{...movement,method:movement.type==='supplement'?(method||'cash'):null,note:reason});
        await stateRefresh.refresh();
      }
      editingOrderId=null;editorQuantities={};render();
      toast(movement.type==='supplement'?`Revisione salvata · supplemento ${money(movement.amount)}`:movement.type==='refund'?`Revisione salvata · rimborso ${money(movement.amount)}`:'Revisione salvata.');
      if(movement.type!=='none'&&expected.type!==movement.type)toast('Il totale ricalcolato dal server differisce dall anteprima.');
    }catch{reportRepositoryError()}
  });
  document.querySelectorAll('.movement-record,.movement-cancel').forEach(b=>b.onclick=async()=>{
    const status=b.classList.contains('movement-record')?'recorded':'cancelled';
    try{await repository.transitionPaymentAdjustment(b.dataset.id,status);await stateRefresh.refresh();render();toast(status==='recorded'?'Movimento registrato.':'Movimento annullato.')}catch{reportRepositoryError()}
  });
  function readMenuDraft(){
    if(!menuDraft)return null;
    const val=id=>document.querySelector(id)?.value??'';
    const rows=(cls,key)=>[...document.querySelectorAll(cls)].reduce((acc,el)=>{const i=Number(el.dataset.index);acc[i]={...(acc[i]||{}),[key]:el.type==='checkbox'?el.checked:el.value};return acc},[]);
    const inc=rows('.menu-inc-it','it'),incEn=rows('.menu-inc-en','en'),incRem=rows('.menu-inc-rem','removable');
    const add=rows('.menu-add-it','it'),addEn=rows('.menu-add-en','en'),addPr=rows('.menu-add-price','price'),addMx=rows('.menu-add-max','max');
    return {
      ...menuDraft,
      type:val('#menu-type')||menuDraft.type,
      nameIt:val('#menu-name-it'),nameEn:val('#menu-name-en'),
      descIt:val('#menu-desc-it'),descEn:val('#menu-desc-en'),
      price:val('#menu-price'),sortOrder:val('#menu-sort')||0,
      available:document.querySelector('#menu-available')?.checked??menuDraft.available,
      imageUrl:(document.querySelector('#menu-photo-url')?.value??menuDraft.imageUrl??'').trim(),
      included:(menuDraft.included||[]).map((row,i)=>({...row,...inc[i],...incEn[i],...incRem[i]})),
      additions:(menuDraft.additions||[]).map((row,i)=>({...row,...add[i],...addEn[i],...addPr[i],...addMx[i]})),
      allergenIds:[...document.querySelectorAll('.menu-allergen:checked')].map(el=>el.value)
    };
  }
  document.querySelector('#menu-new')?.addEventListener('click',()=>{const last=Math.max(0,...(state.menu||[]).map(x=>Number(x.sortOrder||0)));menuDraft={...emptyDraft(),sortOrder:last+10};render()});
  document.querySelectorAll('.menu-edit').forEach(b=>b.onclick=()=>{const product=state.menu.find(x=>x.id===b.dataset.id);if(product){menuDraft=draftFromProduct(product);render()}});
  document.querySelector('#menu-close')?.addEventListener('click',()=>{menuDraft=null;render()});
  document.querySelector('#menu-photo-clear')?.addEventListener('click',()=>{menuDraft={...readMenuDraft(),imageUrl:''};render()});
  document.querySelector('#menu-photo-file')?.addEventListener('change',async event=>{
    const file=event.target.files?.[0];
    if(!file)return;
    // Il file va nell'archivio prima del salvataggio: cosi' la foto si vede
    // subito e il prodotto porta gia' l'indirizzo definitivo.
    const draft=readMenuDraft();
    toast('Carico la foto...');
    try{
      const url=await repository.uploadProductPhoto(file,String(draft.nameIt||'piatto').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'piatto');
      menuDraft={...draft,imageUrl:url};render();toast('Foto caricata.');
    }catch(error){menuDraft=draft;render();toast(error?.message?`Foto non caricata: ${error.message}`:'Foto non caricata.')}
  });
  document.querySelector('#menu-inc-add')?.addEventListener('click',()=>{menuDraft={...readMenuDraft(),included:[...(readMenuDraft().included||[]),{it:'',en:'',removable:true}]};render()});
  document.querySelector('#menu-add-add')?.addEventListener('click',()=>{menuDraft={...readMenuDraft(),additions:[...(readMenuDraft().additions||[]),{it:'',en:'',price:'',max:1}]};render()});
  document.querySelectorAll('.menu-inc-del').forEach(b=>b.onclick=()=>{const d=readMenuDraft();menuDraft={...d,included:d.included.filter((_,i)=>i!==Number(b.dataset.index))};render()});
  document.querySelectorAll('.menu-add-del').forEach(b=>b.onclick=()=>{const d=readMenuDraft();menuDraft={...d,additions:d.additions.filter((_,i)=>i!==Number(b.dataset.index))};render()});
  document.querySelector('#menu-save')?.addEventListener('click',async()=>{
    const draft=readMenuDraft();
    if(!String(draft.nameIt||'').trim())return toast('Il nome in italiano e obbligatorio.');
    if(!(Number(String(draft.price).replace(',','.'))>0))return toast('Inserisci un prezzo maggiore di zero.');
    try{
      const savedId=await repository.saveMenuProduct(menuProductPayload(draft));
      // La foto ha una strada sua: si scrive solo se e' davvero cambiata.
      const precedente=state.menu.find(p=>String(p.databaseId??p.id)===String(draft.id))?.imageUrl??'';
      if((draft.imageUrl||'')!==(precedente||''))await repository.setProductPhoto(draft.id??savedId,draft.imageUrl);
      await stateRefresh.refresh();
      menuDraft=null;render();toast('Menu aggiornato.');
    }catch(error){toast(error?.message?`Non salvato: ${error.message}`:'Non salvato.')}
  });
  document.querySelectorAll('.menu-delete').forEach(b=>b.onclick=async()=>{
    const product=state.menu.find(x=>x.id===b.dataset.id);
    if(!product)return;
    try{
      const esito=await repository.deleteMenuProduct(product.databaseId??product.id);
      await stateRefresh.refresh();render();
      toast(esito==='disabled'?'Prodotto gia venduto: disattivato, resta nello storico.':'Prodotto eliminato.');
    }catch(error){toast(error?.message?`Non eliminato: ${error.message}`:'Non eliminato.')}
  });
  document.querySelectorAll('.availability').forEach(b=>b.onclick=()=>{const p=state.menu.find(x=>x.id===b.dataset.id);p.available=!p.available;save();render();void repository.saveProduct(p).catch(reportRepositoryError)});
  document.querySelectorAll('.ready').forEach(b=>b.onclick=async()=>{try{await repository.updateOrderStatus(b.dataset.id,'ready');if(runtime.mode==='supabase')await refreshRepositoryState();else{state.orders.find(o=>String(o.id)===b.dataset.id).status='ready';save();render()}}catch{reportRepositoryError()}});
  const dialog=document.querySelector('.dialog-card');
  if(dialog)releaseDialogTrap=trapDialogFocus(dialog,finishDialog);
}
try{await stateRefresh.refresh()}catch{}
render();hasRendered=true;setInterval(()=>{if(state.view==='kitchen')render()},1000);
repository.subscribe(()=>{void stateRefresh.schedule()});
runtime.auth.onChange(session=>{state.creator=isCreatorSession(session);void stateRefresh.schedule()});
