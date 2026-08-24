import { isValidItalianPhone, estimateMinutes, formatTimer, summarizeOrders, calculateCustomizedPrice, DEMO_PAYMENT_METHODS, mergeMenuDefaults, customizationLines } from './domain.js';
import { nextDailySequence, resolveBusinessDate, resolveClosure } from './operations.js';
import { dailyReport } from './reports.js';
import { addExceptionalOpening, addHoliday, calendarPanel, updateWeeklyClosure } from './views/calendar.js';
import { buildCloseDialog, closeService, reopenService, servicePanel, shiftLabel } from './views/service.js';
import { dialogMarkup } from './ui/dialog.js';

const defaults={view:'customer',creator:false,shift:null,capacity:90,online:true,cart:[],calendar:{closedWeekdays:[2],exceptions:[]},services:{lunch:null,dinner:null},activeDay:null,menu:[
 {id:'margherita',type:'pizza',name:'Margherita',price:8,emoji:'🍕',ingredients:['Pomodoro','Mozzarella','Basilico'],allergens:['Glutine','Latte'],additions:[{name:'Mozzarella di bufala',price:2},{name:'Prosciutto cotto',price:2},{name:'Olive',price:1}],available:true},
 {id:'diavola',type:'pizza',name:'Diavola',price:10,emoji:'🌶️',ingredients:['Pomodoro','Mozzarella','Salame piccante'],allergens:['Glutine','Latte'],additions:[{name:'Cipolla',price:1},{name:'Olive',price:1},{name:'Bufala',price:2}],available:true},
 {id:'bufala',type:'pizza',name:'Bufala',price:11,emoji:'🍅',ingredients:['Pomodoro','Bufala','Basilico'],allergens:['Glutine','Latte'],additions:[{name:'Prosciutto crudo',price:2.5},{name:'Acciughe',price:2}],available:true},
 {id:'cola',type:'drink',name:'Cola',price:3,emoji:'🥤',ingredients:[],available:true}],orders:[]};
let state=load(); let adminSection='service'; let customizing=null; let pendingDialog=null;
function load(){try{const saved=JSON.parse(localStorage.getItem('hm-state')||'{}');return {...defaults,...saved,calendar:{...defaults.calendar,...(saved.calendar||{}),exceptions:saved.calendar?.exceptions||[]},services:{...defaults.services,...(saved.services||{})},menu:mergeMenuDefaults(saved.menu||[],defaults.menu)}}catch{return structuredClone(defaults)}}
function save(){localStorage.setItem('hm-state',JSON.stringify(state))}
function money(v){return new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(v)}
function toast(text){const el=document.querySelector('#toast');el.textContent=text;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2200)}
function pizzasAhead(){return state.orders.filter(o=>o.status==='preparing').reduce((n,o)=>n+o.items.reduce((s,i)=>s+i.quantity,0),0)}
function currentClosure(){const date=resolveBusinessDate(Date.now(),state.activeDay),closure=resolveClosure(date,state.calendar.closedWeekdays,state.calendar.exceptions);return {...closure,date,message:closure.message||(closure.closed?'Chiuso per riposo settimanale':'')}}
function orderingOpen(){return Boolean(state.shift&&state.services[state.shift]?.status==='open'&&state.online&&!currentClosure().closed)}
function render(){document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{state.view=b.dataset.view;pendingDialog=null;save();render()});document.querySelector('#app').innerHTML=(state.view==='customer'?customer():state.view==='creator'?creator():kitchen())+dialogMarkup(pendingDialog,money);bind()}
function customer(){const eta=estimateMinutes(pizzasAhead(),state.capacity),closure=currentClosure(),open=orderingOpen();return `<section class="hero"><div><span class="eyebrow">Pizza calda, senza attese inutili</span><h1>Il tuo incontro con la pizza.</h1><p>Ordina online e ritira a Milano, Piola.</p></div><div class="status ${closure.closed?'closed-status':''}"><b>${open?'Ordini aperti':'Ordini al momento chiusi'}</b>${closure.closed?`<p class="closure-reason"><strong>${closure.message}</strong><br>${closure.date}</p>`:`<p>Attesa indicativa: ${eta}–${eta+5} minuti</p>`}</div></section><div class="tabs"><button class="btn primary" data-filter="pizza">Pizze</button><button class="btn secondary" data-filter="drink">Bibite</button><button class="btn secondary" id="cart-open">Carrello · ${state.cart.length}</button></div><section class="grid" id="products">${products('pizza')}</section><aside id="cart" class="drawer hidden">${cart()}</aside>${customizing?customizer():''}`}
function products(type){const closed=currentClosure().closed;return state.menu.filter(p=>p.type===type&&p.available).map(p=>`<article class="card product"><div class="emoji">${p.emoji}</div><h2>${p.name}</h2><p>${p.ingredients.join(' · ')||'Fresca e dissetante'}</p><div class="price">${money(p.price)}</div><button class="btn primary add" data-id="${p.id}" ${closed?'disabled':''}>${closed?'Ordini chiusi':'Personalizza e aggiungi'}</button></article>`).join('')}
function cart(){const total=state.cart.reduce((n,i)=>n+i.price,0),closed=currentClosure().closed;return `<button class="btn secondary" id="cart-close">Chiudi</button><h2>Il tuo ordine</h2>${state.cart.map((i,x)=>`<div class="card"><b>${i.name}</b><p>${i.removed?.length?`Senza: ${i.removed.join(', ')}<br>`:''}${i.additions?.filter(a=>a.quantity).map(a=>`${a.quantity}× ${a.name}`).join(', ')||''}</p><p>${i.note||'Nessuna nota'}</p><button data-remove="${x}">Rimuovi</button></div>`).join('')||'<p>Il carrello è vuoto.</p>'}<h3>Totale ${money(total)}</h3>${state.cart.length?`<div class="field"><label>Nome<input id="name"></label></div><div class="field"><label>Telefono<input id="phone" inputmode="tel"></label></div><div class="field"><span>Pagamento dimostrativo</span><div class="payment-grid">${DEMO_PAYMENT_METHODS.map((method,index)=>`<label class="payment-option"><input type="radio" name="payment" value="${method.id}" ${index===0?'checked':''}> <b>${method.label}</b></label>`).join('')}</div></div><button class="btn primary" id="checkout" ${closed?'disabled':''}>${closed?'Ordini chiusi':'Conferma ordine demo'}</button>`:''}`}

function customizer(){const p=customizing.product,price=calculateCustomizedPrice(p.price,customizing.additions);return `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-label="Personalizza ${p.name}"><div class="modal-head"><div><span class="eyebrow">Personalizza la tua pizza</span><h2>${p.name}</h2></div><button class="btn secondary" id="custom-close">Chiudi</button></div><div class="modal-photo">${p.emoji}</div><h3>Ingredienti inclusi</h3>${p.ingredients.map((ingredient,index)=>`<div class="option-row"><span>${ingredient}</span><div class="stepper"><button class="btn secondary ingredient-toggle" data-index="${index}">${customizing.removed.includes(ingredient)?'+':'−'}</button><b>${customizing.removed.includes(ingredient)?'TOLTO':'INCLUSO'}</b></div></div>`).join('')}<h3>Aggiunte</h3>${customizing.additions.map((addition,index)=>`<div class="option-row"><span>${addition.name} · ${money(addition.price)}</span><div class="stepper"><button class="btn secondary addition-minus" data-index="${index}">−</button><b>${addition.quantity}</b><button class="btn secondary addition-plus" data-index="${index}">+</button></div></div>`).join('')}<div class="allergens"><b>Allergeni: ${(p.allergens||[]).join(', ')||'nessuno dichiarato'}</b><p>In caso di allergie o intolleranze scrivilo nelle note e contatta il locale. Può verificarsi contaminazione crociata.</p></div><div class="field"><label>Note per questa pizza<textarea id="custom-note" rows="3" placeholder="Es. allergia alle noci, celiaco, ben cotta…">${customizing.note}</textarea></label></div><button class="btn primary" id="custom-add">Aggiungi al carrello · ${money(price)}</button></section></div>`}
function creator(){if(!state.creator)return `<div class="card" style="max-width:440px;margin:auto"><span class="eyebrow">Area riservata</span><h1 style="font-size:44px">Creator</h1><div class="field"><label>Username<input id="user"></label></div><div class="field"><label>Password<input id="pass" type="password"></label></div><button class="btn primary" id="login">Accedi</button></div>`;return `<div class="admin"><aside class="sidebar">${['service','calendar','orders','menu','report'].map(s=>`<button class="btn ${adminSection===s?'primary':'secondary'} admin-nav" data-section="${s}">${({service:'Servizio',calendar:'Calendario',orders:'Ordini',menu:'Menu',report:'Report'})[s]}</button>`).join('')}</aside><section>${adminContent()}</section></div>`}
function adminContent(){if(adminSection==='service')return servicePanel(state.services,resolveBusinessDate(Date.now(),state.activeDay));if(adminSection==='calendar')return calendarPanel(state.calendar);if(adminSection==='orders')return `<h1>Ordini</h1><div class="actions"><button class="btn primary" id="external">+ Ordine dal ristorante</button><button class="btn secondary" id="toggle-online">Online: ${state.online?'attivi':'sospesi'}</button></div>${state.orders.map(orderCard).join('')||'<p>Nessun ordine.</p>'}`;if(adminSection==='menu')return `<h1>Menu</h1><div class="grid">${state.menu.map(p=>`<article class="card"><h2>${p.name}</h2><p>${money(p.price)}</p><button class="btn secondary availability" data-id="${p.id}">${p.available?'Disponibile':'Non disponibile'}</button></article>`).join('')}</div>`;const lunch=summarizeOrders(state.orders,'lunch'),dinner=summarizeOrders(state.orders,'dinner');return `<h1>Report</h1><div class="grid">${reportCard('Pranzo',lunch)}${reportCard('Serale',dinner)}${reportCard('Giornata',{orders:lunch.orders+dinner.orders,pizzas:lunch.pizzas+dinner.pizzas,gross:lunch.gross+dinner.gross,fees:lunch.fees+dinner.fees,net:lunch.net+dinner.net})}</div>`}
function reportCard(label,r){return `<article class="card"><span class="eyebrow">${label}</span><div class="metric">${money(r.net)}</div><p>${r.orders} ordini · ${r.pizzas} pizze</p><small>Lordo ${money(r.gross)} · Trattenute ${money(r.fees)}</small></article>`}
function itemDetails(item){const changes=customizationLines(item);return `<p><b>${item.quantity}× ${item.name}</b>${changes.map(line=>`<br>${line}`).join('')}${item.note?`<br><span class="${/allerg|celiac|intoller/i.test(item.note)?'warning':''}">${item.note}</span>`:''}</p>`}
function orderNumber(order){return order.sequence?`#${String(order.sequence).padStart(2,'0')}`:`#${order.id}`}
function orderCard(o){return `<article class="card order"><span class="pill">${orderNumber(o)} · ${o.source}</span><h3>${o.customer}</h3><p>${o.payment||'Pagamento non indicato'}</p>${o.items.map(itemDetails).join('')}</article>`}
function kitchen(){const active=state.orders.filter(o=>o.status==='preparing');return `<h1>Cucina</h1><p>${active.length} ordini in preparazione</p><div class="grid">${active.map(o=>{const seconds=Math.floor((o.readyAt-Date.now())/1000),timer=formatTimer(seconds);return `<article class="card order ${timer.late?'late':''}"><span class="pill">${orderNumber(o)} · ${o.source}</span><div class="timer">${timer.text}</div><p>Ordinato alle ${new Date(o.createdAt).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'})} · ${o.payment||'Pagamento non indicato'}</p>${o.items.map(itemDetails).join('')}<button class="btn primary ready" data-id="${o.id}">ORDINE PRONTO</button></article>`}).join('')||'<div class="card"><h2>Coda libera</h2><p>Nessuna comanda da preparare.</p></div>'}</div>`}
function bind(){
  document.onkeydown=pendingDialog?event=>{if(event.key==='Escape'){pendingDialog=null;render()}}:null;
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
    const total=state.cart.reduce((n,i)=>n+i.price,0),eta=estimateMinutes(pizzasAhead(),state.capacity),businessDate=resolveBusinessDate(Date.now(),state.activeDay),sequence=nextDailySequence(state.orders,businessDate),fees=total*payment.feeRate,service=state.services[state.shift];
    state.orders.push({id:143+state.orders.length,sequence,businessDate,serviceId:service.id,source:'WEB',customer:document.querySelector('#name').value||'Cliente',phone,payment:payment.label,status:'preparing',shift:state.shift,createdAt:Date.now(),readyAt:Date.now()+eta*60000,total,gross:total,fee:fees,fees,items:state.cart.map(i=>({...i,quantity:1}))});
    state.cart=[];save();render();toast('Ordine demo inviato in cucina!');
  });
  document.querySelector('#login')?.addEventListener('click',()=>{if(document.querySelector('#user').value==='creator'&&document.querySelector('#pass').value==='pizza143'){state.creator=true;save();render()}else toast('Credenziali non corrette')});
  document.querySelectorAll('.admin-nav').forEach(b=>b.onclick=()=>{adminSection=b.dataset.section;render()});
  document.querySelectorAll('.service-action').forEach(b=>b.onclick=()=>{
    const shift=b.dataset.shift,action=b.dataset.serviceAction,existing=state.services[shift];
    if(action==='close'){
      const summary=dailyReport(state.orders,existing.businessDate,shift);
      pendingDialog={...buildCloseDialog(existing,state.orders,summary),serviceId:existing.id,label:shiftLabel(shift)};
      render();
      return;
    }
    const closure=currentClosure();
    if(closure.closed)return toast(closure.message);
    if(state.shift&&state.shift!==shift)return toast(`Chiudi prima il servizio ${shiftLabel(state.shift)}.`);
    const businessDate=resolveBusinessDate(Date.now(),state.activeDay),sameDay=existing?.businessDate===businessDate;
    state.services[shift]=sameDay?reopenService(existing):{id:`${shift}-${businessDate}-${Date.now()}`,shift,status:'open',businessDate,sequenceBase:nextDailySequence(state.orders,businessDate)-1,sessions:[{openedAt:Date.now(),closedAt:null}]};
    state.activeDay={date:businessDate,status:'open'};
    state.shift=shift;
    save();render();toast(sameDay?'Servizio riaperto.':'Servizio aperto.');
  });
  document.querySelectorAll('[data-dialog-action]').forEach(b=>b.onclick=()=>{
    if(b.dataset.dialogAction==='dismiss')adminSection='orders';
    if(b.dataset.dialogAction==='confirm-close'){
      const shift=pendingDialog.shift,service=state.services[shift];
      if(service?.id===pendingDialog.serviceId){
        state.services[shift]=closeService(service);
        if(state.shift===shift)state.shift=null;
        if(shift==='dinner'&&document.querySelector('#close-business-day')?.checked)state.activeDay={date:service.businessDate,status:'closed'};
        save();toast(shift==='dinner'?'Servizio serale chiuso.':'Servizio pranzo chiuso.');
      }
    }
    pendingDialog=null;render();
  });
  document.querySelector('#weekly-closure-form')?.addEventListener('submit',event=>{event.preventDefault();const form=new FormData(event.currentTarget);state.calendar=updateWeeklyClosure(state.calendar,form.get('weekday'));save();render();toast('Chiusura settimanale aggiornata.')});
  document.querySelector('#holiday-form')?.addEventListener('submit',event=>{event.preventDefault();const form=new FormData(event.currentTarget),holiday={from:form.get('from'),to:form.get('to'),message:form.get('message')};if(holiday.from>holiday.to)return toast('La data finale deve seguire quella iniziale.');state.calendar=addHoliday(state.calendar,holiday);save();render();toast('Periodo di ferie aggiunto.')});
  document.querySelector('#exceptional-opening-form')?.addEventListener('submit',event=>{event.preventDefault();const form=new FormData(event.currentTarget);state.calendar=addExceptionalOpening(state.calendar,{date:form.get('date'),message:form.get('message')});save();render();toast('Apertura straordinaria aggiunta.')});
  document.querySelectorAll('.remove-calendar-exception').forEach(b=>b.onclick=()=>{state.calendar={...state.calendar,exceptions:state.calendar.exceptions.filter((_,index)=>index!==Number(b.dataset.index))};save();render();toast('Eccezione rimossa.')});
  document.querySelector('#toggle-online')?.addEventListener('click',()=>{state.online=!state.online;save();render()});
  document.querySelector('#external')?.addEventListener('click',()=>{if(!state.shift)return toast('Apri prima un servizio.');toast('La schermata ordine ristorante sarà il prossimo flusso operativo.')});
  document.querySelectorAll('.availability').forEach(b=>b.onclick=()=>{const p=state.menu.find(x=>x.id===b.dataset.id);p.available=!p.available;save();render()});
  document.querySelectorAll('.ready').forEach(b=>b.onclick=()=>{state.orders.find(o=>String(o.id)===b.dataset.id).status='ready';save();render()});
  document.querySelector('.dialog-card button')?.focus();
}
render();setInterval(()=>{if(state.view==='kitchen')render()},1000);
