import { isValidItalianPhone, estimateMinutes, formatTimer, summarizeOrders, calculateCustomizedPrice, DEMO_PAYMENT_METHODS, mergeMenuDefaults, customizationLines } from './domain.js';
import { resolveBusinessDate, resolveClosure } from './operations.js';
import { dailyReport } from './reports.js';
import { calendarPanel, holidayException, openingException } from './views/calendar.js';
import { historyDates, orderHistoryPanel } from './views/order-history.js';
import { orderEditorPanel, previewTotal, revisionItems, revisionIsValid } from './views/order-editor.js';
import { calculateAdjustment } from './payments.js';
import { buildCloseDialog, closeService, nextServiceSequence, serviceAcceptsOrders, servicePanel, shiftLabel, startServiceWithCalendar } from './views/service.js';
import { dialogMarkup, restoreDialogFocus, trapDialogFocus } from './ui/dialog.js';
import { appConfig } from './config.js';
import { bootstrapDataLayer, isCreatorSession } from './bootstrap.js';
import { applyRepositorySnapshot, createRepositoryRefreshCoordinator } from './app-state.js';

const defaults={view:'customer',creator:false,shift:null,capacity:90,online:true,cart:[],calendar:{closedWeekdays:[2],exceptions:[]},services:{lunch:null,dinner:null},activeDay:null,menu:[
 {id:'margherita',type:'pizza',name:'Margherita',price:8,emoji:'🍕',ingredients:['Pomodoro','Mozzarella','Basilico'],allergens:['Glutine','Latte'],additions:[{name:'Mozzarella di bufala',price:2},{name:'Prosciutto cotto',price:2},{name:'Olive',price:1}],available:true},
 {id:'diavola',type:'pizza',name:'Diavola',price:10,emoji:'🌶️',ingredients:['Pomodoro','Mozzarella','Salame piccante'],allergens:['Glutine','Latte'],additions:[{name:'Cipolla',price:1},{name:'Olive',price:1},{name:'Bufala',price:2}],available:true},
 {id:'bufala',type:'pizza',name:'Bufala',price:11,emoji:'🍅',ingredients:['Pomodoro','Bufala','Basilico'],allergens:['Glutine','Latte'],additions:[{name:'Prosciutto crudo',price:2.5},{name:'Acciughe',price:2}],available:true},
 {id:'cola',type:'drink',name:'Cola',price:3,emoji:'🥤',ingredients:[],available:true}],orders:[]};
let state=load(); const runtime=await bootstrapDataLayer({config:appConfig,supabase:globalThis.supabase,storage:localStorage,initialState:{menu:state.menu,calendar:state.calendar,services:state.services,activeDay:state.activeDay,shift:state.shift,online:state.online,orders:state.orders}}); const repository=runtime.repository; state.creator=runtime.mode==='local'?state.creator:isCreatorSession(runtime.session); let adminSection='service'; let customizing=null; let historyFilters={}; let editingOrderId=null; let editorQuantities={}; let refocusHistoryQuery=false; let pendingDialog=null; let releaseDialogTrap=null; let dialogReturnFocus=null; let hasRendered=false;
function load(){try{const saved=JSON.parse(localStorage.getItem('hm-state')||'{}');return {...defaults,...saved,calendar:{...defaults.calendar,...(saved.calendar||{}),exceptions:saved.calendar?.exceptions||[]},services:{...defaults.services,...(saved.services||{})},menu:mergeMenuDefaults(saved.menu||[],defaults.menu)}}catch{return structuredClone(defaults)}}
function save(){localStorage.setItem('hm-state',JSON.stringify(state))}
function reportRepositoryError(){toast('Dati salvati in locale: connessione non disponibile.')}
const stateRefresh=createRepositoryRefreshCoordinator({repository,apply(snapshot){state=applyRepositorySnapshot(state,snapshot);save();if(hasRendered)render()},onError:reportRepositoryError});
async function refreshRepositoryState(){try{await stateRefresh.refresh()}catch{}}
function money(v){return new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(v)}
function toast(text){const el=document.querySelector('#toast');el.textContent=text;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2200)}
function pizzasAhead(){return state.orders.filter(o=>o.status==='preparing').reduce((n,o)=>n+o.items.reduce((s,i)=>s+i.quantity,0),0)}
function currentClosure(date=resolveBusinessDate(Date.now(),state.activeDay)){const closure=resolveClosure(date,state.calendar.closedWeekdays,state.calendar.exceptions);return {...closure,date,message:closure.message||(closure.closed?'Chiuso per riposo settimanale':'')}}
function orderingOpen(){return Boolean(state.shift&&state.services[state.shift]?.status==='open'&&state.online&&!currentClosure().closed)}
function render(){releaseDialogTrap?.();releaseDialogTrap=null;document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{state.view=b.dataset.view;pendingDialog=null;save();render()});document.querySelector('#app').innerHTML=(state.view==='customer'?customer():state.view==='creator'?creator():kitchen())+dialogMarkup(pendingDialog,money);bind()}
function finishDialog(){const selector=dialogReturnFocus;pendingDialog=null;render();restoreDialogFocus(selector);dialogReturnFocus=null}
function customer(){const eta=estimateMinutes(pizzasAhead(),state.capacity),closure=currentClosure(),open=orderingOpen();return `<section class="hero"><div><span class="eyebrow">Pizza calda, senza attese inutili</span><h1>Il tuo incontro con la pizza.</h1><p>Ordina online e ritira a Milano, Piola.</p></div><div class="status ${closure.closed?'closed-status':''}"><b>${open?'Ordini aperti':'Ordini al momento chiusi'}</b>${closure.closed?`<p class="closure-reason"><strong>${closure.message}</strong><br>${closure.date}</p>`:`<p>Attesa indicativa: ${eta}–${eta+5} minuti</p>`}</div></section><div class="tabs"><button class="btn primary" data-filter="pizza">Pizze</button><button class="btn secondary" data-filter="drink">Bibite</button><button class="btn secondary" id="cart-open">Carrello · ${state.cart.length}</button></div><section class="grid" id="products">${products('pizza')}</section><aside id="cart" class="drawer hidden">${cart()}</aside>${customizing?customizer():''}`}
function products(type){const closed=currentClosure().closed;return state.menu.filter(p=>p.type===type&&p.available).map(p=>`<article class="card product"><div class="emoji">${p.emoji}</div><h2>${p.name}</h2><p>${p.ingredients.join(' · ')||'Fresca e dissetante'}</p><div class="price">${money(p.price)}</div><button class="btn primary add" data-id="${p.id}" ${closed?'disabled':''}>${closed?'Ordini chiusi':'Personalizza e aggiungi'}</button></article>`).join('')}
function cart(){const total=state.cart.reduce((n,i)=>n+i.price,0),closed=currentClosure().closed;return `<button class="btn secondary" id="cart-close">Chiudi</button><h2>Il tuo ordine</h2>${state.cart.map((i,x)=>`<div class="card"><b>${i.name}</b><p>${i.removed?.length?`Senza: ${i.removed.join(', ')}<br>`:''}${i.additions?.filter(a=>a.quantity).map(a=>`${a.quantity}× ${a.name}`).join(', ')||''}</p><p>${i.note||'Nessuna nota'}</p><button data-remove="${x}">Rimuovi</button></div>`).join('')||'<p>Il carrello è vuoto.</p>'}<h3>Totale ${money(total)}</h3>${state.cart.length?`<div class="field"><label>Nome<input id="name"></label></div><div class="field"><label>Telefono<input id="phone" inputmode="tel"></label></div><div class="field"><span>Pagamento dimostrativo</span><div class="payment-grid">${DEMO_PAYMENT_METHODS.map((method,index)=>`<label class="payment-option"><input type="radio" name="payment" value="${method.id}" ${index===0?'checked':''}> <b>${method.label}</b></label>`).join('')}</div></div><button class="btn primary" id="checkout" ${closed?'disabled':''}>${closed?'Ordini chiusi':'Conferma ordine demo'}</button>`:''}`}

function customizer(){const p=customizing.product,price=calculateCustomizedPrice(p.price,customizing.additions);return `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-label="Personalizza ${p.name}"><div class="modal-head"><div><span class="eyebrow">Personalizza la tua pizza</span><h2>${p.name}</h2></div><button class="btn secondary" id="custom-close">Chiudi</button></div><div class="modal-photo">${p.emoji}</div><h3>Ingredienti inclusi</h3>${p.ingredients.map((ingredient,index)=>`<div class="option-row"><span>${ingredient}</span><div class="stepper"><button class="btn secondary ingredient-toggle" data-index="${index}">${customizing.removed.includes(ingredient)?'+':'−'}</button><b>${customizing.removed.includes(ingredient)?'TOLTO':'INCLUSO'}</b></div></div>`).join('')}<h3>Aggiunte</h3>${customizing.additions.map((addition,index)=>`<div class="option-row"><span>${addition.name} · ${money(addition.price)}</span><div class="stepper"><button class="btn secondary addition-minus" data-index="${index}">−</button><b>${addition.quantity}</b><button class="btn secondary addition-plus" data-index="${index}">+</button></div></div>`).join('')}<div class="allergens"><b>Allergeni: ${(p.allergens||[]).join(', ')||'nessuno dichiarato'}</b><p>In caso di allergie o intolleranze scrivilo nelle note e contatta il locale. Può verificarsi contaminazione crociata.</p></div><div class="field"><label>Note per questa pizza<textarea id="custom-note" rows="3" placeholder="Es. allergia alle noci, celiaco, ben cotta…">${customizing.note}</textarea></label></div><button class="btn primary" id="custom-add">Aggiungi al carrello · ${money(price)}</button></section></div>`}
function creator(){if(!state.creator)return `<div class="card" style="max-width:440px;margin:auto"><span class="eyebrow">Area riservata</span><h1 style="font-size:44px">Creator</h1><div class="field"><label>${runtime.mode==='supabase'?'Email':'Username'}<input id="user" ${runtime.mode==='supabase'?'type="email" autocomplete="username"':''}></label></div><div class="field"><label>Password<input id="pass" type="password" autocomplete="current-password"></label></div><button class="btn primary" id="login">Accedi</button></div>`;return `${editingOrder()?orderEditorPanel(editingOrder(),editorQuantities,money):''}<div class="admin"><aside class="sidebar">${['service','calendar','orders','history','menu','report'].map(s=>`<button class="btn ${adminSection===s?'primary':'secondary'} admin-nav" data-section="${s}">${({service:'Servizio',calendar:'Calendario',orders:'Ordini',history:'Storico',menu:'Menu',report:'Report'})[s]}</button>`).join('')}</aside><section>${adminContent()}</section></div>`}
function ordersWithAdjustments(){const movements=state.adjustments||[];return (state.orders||[]).map(order=>({...order,adjustments:movements.filter(movement=>String(movement.orderId)===String(order.id))}))}
function editingOrder(){return editingOrderId?state.orders.find(o=>String(o.id)===String(editingOrderId)):null}
function adminContent(){if(adminSection==='service')return servicePanel(state,Date.now());if(adminSection==='calendar')return calendarPanel(state.calendar);if(adminSection==='history')return orderHistoryPanel(state.orders,historyFilters,state.adjustments||[],money);if(adminSection==='orders')return `<h1>Ordini</h1><div class="actions"><button class="btn primary" id="external">+ Ordine dal ristorante</button><button class="btn secondary" id="toggle-online">Online: ${state.online?'attivi':'sospesi'}</button></div>${state.orders.map(orderCard).join('')||'<p>Nessun ordine.</p>'}`;if(adminSection==='menu')return `<h1>Menu</h1><div class="grid">${state.menu.map(p=>`<article class="card"><h2>${p.name}</h2><p>${money(p.price)}</p><button class="btn secondary availability" data-id="${p.id}">${p.available?'Disponibile':'Non disponibile'}</button></article>`).join('')}</div>`;const day=state.activeDay?.date||historyDates(state.orders)[0]||'';const rows=ordersWithAdjustments();return `<h1>Report</h1><p class="history-count">Giornata ${day||'non ancora aperta'}</p><div class="grid">${reportCard('Pranzo',dailyReport(rows,day,'lunch'))}${reportCard('Serale',dailyReport(rows,day,'dinner'))}${reportCard('Giornata',dailyReport(rows,day))}</div>`}
function reportCard(label,r){return `<article class="card"><span class="eyebrow">${label}</span><div class="metric">${money(r.net)}</div><p>${r.orders} ordini · ${r.pizzas} pizze</p><small>Lordo ${money(r.gross)} · Trattenute ${money(r.fees)}<br>Supplementi ${money(r.supplements||0)} · Rimborsi ${money(r.refunds||0)}</small></article>`}
function itemDetails(item){const changes=customizationLines(item);return `<p><b>${item.quantity}× ${item.name}</b>${changes.map(line=>`<br>${line}`).join('')}${item.note?`<br><span class="${/allerg|celiac|intoller/i.test(item.note)?'warning':''}">${item.note}</span>`:''}</p>`}
function orderNumber(order){return order.sequence?`#${String(order.sequence).padStart(2,'0')}`:`#${order.id}`}
function orderCard(o){return `<article class="card order"><span class="pill">${orderNumber(o)} · ${o.source}</span><h3>${o.customer}</h3><p>${o.payment||'Pagamento non indicato'}</p>${o.items.map(itemDetails).join('')}</article>`}
function kitchen(){const active=state.orders.filter(o=>o.status==='preparing');return `<h1>Cucina</h1><p>${active.length} ordini in preparazione</p><div class="grid">${active.map(o=>{const seconds=Math.floor((o.readyAt-Date.now())/1000),timer=formatTimer(seconds);return `<article class="card order ${timer.late?'late':''}"><span class="pill">${orderNumber(o)} · ${o.source}</span><div class="timer">${timer.text}</div><p>Ordinato alle ${new Date(o.createdAt).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'})} · ${o.payment||'Pagamento non indicato'}</p>${o.items.map(itemDetails).join('')}<button class="btn primary ready" data-id="${o.id}">ORDINE PRONTO</button></article>`}).join('')||'<div class="card"><h2>Coda libera</h2><p>Nessuna comanda da preparare.</p></div>'}</div>`}
function bind(){
  document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>document.querySelector('#products').innerHTML=products(b.dataset.filter));
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
  document.querySelector('#checkout')?.addEventListener('click',()=>{
    const phone=document.querySelector('#phone').value;
    if(!orderingOpen())return toast(currentClosure().closed?currentClosure().message:'Il servizio online non è aperto.');
    if(!isValidItalianPhone(phone))return toast('Inserisci un numero di telefono italiano valido.');
    const paymentId=document.querySelector('input[name="payment"]:checked').value;
    const payment=DEMO_PAYMENT_METHODS.find(method=>method.id===paymentId);
    const total=state.cart.reduce((n,i)=>n+i.price,0),eta=estimateMinutes(pizzasAhead(),state.capacity),businessDate=state.activeDay.date,service=state.services[state.shift],sequence=nextServiceSequence(state.orders,service,state.activeDay),fees=total*payment.feeRate;
    const order={id:143+state.orders.length,requestToken:crypto.randomUUID(),sequence,businessDate,businessDayId:state.activeDay.id,serviceId:service.id,source:'WEB',customer:document.querySelector('#name').value||'Cliente',phone,paymentMethod:payment.id,payment:payment.label,status:'preparing',shift:state.shift,createdAt:Date.now(),readyAt:Date.now()+eta*60000,total,gross:total,fee:fees,fees,items:state.cart.map(i=>({...i,quantity:1}))};
    state.orders.push(order);void repository.createOrder(order).catch(reportRepositoryError);
    state.cart=[];save();render();toast('Ordine demo inviato in cucina!');
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
  document.querySelectorAll('.availability').forEach(b=>b.onclick=()=>{const p=state.menu.find(x=>x.id===b.dataset.id);p.available=!p.available;save();render();void repository.saveProduct(p).catch(reportRepositoryError)});
  document.querySelectorAll('.ready').forEach(b=>b.onclick=async()=>{try{await repository.updateOrderStatus(b.dataset.id,'ready');if(runtime.mode==='supabase')await refreshRepositoryState();else{state.orders.find(o=>String(o.id)===b.dataset.id).status='ready';save();render()}}catch{reportRepositoryError()}});
  const dialog=document.querySelector('.dialog-card');
  if(dialog)releaseDialogTrap=trapDialogFocus(dialog,finishDialog);
}
try{await stateRefresh.refresh()}catch{}
render();hasRendered=true;setInterval(()=>{if(state.view==='kitchen')render()},1000);
repository.subscribe(()=>{void stateRefresh.schedule()});
runtime.auth.onChange(session=>{state.creator=isCreatorSession(session);void stateRefresh.schedule()});
