import { calculateCustomizedPrice, DEMO_PAYMENT_METHODS, mergeMenuDefaults, customizationLines } from './domain.js';
import { DEFAULT_OVEN, ovenThroughput, readyInMinutes } from './oven.js';
import { resolveBusinessDate, resolveClosure } from './operations.js';
import { dailyReport, shiftBreakdown } from './reports.js';
import { calendarPanel, holidayException, openingException } from './views/calendar.js';
import { historyDates, orderHistoryPanel } from './views/order-history.js';
import { orderEditorPanel } from './views/order-editor.js';
import { addLine, draftFromOrder, draftIsValid, draftItems, draftTotal, setNote, stepAddition, stepQuantity, toggleRemoved } from './views/order-draft.js';
import { calculateAdjustment } from './payments.js';
import { LOCALES, translate, translatePaymentMethod, translateProduct } from './i18n.js';
import { buildCustomerRecap, orderReceiptPanel } from './views/order-receipt.js';
import { additionRow, draftFromProduct, emptyDraft, menuPanel, menuList, ingredientCatalogList, menuProductPayload } from './views/menu-editor.js';
import { counterOrderIssues, counterOrderPanel, counterOrderPayload } from './views/counter-order.js';
import { orderDetailPanel } from './views/order-detail.js';
import { closingSteps, workingOrders } from './views/order-flow.js';
import { buildCloseDialog, closeService, nextServiceSequence, serviceAcceptsOrders, servicePanel, shiftLabel, startServiceWithCalendar } from './views/service.js';
import { dialogMarkup, restoreDialogFocus, trapDialogFocus } from './ui/dialog.js';
import { linesMarkup, printMarkup, ticketsToPrint } from './print/print-queue.js';
import { cashReport, cashReportLines } from './views/cash-report.js';
import { promisedMinutes } from './messages.js';
import { allergenNames, allergenSentence } from './allergens.js';
import { announceOrders, arrivedOrders, unlockChime, alarmActive, stopAlarm } from './notify.js';
import { orderSuggestions } from './suggestions.js';
import { countdownText, waitingProgress, shouldForgetReceipt } from './views/waiting-room.js';
import { groupCartLines, groupOrderItems, isPlain, plainCartCount } from './cart-lines.js';
import { openingStatus } from './opening-hours.js';
import { weeklyPizzas, regularPizzas, withDefaultAdditions, autoWeeklyPizza, ingredientCatalog } from './menu-catalog.js';
import { loginProblem } from './login-errors.js';
import { statoConnessione } from './connessione.js';
import { pagaOnline, urlCheckout } from './pagamento-online.js';
import { nameCheck, normalizePhoneNumber, phoneProblem } from './customer-identity.js';
import { kitchenPanel } from './views/kitchen.js';
import { appConfig } from './config.js';
import { bootstrapDataLayer, isCreatorSession } from './bootstrap.js';
import { applyRepositorySnapshot, createRepositoryRefreshCoordinator } from './app-state.js';

const defaults={view:'customer',creator:false,locale:'it',receipt:null,contact:null,shift:null,capacity:90,online:true,cart:[],calendar:{closedWeekdays:[2],exceptions:[]},services:{lunch:null,dinner:null},activeDay:null,menu:[
 {id:'margherita',type:'pizza',name:'Margherita',price:8,emoji:'🍕',ingredients:['Pomodoro','Mozzarella','Basilico'],allergens:['Glutine','Latte'],additions:[{name:'Mozzarella di bufala',price:2},{name:'Prosciutto cotto',price:2},{name:'Olive',price:1}],available:true},
 {id:'diavola',type:'pizza',name:'Diavola',price:10,emoji:'🌶️',ingredients:['Pomodoro','Mozzarella','Salame piccante'],allergens:['Glutine','Latte'],additions:[{name:'Cipolla',price:1},{name:'Olive',price:1},{name:'Bufala',price:2}],available:true},
 {id:'bufala',type:'pizza',name:'Bufala',price:11,emoji:'🍅',ingredients:['Pomodoro','Bufala','Basilico'],allergens:['Glutine','Latte'],additions:[{name:'Prosciutto crudo',price:2.5},{name:'Acciughe',price:2}],available:true},
 {id:'cola',type:'drink',name:'Cola',price:3,emoji:'🥤',ingredients:[],available:true}],orders:[]};
let state=load();
// Alla riapertura: se l'ultimo ordine e' stato consegnato (o e' passato molto
// tempo), lo dimentichiamo cosi' il cliente riparte dal menu invece di ritrovarsi
// fermo sull'attesa di prima.
if(shouldForgetReceipt({receipt:state.receipt,receiptDone:state.receiptDone,now:Date.now()})){state.receipt=null;state.receiptDone=false;save()}
const runtime=await bootstrapDataLayer({config:appConfig,supabase:globalThis.supabase,storage:localStorage,initialState:{menu:state.menu,calendar:state.calendar,services:state.services,activeDay:state.activeDay,shift:state.shift,online:state.online,orders:state.orders}}); const repository=runtime.repository; state.creator=runtime.mode==='local'?state.creator:isCreatorSession(runtime.session); let adminSection='orders'; let customizing=null; let confirming=null; let pendingName=null; let askedName=null; let productFilter='pizza'; let menuDraft=null; let counterDraft=null; let detailOrderId=null; let historyFilters={}; let editingOrderId=null; let editorDraft=null; let editorOpenLine=null; let editorAdding=false; let refocusHistoryQuery=false; let pendingDialog=null; let releaseDialogTrap=null; let dialogReturnFocus=null; let hasRendered=false; let ordersSeen=null; let ultimoContatto=null; let orderProgress=null; let progressTimer=null; let printed=new Set(); let incomeDetail=undefined; let menuFilter=''; let menuTab='pizza';
let seenOrders=new Set(JSON.parse(localStorage.getItem('hm-seen-orders')||'[]')); let autoPrint=localStorage.getItem('hm-autoprint')==='1';
function load(){try{const saved=JSON.parse(localStorage.getItem('hm-state')||'{}');return {...defaults,...saved,calendar:{...defaults.calendar,...(saved.calendar||{}),exceptions:saved.calendar?.exceptions||[]},services:{...defaults.services,...(saved.services||{})},menu:mergeMenuDefaults(saved.menu||[],defaults.menu)}}catch{return structuredClone(defaults)}}
function save(){localStorage.setItem('hm-state',JSON.stringify(state))}
function reportRepositoryError(){toast('Dati salvati in locale: connessione non disponibile.')}
const stateRefresh=createRepositoryRefreshCoordinator({repository,apply(snapshot){
  ultimoContatto=Date.now();
  // Chi sta in cassa non guarda lo schermo tutto il tempo: se un ordine entra
  // in silenzio lo si scopre col cliente sulla porta.
  const arrivati=state.creator?arrivedOrders(ordersSeen,snapshot.orders??[]):[];
  ordersSeen=(snapshot.orders??[]).map(o=>({id:o.id,sequence:o.sequence,status:o.status}));
  state=applyRepositorySnapshot(state,snapshot);save();
  if(hasRendered)render();
  const avviso=announceOrders(arrivati);
  if(avviso)toast(avviso);
  if(autoPrint&&arrivati.length)stampaComande(ticketsToPrint(arrivati,printed));
},onError:reportRepositoryError});
async function refreshRepositoryState(){try{await stateRefresh.refresh()}catch{}}
function t(key){return translate(key,state.locale)}
function pname(product){return translateProduct(product.names??{it:product.name},state.locale)||product.name||''}
// La descrizione non ha ripiego: in inglese o c'e' in inglese o non si mostra.
// Una frase italiana sotto la bandiera inglese e' un errore che si vede.
// Gli allergeni si dicono sempre e nello stesso modo, dal menu alla comanda.
function pallergens(entry){return allergenNames(entry.allergenLabels??entry.allergens??[],state.locale)}
function pallergenLine(entry){return allergenSentence(pallergens(entry),state.locale)}
function pdesc(product){const d=product.descriptions??{};return state.locale==='it'?(d.it??''):(d.en??'')}
function localIngredient(name,translations){const match=(translations||[]).find(entry=>entry.it===name);return match?translateProduct(match,state.locale):name}
function money(v){return new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(v)}
// Un colpetto sul telefono a ogni scelta: si capisce che ha registrato senza
// dover guardare. Dove non c'e' il motorino, non succede niente.
function haptic(){try{navigator.vibrate?.(8)}catch{}}
function toast(text){const el=document.querySelector('#toast');el.textContent=text;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2200)}
// Solo le pizze occupano il forno: le bibite non allungano l'attesa di nessuno.
function isPizza(item){const product=state.menu.find(p=>String(p.databaseId??p.id)===String(item.productId??item.id));return product?product.type==='pizza':true}
function countPizzas(items=[]){return items.filter(isPizza).reduce((n,i)=>n+Number(i.quantity??1),0)}
// Chi guarda il menu non vede gli ordini altrui: la coda gliela dice il server.
function pizzasAhead(){return state.pizzasQueued??state.orders.filter(o=>o.status==='preparing'&&o.paymentStatus!=='awaiting').reduce((n,o)=>n+countPizzas(o.items),0)}
function ovenSettings(){return state.services[state.shift]?.oven??DEFAULT_OVEN}
function waitMinutes(pizzas){return readyInMinutes({ahead:pizzasAhead(),pizzas,...ovenSettings()})}
function currentClosure(date=resolveBusinessDate(Date.now(),state.activeDay)){const closure=resolveClosure(date,state.calendar.closedWeekdays,state.calendar.exceptions);return {...closure,date,message:closure.message||(closure.closed?'Chiuso per riposo settimanale':'')}}
// Gli orari fissi (pranzo 12-14:15, sera 19-22:15) decidono da soli: fuori da
// quelle due finestre non si ordina, anche se il servizio fosse rimasto aperto.
function hoursStatus(){return openingStatus(Date.now())}
function orderingOpen(){return Boolean(hoursStatus().open&&state.shift&&state.services[state.shift]?.status==='open'&&state.online&&!currentClosure().closed)}
// Il messaggio da mostrare quando siamo chiusi per orario: invita a chiamare la
// pizzeria e dice quando si riapre.
function closedHoursMessage(){
  const status=hoursStatus();
  if(status.open)return null;
  const tel=appConfig.pizzeriaPhone?`Chiama la pizzeria allo ${appConfig.pizzeriaPhone}`:'Chiama la pizzeria';
  const quando=status.nextShift==='lunch'?`Torna a pranzo dalle ${status.nextOpensAt}.`
    :status.nextShift==='dinner'?`Torna stasera dalle ${status.nextOpensAt}.`
    :'Torna domani a pranzo dalle 12:00.';
  return {tel,quando};
}
// La comanda esce da sola quando entra l'ordine: se qualcuno deve premere
// «stampa», in un venerdi' sera non lo premera'. Il browser apre comunque la
// finestra di stampa, a meno che Chrome non sia avviato con --kiosk-printing.
function stampaComande(orders){
  if(!orders.length)return;
  stampaFoglio(printMarkup(orders,{isDrink:item=>!isPizza(item)}));
}
function stampaFoglio(html){
  const area=document.querySelector('#print-area');
  if(!area)return;
  area.innerHTML=html;
  window.print();
}
// Un ordine resta segnato come nuovo finche' il cameriere non lo apre: serve a
// non perderne uno quando arrivano tutti insieme.
function nuovoOrdine(order){return !seenOrders.has(String(order.id))}
function segnaVisto(id){
  // Appena si tocca un ordine, l'allarme si spegne: e' stato visto.
  stopAlarm();
  seenOrders.add(String(id));
  // Solo gli ordini ancora aperti: la memoria non deve crescere all'infinito.
  const aperti=new Set((state.orders||[]).map(o=>String(o.id)));
  seenOrders=new Set([...seenOrders].filter(x=>aperti.has(x)));
  localStorage.setItem('hm-seen-orders',JSON.stringify([...seenOrders]));
}
function ordiniNuovi(){return workingOrders(state.orders||[]).filter(nuovoOrdine).length}
// Parole che si capiscono senza sapere come e' fatto il programma: chi apre
// questo pannello sta lavorando, non deve indovinare cosa c'e' dietro un nome.
const SEZIONI=[
  ['orders','\u{1F355}','Ordini di adesso'],
  ['service','\u{1F513}','Apri e chiudi'],
  ['menu','\u{1F4D6}','Il menu'],
  ['history','\u{1F553}','Ordini passati'],
  ['report','\u{1F4B6}','Incassi'],
  ['calendar','\u{1F4C5}','Giorni di chiusura']
];
// La spia del collegamento. Non serve a chi sa leggere i log: serve a chi sta
// lavorando, per capire in un'occhiata se il sistema sta parlando col server o
// se sta guardando uno schermo morto.
function spiaConnessione(){
  const stato=statoConnessione({online:navigator.onLine,ultimoContatto,now:Date.now()});
  return `<div class="spia ${stato.chiave}">
    <span class="spia-dot" aria-hidden="true"></span>
    <span>${esc(stato.testo)}</span>
    ${stato.chiave==='ok'?'':'<button class="btn secondary" id="riprova">Riprova adesso</button>'}
  </div>`;
}
function esc(value=''){return String(value).replace(/[&<>'"]/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'})[character])}
function render(){document.documentElement.lang=state.locale;releaseDialogTrap?.();releaseDialogTrap=null;document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{state.view=b.dataset.view;pendingDialog=null;save();render()});const side=document.querySelector('#topbar-side');if(side)side.innerHTML=state.view==='customer'?langSwitch():'';document.querySelector('#app').innerHTML=(state.view==='customer'?customer():state.view==='creator'?creator():kitchen())+dialogMarkup(pendingDialog,money)+alarmBanner();bind()}
// La fascia grande che resta finche' non la tocchi: l'allarme suona e vibra
// finche' qualcuno non conferma di aver visto l'ordine.
function alarmBanner(){if(!alarmActive())return '';return `<button class="alarm-banner" id="alarm-stop"><span class="alarm-banner-dot"></span><span class="alarm-banner-text"><b>Nuovo ordine!</b>Tocca per fermare l'avviso</span></button>`}
function fermaAllarme(){stopAlarm();ordersSeen=(state.orders??[]).map(o=>({id:o.id,sequence:o.sequence,status:o.status}));render()}
function langSwitch(){return `<div class="lang-switch">${LOCALES.map(code=>`<button class="btn ${state.locale===code?'primary':'secondary'} lang-pick" data-locale="${code}">${code.toUpperCase()}</button>`).join('')}</div>`}
function finishDialog(){const selector=dialogReturnFocus;pendingDialog=null;render();restoreDialogFocus(selector);dialogReturnFocus=null}
function customer(){
  if(state.receipt)return orderReceiptPanel(state.receipt,state.locale,money,orderProgress);
  const eta=waitMinutes(Math.max(1,countPizzas(state.cart.map(i=>({...i,quantity:1}))))),closure=currentClosure(),open=orderingOpen(),closedHours=closedHoursMessage();
  const total=state.cart.reduce((n,i)=>n+i.price,0);
  // La foto di apertura e' quella della pizza della settimana, cosi' la
  // vetrina mostra sempre qualcosa di vero e non un piatto a caso.
  const settimanaHero=weeklyPizzas(state.menu);
  const heroDish=settimanaHero[0]||autoWeeklyPizza(state.menu,new Date())||regularPizzas(state.menu)[0];
  const heroFoto=heroImage(heroDish);
  return `<section class="menu-hero">
      ${heroFoto?`<div class="menu-hero-media"><img src="${esc(heroFoto)}" alt="" loading="eager" decoding="async"></div>`:''}
      ${heroDish?`<span class="menu-hero-tag">${settimanaHero.length?t('hero.weekly'):t('hero.today')} \u00b7 ${esc(pname(heroDish))}</span>`:''}
      <div class="menu-hero-content">
        <span class="eyebrow">${t('app.tagline')}</span><h1>${t('app.headline')}</h1><p>${t('app.subtitle')}</p>
      </div>
      <div class="status ${open?'':'closed-status'}"><b>${open?t('status.open'):t('status.closed')}</b>${closure.closed?`<p class="closure-reason"><strong>${esc(closure.message)}</strong><br>${closure.date}</p>`:closedHours?`<p class="closure-reason"><strong>${esc(closedHours.tel)}</strong><br>${esc(closedHours.quando)}</p>`:`<p>${t('status.wait')}: ${eta}\u2013${eta+5} ${t('status.minutes')}</p>`}</div>
    </section>
    <nav class="menu-nav">
      <button class="btn ${productFilter==='pizza'?'primary':'secondary'}" data-filter="pizza">${t('tabs.pizzas')}</button>
      <button class="btn ${productFilter==='drink'?'primary':'secondary'}" data-filter="drink">${t('tabs.drinks')}</button>
    </nav>
    <section class="grid dish-grid" id="products">${products(productFilter)}</section>
    ${state.cart.length?`<div class="cart-bar"><span>${state.cart.length} \u00b7 <strong>${money(total)}</strong></span><button class="btn primary" id="cart-open">${t('tabs.cart')}</button></div>`:''}
    <aside id="cart" class="drawer hidden">${cart()}</aside>
    ${customizing?customizer():''}
    ${confirming?confirmPanel():''}
    ${pendingName?namePanel():''}`;
}

// Foto prese online: se il prodotto non ha una foto sua, ne mostriamo una
// appetitosa presa da un catalogo di immagini libere (Unsplash), scelta in modo
// stabile dal nome cosi' ogni pizza mostra sempre la stessa. La foto vera
// caricata dal locale ha sempre la precedenza.
const _PIZZA_FOTO=[
  'https://images.unsplash.com/photo-1513104890138-7c749659a591',
  'https://images.unsplash.com/photo-1571407970349-bc81e7e96d47',
  'https://images.unsplash.com/photo-1574071318508-1cdbab80d002',
  'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38',
  'https://images.unsplash.com/photo-1604382354936-07c5d9983bd3',
  'https://images.unsplash.com/photo-1593560708920-61dd98c46a4e'
];
const _BIBITA_FOTO=[
  'https://images.unsplash.com/photo-1600271886742-f049cd451bba',
  'https://images.unsplash.com/photo-1581006852262-e4307cf6283a',
  'https://images.unsplash.com/photo-1608270586620-248524c67de9',
  'https://images.unsplash.com/photo-1437418747212-8d9709afab22'
];
function _hash(str){let h=0;for(const ch of String(str||'')){h=(h*31+ch.charCodeAt(0))|0}return Math.abs(h)}
function dishImage(product){
  if(product.imageUrl)return product.imageUrl;
  const pool=product.type==='drink'?_BIBITA_FOTO:_PIZZA_FOTO;
  return `${pool[_hash(product.id||product.name)%pool.length]}?w=600&q=70&auto=format&fit=crop`;
}
// La vetrina merita una foto grande quanto basta per far venire fame a chi
// arriva: stessa immagine della scheda, ma alla risoluzione della testata.
function heroImage(product){
  if(!product)return null;
  if(product.imageUrl)return product.imageUrl;
  return `${_PIZZA_FOTO[_hash(product.id||product.name)%_PIZZA_FOTO.length]}?w=1600&q=80&auto=format&fit=crop`;
}
function dishPhoto(product,variant='dish'){
  const url=dishImage(product);
  const inner=`<img src="${esc(url)}" alt="${esc(pname(product))}" loading="lazy" decoding="async">`;
  const base=variant==='modal'?'modal-photo':'dish-photo';
  return `<div class="${base}">${inner}</div>`;
}

function dishCard(p,closed,weekly=false){
  const ingredients=(p.ingredients||[]).map(name=>localIngredient(name,p.ingredientNames)).join(', ');
  const description=pdesc(p);
  return `<article class="dish${closed?' sold-out':''}${weekly?' dish-weekly':''}">
      ${weekly?'<span class="dish-weekly-badge">Pizza della settimana</span>':''}
      ${dishPhoto(p)}
      <div class="dish-body">
        <h2>${esc(pname(p))}</h2>
        ${ingredients?`<p class="dish-ingredients">${esc(ingredients)}</p>`:''}
        ${description?`<p class="dish-desc">${esc(description)}</p>`:''}
        <p class="dish-allergens${pallergens(p).length?'':' none'}">${esc(pallergenLine(p))}</p>
        <div class="dish-foot">
          <span class="price">${money(p.price)}</span>
          <button class="btn primary add" data-id="${esc(p.id)}" ${closed?'disabled':''}>${closed?t('product.closed'):t('product.customize')}</button>
        </div>
      </div>
    </article>`;
}
function products(type){
  const closed=currentClosure().closed||!hoursStatus().open;
  if(type==='pizza'){
    let settimana=weeklyPizzas(state.menu);
    // Se il locale non ne ha scelta una, ne mettiamo noi una a rotazione
    // settimanale, cosi' la sezione c'e' sempre.
    if(!settimana.length){const auto=autoWeeklyPizza(state.menu,new Date());if(auto)settimana=[auto]}
    const idSettimana=new Set(settimana.map(p=>p.id));
    const normali=regularPizzas(state.menu).filter(p=>!idSettimana.has(p.id));
    if(!settimana.length&&!normali.length)return `<p>${t('product.drink')}</p>`;
    const inEvidenza=settimana.length?`<div class="dish-weekly-band"><h2 class="dish-weekly-title">Pizza della settimana</h2><div class="grid dish-grid">${settimana.map(p=>dishCard(p,closed,true)).join('')}</div></div>`:'';
    return inEvidenza+normali.map(p=>dishCard(p,closed)).join('');
  }
  const list=state.menu.filter(p=>p.type===type&&p.available);
  if(!list.length)return `<p>${t('product.drink')}</p>`;
  return list.map(p=>dishCard(p,closed)).join('');
}

function namePanel(){
  return `<div class="modal-backdrop"><section class="modal confirm" role="dialog" aria-modal="true">
    <h2 class="wait-stage">\u00ab${esc(pendingName)}\u00bb: ${t('name.confirm')}</h2>
    <p class="confirm-sub">${t('name.fake')}</p>
    <div class="confirm-actions">
      <button class="btn secondary" id="name-no">${t('name.confirmNo')}</button>
      <button class="btn primary" id="name-yes">${t('name.confirmYes')}</button>
    </div>
  </section></div>`;
}
function confirmPanel(){
  return `<div class="modal-backdrop"><section class="modal confirm" id="confirm-modal" role="dialog" aria-modal="true" aria-label="${t('confirm.title')}">${confirmBody()}</section></div>`;
}
function confirmBody(){
  const total=state.cart.reduce((n,i)=>n+i.price,0);
  const eta=waitMinutes(countPizzas(state.cart.map(i=>({...i,quantity:1}))));
  const metodo=DEMO_PAYMENT_METHODS.find(m=>m.id===confirming.paymentId);
  const proposte=(confirming.suggestions||[]).map(id=>state.menu.find(p=>p.id===id)).filter(Boolean);
  return `<div class="modal-head"><div><span class="eyebrow">${t('confirm.title')}</span><h2>${t('confirm.when')} ${eta} ${t('status.minutes')}</h2></div></div>
    <p class="confirm-sub">${t('confirm.sub')}</p>
    <ul class="confirm-list">${groupCartLines(state.cart).map(riga=>{
      const i=riga.item;
      const extra=[i.removed?.length?`${t('cart.without')}: ${i.removed.map(name=>localIngredient(name,i.ingredientNames)).join(', ')}`:'',
        i.additions?.filter(a=>a.quantity).map(a=>`${a.quantity}\u00d7 ${translateProduct(a.names??{it:a.name},state.locale)}`).join(', ')||'',
        i.note||''].filter(Boolean);
      return `<li><div><b>${riga.quantity>1?`${riga.quantity}\u00d7 `:''}${esc(pname(i))}</b>${extra.map(line=>`<p>${esc(line)}</p>`).join('')}<p class="cart-allergens">${esc(pallergenLine(i))}</p></div><div class="confirm-side"><span>${money(riga.total)}</span><button class="btn secondary confirm-remove" data-remove-confirm="${riga.indexes[riga.indexes.length-1]}" aria-label="${t('cart.remove')}">\u00d7</button></div></li>`;
    }).join('')}</ul>
    ${proposte.length?`<div class="upsell"><span class="upsell-title">${t('confirm.add')}</span><div class="upsell-row">${proposte.map(p=>{
      const quante=plainCartCount(state.cart,p.id);
      return `<div class="upsell-card${quante?' picked':''}">
        ${p.imageUrl?`<img src="${esc(p.imageUrl)}" alt="" loading="lazy" decoding="async">`:'<span class="upsell-empty"></span>'}
        <b>${esc(pname(p))}</b><span>${money(p.price)}</span>
        <div class="upsell-step"><button class="btn secondary" data-suggest-minus="${esc(p.id)}" ${quante?'':'disabled'}>\u2212</button><b>${quante}</b><button class="btn secondary" data-suggest="${esc(p.id)}">+</button></div>
      </div>`;
    }).join('')}</div></div>`:''}
    <p class="confirm-total"><span>${t('cart.total')}</span><b>${money(total)}</b></p>
    <dl class="confirm-facts">
      <div><dt>${t('cart.payment')}</dt><dd>${esc(translatePaymentMethod(metodo.id,state.locale))}</dd></div>
      ${confirming.name?`<div><dt>${t('confirm.who')}</dt><dd>${esc(confirming.name)}</dd></div>`:''}
      <div><dt>${t('confirm.phone')}</dt><dd>${esc(confirming.phone)}</dd></div>
    </dl>
    <div class="confirm-actions">
      <button class="btn secondary" id="confirm-back">${t('confirm.back')}</button>
      <button class="btn primary" id="confirm-send">${confirming.paymentId==='cash'?t('confirm.send'):`${t('confirm.pay')} ${money(total)}`}</button>
    </div>
    ${confirming.paymentId==='cash'?'':`<p class="confirm-demo">${t('confirm.demo')}</p>`}`;
}
function cart(){const total=state.cart.reduce((n,i)=>n+i.price,0),closed=currentClosure().closed||!hoursStatus().open;return `<div class="cart-head"><h2>${t('cart.title')}</h2><button class="btn secondary" id="cart-close">${t('cart.close')}</button></div>${state.cart.map((i,x)=>{const extra=[i.removed?.length?`${t('cart.without')}: ${i.removed.map(name=>localIngredient(name,i.ingredientNames)).join(', ')}`:'',i.additions?.filter(a=>a.quantity).map(a=>`${a.quantity}\u00d7 ${translateProduct(a.names??{it:a.name},state.locale)}`).join(', ')||'',i.note||''].filter(Boolean);return `<div class="cart-line"><div><b>${esc(pname(i))}</b>${extra.map(line=>`<p>${esc(line)}</p>`).join('')}<p class="cart-allergens">${esc(pallergenLine(i))}</p></div><div class="cart-line-side"><span>${money(i.price)}</span><button class="btn secondary" data-remove="${x}">${t('cart.remove')}</button></div></div>`}).join('')||`<p>${t('cart.empty')}</p>`}<h3 class="cart-total">${t('cart.total')} ${money(total)}</h3>${state.cart.length?`<div class="field"><label>${t('cart.name')}<input id="name" value="${esc(state.contact?.name||'')}"></label></div><div class="field"><label>${t('cart.phone')}<input id="phone" inputmode="tel" value="${esc(state.contact?.phone||'')}"></label></div><div class="field"><label>${t('cart.email')}<input id="email" type="email" inputmode="email" value="${esc(state.contact?.email||'')}"></label></div><div class="field"><span>${t('cart.payment')}</span><div class="payment-grid">${DEMO_PAYMENT_METHODS.map((method,index)=>`<label class="payment-option"><input type="radio" name="payment" value="${method.id}" ${(state.contact?.payment??DEMO_PAYMENT_METHODS[0].id)===method.id?'checked':''}> <b>${translatePaymentMethod(method.id,state.locale)}</b></label>`).join('')}</div></div><button class="btn primary" id="checkout" ${closed?'disabled':''}>${closed?t('product.closed'):t('cart.confirm')}</button>`:''}`}


function customizer(){const p=customizing.product,price=calculateCustomizedPrice(p.price,customizing.additions);return `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-label="${t('custom.title')}"><div class="modal-head"><div><span class="eyebrow">${t('custom.title')}</span><h2>${pname(p)}</h2></div><button class="btn secondary" id="custom-close">${t('cart.close')}</button></div>${dishPhoto(p,'modal')}<h3>${t('custom.included')}</h3>${p.ingredients.map((ingredient,index)=>`<div class="option-row${customizing.removed.includes(ingredient)?' removed':''}" data-row="ing-${index}"><span>${localIngredient(ingredient,p.ingredientNames)}</span><div class="stepper"><button class="btn secondary ingredient-toggle" data-index="${index}">${customizing.removed.includes(ingredient)?'+':'\u2212'}</button><b>${customizing.removed.includes(ingredient)?t('custom.removed'):t('custom.kept')}</b></div></div>`).join('')}<h3>${t('custom.additions')}</h3>${customizing.additions.length>4?`<div class="field add-search-field"><input id="addition-search" type="search" placeholder="Cerca un'aggiunta\u2026" autocomplete="off"></div>`:''}<div id="addition-list">${customizing.additions.map((addition,index)=>`<div class="option-row${addition.quantity?' picked':''}" data-row="add-${index}" data-name="${esc(String(translateProduct(addition.names??{it:addition.name},state.locale)).toLowerCase())}"><span>${translateProduct(addition.names??{it:addition.name},state.locale)} \u00b7 ${money(addition.price)}</span><div class="stepper"><button class="btn secondary addition-minus" data-index="${index}" ${addition.quantity?'':'disabled'}>\u2212</button><b>${addition.quantity}</b><button class="btn secondary addition-plus" data-index="${index}">+</button></div></div>`).join('')}</div><div class="allergens"><b>${esc(pallergenLine(p))}</b><p>${t('allergens.warning')}</p></div><div class="field"><label>${t('custom.note')}<textarea id="custom-note" rows="3" placeholder="${t('custom.notePlaceholder')}">${customizing.note}</textarea></label></div><button class="btn primary" id="custom-add">${t('custom.add')} \u00b7 ${money(price)}</button></section></div>`}

// Cucina e Creator sono la stessa area riservata: le comande contengono nome e
// telefono di chi ordina, non stanno dietro un semplice cambio di scheda.
function loginPanel(titolo,sottotitolo){return `<div class="card login-card"><span class="eyebrow">Area riservata</span><h1>${titolo}</h1><p>${sottotitolo}</p><div class="field"><label>${runtime.mode==='supabase'?'Email':'Username'}<input id="user" ${runtime.mode==='supabase'?'type="email" autocomplete="username"':''}></label></div><div class="field"><label>Password<input id="pass" type="password" autocomplete="current-password"></label></div><button class="btn primary" id="login">Accedi</button></div>`}
function creator(){if(!state.creator)return loginPanel('Creator','Entra per gestire servizio, ordini, menu e report.');const nuovi=ordiniNuovi();return `${spiaConnessione()}${editorDraft?orderEditorPanel(editorDraft,state.menu,money,editorOpenLine,editorAdding):''}<div class="admin"><aside class="sidebar">${SEZIONI.map(([id,icona,nome])=>`<button class="btn ${adminSection===id?'primary':'secondary'} admin-nav" data-section="${id}"><span class="nav-ic" aria-hidden="true">${icona}</span>${nome}${id==='orders'&&nuovi?`<span class="badge">${nuovi}</span>`:''}</button>`).join('')}</aside><section>${adminContent()}</section></div>`}
function ordersWithAdjustments(){const movements=state.adjustments||[];return (state.orders||[]).map(order=>({...order,adjustments:movements.filter(movement=>String(movement.orderId)===String(order.id))}))}
function detailOrder(){return detailOrderId?(state.orders||[]).find(o=>String(o.id)===String(detailOrderId)):null}
function ingredientList(){return (state.ingredients&&state.ingredients.length)?state.ingredients:ingredientCatalog(state.menu)}
function adminContent(){if(adminSection==='service')return servicePanel(state,Date.now());if(adminSection==='calendar')return calendarPanel(state.calendar);if(adminSection==='history')return orderHistoryPanel(state.orders,historyFilters,state.adjustments||[],money);if(adminSection==='orders'){
  // Qui stanno solo gli ordini ancora da fare: cliccato «Pronto» l'ordine
  // sparisce da questa lista e resta nello Storico, dove si ritrova sempre.
  // Aperti = da preparare e gia' pronti in attesa del cliente. Consegnato li
  // chiude e li toglie da qui e dalla cucina; restano nello Storico.
  const daFare=workingOrders(state.orders||[]);
  const attesa=waitMinutes(1);
  return `<h1>Ordini</h1><div class="actions"><button class="btn primary" id="external">+ Ordine dalla pizzeria</button><button class="btn secondary" id="toggle-online">Online: ${state.online?'attivi':'sospesi'}</button></div><p class="history-count">${pizzasAhead()} pizze in coda · un ordine di una pizza esce fra ${attesa} minuti</p>${daFare.map(orderCard).join('')||'<div class="card"><h2>Nessun ordine aperto</h2><p>Quelli consegnati sono nello Storico.</p></div>'}${counterDraft?counterOrderPanel(counterDraft,state.menu,money,DEMO_PAYMENT_METHODS):''}${detailOrder()?orderDetailPanel(detailOrder(),money):''}`;
}
if(adminSection==='menu')return menuPanel(state.menu,menuDraft,state.allergens||[],money,typeof repository.uploadProductPhoto==='function',menuFilter,menuTab,ingredientList());const day=state.activeDay?.date||historyDates(state.orders)[0]||'';const rows=ordersWithAdjustments();
  return `<h1>Report</h1><p class="history-count">Giornata ${day||'non ancora aperta'}</p>
    <p class="editor-note">Tocca un incasso per vedere ordine per ordine da dove arriva e cosa trattiene Stripe.</p>
    <div class="grid">${reportCard('Pranzo','lunch',dailyReport(rows,day,'lunch'))}${reportCard('Serale','dinner',dailyReport(rows,day,'dinner'))}${reportCard('Giornata','',dailyReport(rows,day))}</div>
    ${incomeDetail!==undefined?incomeDetailPanel(shiftBreakdown(rows,day,incomeDetail||null)):''}
    <h2 class="kt-section">Chiusura di cassa</h2>
    <p class="editor-note">Il foglio da contare col cassetto: contanti e elettronico separati, perche' nel cassetto c'e' solo il primo.</p>
    <div class="actions">
      <button class="btn primary cash-print" data-shift="lunch">Stampa il pranzo</button>
      <button class="btn primary cash-print" data-shift="dinner">Stampa il serale</button>
      <button class="btn secondary cash-print" data-shift="">Stampa la giornata</button>
    </div>`;
}
function reportCard(label,key,r){const attivo=incomeDetail===key;return `<button class="card income-card${attivo?' income-open':''}" data-income="${key}"><span class="eyebrow">${label}</span><div class="metric">${money(r.net)}</div><p>${r.orders} ordini · ${r.pizzas} pizze</p><small>Lordo ${money(r.gross)} · Trattenute ${money(r.fees)}<br>Supplementi ${money(r.supplements||0)} · Rimborsi ${money(r.refunds||0)}</small><span class="income-hint">${attivo?'Nascondi il dettaglio':'Vedi il dettaglio'}</span></button>`}
function incomeDetailPanel(detail){const T={lunch:'Pranzo',dinner:'Serale'};const titolo=detail.shift?`Dettaglio incassi · ${T[detail.shift]??detail.shift}`:'Dettaglio incassi · Giornata';if(!detail.rows.length)return `<article class="card income-detail"><span class="eyebrow">${titolo}</span><p>Nessun ordine chiuso in questo turno.</p></article>`;const righe=detail.rows.map(r=>`<tr><td>#${String(r.number??'').padStart(2,'0')}</td><td>${r.pizzas}</td><td>${translatePaymentMethod?translatePaymentMethod(r.paymentMethod,state.locale):r.paymentMethod}${r.online?' <span class="income-online">online</span>':''}</td><td class="num">${money(r.gross)}</td><td class="num">${r.fees?('-'+money(r.fees)):'—'}</td><td class="num"><b>${money(r.net)}</b></td></tr>`).join('');return `<article class="card income-detail"><span class="eyebrow">${titolo}</span><div class="income-table-wrap"><table class="income-table"><thead><tr><th>Ordine</th><th>Pezzi</th><th>Pagamento</th><th class="num">Lordo</th><th class="num">Trattenute</th><th class="num">Netto</th></tr></thead><tbody>${righe}</tbody><tfoot><tr><td>Totale</td><td>${detail.totals.pizzas}</td><td>${detail.totals.orders} ordini</td><td class="num">${money(detail.totals.gross)}</td><td class="num">${detail.totals.fees?('-'+money(detail.totals.fees)):'—'}</td><td class="num"><b>${money(detail.totals.net)}</b></td></tr></tfoot></table></div><p class="editor-note">Le trattenute sono la commissione che Stripe tiene sui pagamenti online. Sui contanti non c'e' trattenuta.</p></article>`}
function itemDetails(item){const changes=customizationLines(item);return `<p><b>${item.quantity}× ${item.name}</b>${changes.map(line=>`<br>${line}`).join('')}${item.note?`<br><span class="${/allerg|celiac|intoller/i.test(item.note)?'warning':''}">${item.note}</span>`:''}</p>`}
function orderNumber(order){return order.sequence?`#${String(order.sequence).padStart(2,'0')}`:`#${order.id}`}
function orderCard(o){
  const promessi=promisedMinutes(o);
  const pronto=o.status==='ready';
  const attesaPago=o.paymentStatus==='awaiting';
  const nuovo=nuovoOrdine(o)&&!attesaPago;
  const righe=groupOrderItems(o.items||[]);
  const pizze=righe.filter(isPizza);
  const bibite=righe.filter(i=>!isPizza(i));
  const riga=i=>`${Number(i.quantity??1)}\u00d7 ${i.name}`;
  return `<article class="card order ordercard${pronto?' is-ready':''}${nuovo?' is-new':''}${attesaPago?' is-awaiting':''}" data-order="${esc(o.id)}">
    <div class="ordercard-head">
      <span class="ordercard-n">${nuovo?'<i class="dot" aria-label="nuovo"></i>':''}#${String(o.sequence??0).padStart(2,'0')}</span>
      <div><b>${esc(o.customer||'Cliente')}</b><p>${attesaPago?'<b class="ordercard-flag pay">In attesa di pagamento</b> \u00b7 ':pronto?'<b class="ordercard-flag">Pronto, da consegnare</b> \u00b7 ':''}${esc(String(o.source||'').toLowerCase()==='web'?'dal sito':'in pizzeria')} \u00b7 ordinato ${new Date(o.createdAt).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'})}${promessi==null?'':` \u00b7 promessi ${promessi} min`}</p></div>
      <span class="ordercard-tot">${money(Number(o.total??0))}</span>
    </div>
    ${pizze.length?`<p class="ordercard-items">${esc(pizze.map(riga).join(' \u00b7 '))}</p>`:''}
    ${bibite.length?`<div class="ordercard-bar"><span>Da dare al banco</span><b>${esc(bibite.map(riga).join(' \u00b7 '))}</b></div>`:''}
    <div class="actions">
      ${attesaPago?'':`<button class="btn primary order-close" data-id="${esc(o.id)}">Consegnato</button>`}
      ${attesaPago||pronto?'':`<button class="btn secondary ready" data-id="${esc(o.id)}">Pronto</button>`}
      <button class="btn secondary order-open" data-order="${esc(o.id)}">Dettagli</button>
      ${attesaPago?'':`<button class="btn secondary ticket" data-id="${esc(o.id)}">Stampa</button>`}
    </div>
  </article>`;
}

function kitchen(){if(!state.creator)return loginPanel('Cucina','Le comande contengono i dati di chi ordina: serve l accesso del Creator.');return spiaConnessione()+kitchenPanel(state.orders,Date.now(),autoPrint,item=>!isPizza(item))}
function bind(){
  document.querySelector('#alarm-stop')?.addEventListener('click',fermaAllarme);
  // Riscrivere solo #products lasciava i nuovi bottoni senza gestori: dopo un
  // cambio scheda "Personalizza e aggiungi" non rispondeva piu'.
  function bindAddButtons(){
    document.querySelectorAll('.add').forEach(b=>b.onclick=()=>{
      const product=state.menu.find(x=>x.id===b.dataset.id);
      if(!product)return toast('Questo prodotto non e piu in menu.');
      customizing={product,removed:[],additions:withDefaultAdditions(product).map(a=>({...a,quantity:0})),note:''};
      render();
    });
  }
  bindAddButtons();
  // Cambiare scheda riscrive solo l'elenco: la testata e le foto gia' caricate
  // restano dove sono.
  document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{
    productFilter=b.dataset.filter;
    const elenco=document.querySelector('#products');
    if(!elenco)return render();
    elenco.innerHTML=products(productFilter);
    document.querySelectorAll('[data-filter]').forEach(x=>{
      const attiva=x.dataset.filter===productFilter;
      x.classList.toggle('primary',attiva);
      x.classList.toggle('secondary',!attiva);
    });
    bindAddButtons();
    haptic();
  });
  document.querySelector('#custom-close')?.addEventListener('click',()=>{customizing=null;render()});
  // Toccare un ingrediente cambia una riga, non la pagina: ricostruire tutto
  // faceva sparire e riapparire le foto e sembrava un ricaricamento.
  function refreshCustomPrice(){
    const cta=document.querySelector('#custom-add');
    if(cta)cta.textContent=`${t('custom.add')} \u00b7 ${money(calculateCustomizedPrice(customizing.product.price,customizing.additions))}`;
  }
  document.querySelectorAll('.ingredient-toggle').forEach(b=>b.onclick=()=>{
    const index=Number(b.dataset.index);
    const ingredient=customizing.product.ingredients[index];
    const tolto=customizing.removed.includes(ingredient);
    customizing.removed=tolto?customizing.removed.filter(x=>x!==ingredient):[...customizing.removed,ingredient];
    const row=document.querySelector(`[data-row="ing-${index}"]`);
    row?.classList.toggle('removed',!tolto);
    b.textContent=tolto?'\u2212':'+';
    const label=row?.querySelector('.stepper b');
    if(label)label.textContent=tolto?t('custom.kept'):t('custom.removed');
    haptic();
  });
  // Nome diverso da stepAddition importata: dentro bind() la funzione locale
  // la oscurava, e l'editor del Creator finiva a leggere il carrello.
  function stepCustomAddition(index,delta){
    const addition=customizing.additions[index];
    addition.quantity=Math.min(5,Math.max(0,addition.quantity+delta));
    const row=document.querySelector(`[data-row="add-${index}"]`);
    const label=row?.querySelector('.stepper b');
    if(label)label.textContent=addition.quantity;
    row?.classList.toggle('picked',addition.quantity>0);
    const meno=row?.querySelector('.addition-minus');
    if(meno)meno.disabled=addition.quantity===0;
    refreshCustomPrice();
    haptic();
  }
  document.querySelectorAll('.addition-minus').forEach(b=>b.onclick=()=>stepCustomAddition(Number(b.dataset.index),-1));
  document.querySelectorAll('.addition-plus').forEach(b=>b.onclick=()=>stepCustomAddition(Number(b.dataset.index),1));
  // Ricerca fra le aggiunte: nasconde le righe che non combaciano, senza
  // ridisegnare (cosi' i +/- restano dove sono).
  document.querySelector('#addition-search')?.addEventListener('input',event=>{
    const q=event.target.value.trim().toLowerCase();
    document.querySelectorAll('#addition-list .option-row').forEach(row=>{
      row.style.display=(!q||(row.dataset.name||'').includes(q))?'':'none';
    });
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
  document.querySelector('#recap-new')?.addEventListener('click',()=>{state.receipt=null;state.receiptDone=false;save();render()});
  document.querySelector('#recap-sms')?.addEventListener('click',()=>toast(t('recap.sent')));
  document.querySelector('#recap-email')?.addEventListener('click',()=>toast(t('recap.sent')));
  document.querySelector('#checkout')?.addEventListener('click',()=>{
    const nome=document.querySelector('#name').value.trim();
    const phone=document.querySelector('#phone').value;
    const email=document.querySelector('#email')?.value.trim()||'';
    if(!orderingOpen()){const ch=closedHoursMessage();return toast(currentClosure().closed?currentClosure().message:ch?`${ch.tel} · ${ch.quando}`:'Il servizio online non e aperto.')}
    // Il nome serve per chiamare chi aspetta, il numero per avvisarlo se
    // qualcosa non va: un ordine intestato a niente e' una pizza che resta li'.
    const nomeEsito=nameCheck(nome);
    if(nomeEsito==='no')return toast(nome?t('name.fake'):t('name.missing'));
    const problemaTelefono=phoneProblem(phone);
    if(problemaTelefono)return toast(problemaTelefono);
    if(email&&!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))return toast('Controlla l indirizzo email.');
    // Si tiene da parte quello che il cliente ha scritto PRIMA di ridisegnare:
    // altrimenti la finestra di conferma fa tornare i campi ai valori vecchi.
    state.contact={name:nome,phone,email,payment:document.querySelector('input[name="payment"]:checked').value};
    save();
    // Un nome insolito non si rifiuta, si fa confermare: chi ha davvero un
    // cognome raro deve poter ordinare la pizza.
    if(nomeEsito==='ask'&&askedName!==nome){askedName=nome;pendingName=nome;render();return}
    // Prima di mandare in cucina si rilegge tutto: una pizza sbagliata scoperta
    // adesso costa un tocco, scoperta dopo costa una pizza.
    confirming={
      name:nome,
      phone:normalizePhoneNumber(phone),email,
      paymentId:document.querySelector('input[name="payment"]:checked').value,
      // Le proposte si scelgono adesso e non cambiano piu': se sparissero
      // appena tocchi il piu', non potresti prenderne quattro.
      suggestions:orderSuggestions(state.cart,state.menu).map(p=>p.id)
    };
    pendingName=null;
    render();
  });
  document.querySelector('#name-yes')?.addEventListener('click',()=>{pendingName=null;document.querySelector('#cart').classList.remove('hidden');document.querySelector('#checkout')?.click()});
  document.querySelector('#name-no')?.addEventListener('click',()=>{pendingName=null;askedName=null;render();document.querySelector('#cart')?.classList.remove('hidden');document.querySelector('#name')?.focus()});
  function refreshConfirm(){
    const finestra=document.querySelector('#confirm-modal');
    if(!finestra)return render();
    // Riscrivere il contenuto riporta la finestra in cima: chi stava scegliendo
    // le bibite si ritrovava sbalzato all'inizio a ogni tocco.
    const posizione=finestra.scrollTop;
    finestra.innerHTML=confirmBody();
    finestra.scrollTop=posizione;
    bindConfirm();
  }
  function bindConfirm(){
    document.querySelector('#confirm-back')?.addEventListener('click',()=>{confirming=null;render()});
    document.querySelector('#confirm-send')?.addEventListener('click',sendOrder);
    document.querySelectorAll('[data-suggest]').forEach(b=>b.onclick=()=>{
      const product=state.menu.find(x=>x.id===b.dataset.suggest);
      if(!product)return;
      state.cart.push({...product,price:product.price,removed:[],additions:withDefaultAdditions(product).map(a=>({...a,quantity:0})),note:''});
      save();haptic();refreshConfirm();
    });
    document.querySelectorAll('[data-suggest-minus]').forEach(b=>b.onclick=()=>{
      const id=b.dataset.suggestMinus;
      // Si toglie l'ultimo aggiunto, mai una riga che il cliente ha modificato.
      for(let i=state.cart.length-1;i>=0;i-=1){
        if(String(state.cart[i].id)===String(id)&&isPlain(state.cart[i])){state.cart.splice(i,1);break}
      }
      save();haptic();
      if(!state.cart.length){confirming=null;return render()}
      refreshConfirm();
    });
    document.querySelectorAll('[data-remove-confirm]').forEach(b=>b.onclick=()=>{
      state.cart.splice(Number(b.dataset.removeConfirm),1);save();haptic();
      if(!state.cart.length){confirming=null;return render()}
      refreshConfirm();
    });
  }
  bindConfirm();
  async function sendOrder(){
    const dati=confirming;
    if(!dati)return;
    const payment=DEMO_PAYMENT_METHODS.find(method=>method.id===dati.paymentId);
    const cartItems=state.cart.map(i=>({...i,quantity:1}));
    const service=state.shift?state.services[state.shift]:null;
    // Se il servizio non risulta aperto sul dispositivo, rileggo dal server e,
    // se davvero non c'e', lo dico chiaro invece di far partire un ordine cieco.
    if(!service||service.status!=='open'||!state.activeDay){
      await refreshRepositoryState();
      const ora=state.shift?state.services[state.shift]:null;
      if(!ora||ora.status!=='open'){return toast('Il servizio non risulta aperto: chiedi in pizzeria di aprirlo, poi riprova.')}
    }
    const total=state.cart.reduce((n,i)=>n+i.price,0),eta=waitMinutes(countPizzas(cartItems)),businessDate=state.activeDay.date,servizioAttivo=state.services[state.shift],sequence=nextServiceSequence(state.orders,servizioAttivo,state.activeDay),fees=total*payment.feeRate;
    const order={id:143+state.orders.length,requestToken:crypto.randomUUID(),sequence,businessDate,businessDayId:state.activeDay.id,serviceId:servizioAttivo.id,source:'WEB',customer:dati.name||'Cliente',phone:dati.phone,email:dati.email,paymentMethod:payment.id,payment:payment.label,status:'preparing',shift:state.shift,createdAt:Date.now(),readyAt:Date.now()+eta*60000,total,gross:total,fee:fees,fees,items:cartItems};
    try{
      // Numero pubblico e totale li decide il server: l'anteprima locale
      // servirebbe solo a mostrare un numero che poi cambia.
      const receipt=await repository.createOrder(order);
      // Se il pagamento e' online e Stripe e' acceso, il cliente va a pagare
      // PRIMA di vedere la ricevuta: la comanda partira' quando Stripe conferma.
      if(pagaOnline(dati,appConfig)){
        try{
          const url=await urlCheckout({id:receipt?.id??order.id,requestToken:order.requestToken},appConfig);
          state.cart=[];confirming=null;state.contact=null;save();
          window.location.href=url;
          return;
        }catch(errore){toast(errore?.message||'Pagamento non avviato.');return}
      }
      const promessi=Number(receipt?.etaMinutes??eta);
      state.receiptDone=false;
      state.receipt=buildCustomerRecap({
        ...order,...receipt,
        total:Number(receipt?.total??total),
        readyAt:order.createdAt+promessi*60000,
        items:cartItems
      },{locale:state.locale,pizzeriaPhone:appConfig.pizzeriaPhone??null});
      state.cart=[];confirming=null;orderProgress=null;state.contact=null;save();
      await stateRefresh.refresh();
      render();toast('Ordine inviato in cucina.');
      void aggiornaAttesa();
    }catch(error){
      const msg=String(error?.message||'');
      if(/service|business day|closed|chiuso|not open|già|gia'/i.test(msg)){
        await refreshRepositoryState().catch(()=>{});
        toast('Il servizio non risulta aperto sul server: fatelo aprire in pizzeria e riprova.');
      }else if(/network|fetch|Failed to fetch|timeout|NetworkError/i.test(msg)){
        toast('Server non raggiungibile: controlla la connessione e riprova.');
      }else{
        // Il motivo vero, non il generico "connessione non disponibile".
        toast(msg?`Ordine non inviato: ${msg}`:'Ordine non inviato: riprova.');
      }
    }
  }
  document.querySelector('#login')?.addEventListener('click',async()=>{try{const session=await runtime.auth.signIn(document.querySelector('#user').value,document.querySelector('#pass').value);state.creator=isCreatorSession(session);await refreshRepositoryState()}catch(error){toast(loginProblem(error))}});
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
    try{
      await repository.openService({...state.services[shift],action:result.mode==='reopen'?'reopen':'open',online:serviceAcceptsOrders(state.services[shift],result.mode),capacity:state.capacity});
      if(runtime.mode==='supabase')await refreshRepositoryState();else{save();render()}
      toast(result.mode==='reopen'?'Servizio riaperto.':result.mode==='new-day'?'Nuova giornata aperta.':'Servizio aperto.');
    }catch(error){
      const msg=String(error?.message||'');
      // Il servizio esiste gia' sul server (aperto altrove, o gia' creato oggi):
      // non e' un errore di rete. Rileggo lo stato dal server e provo a riaprirlo,
      // cosi' il bottone non resta bloccato su "gia' esistente".
      if(/already exists|reopen_service|già|gia'/i.test(msg)){
        try{
          await refreshRepositoryState();
          const esistente=state.services[shift];
          if(esistente&&esistente.status!=='open'){
            await repository.openService({...esistente,action:'reopen',online:true});
            await refreshRepositoryState();
          }
          toast('Servizio aggiornato dal server.');
        }catch{await refreshRepositoryState().catch(()=>{});toast('Ho riletto lo stato dal server: riprova ad aprire.')}
      }else if(/network|fetch|Failed to fetch|timeout/i.test(msg)){
        toast('Server non raggiungibile: controlla la connessione e riprova.');
      }else{
        // Messaggio vero invece del generico "connessione non disponibile".
        toast(msg?`Non aperto: ${msg}`:'Non aperto: errore sconosciuto.');
      }
    }
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
  document.querySelector('#oven-form')?.addEventListener('submit',async event=>{
    event.preventDefault();
    const form=new FormData(event.currentTarget);
    const oven={slots:Number(form.get('slots')),bakeMinutes:Number(form.get('bakeMinutes')),bufferMinutes:Number(form.get('bufferMinutes'))};
    if(!(oven.slots>0&&oven.bakeMinutes>0&&oven.bufferMinutes>=0))return toast('Numeri non validi.');
    try{
      if(typeof repository.setOvenDefaults==='function')await repository.setOvenDefaults(oven);
      else if(state.services[state.shift])await repository.setServiceOven(state.services[state.shift].id,oven);
      state.ovenDefaults=oven;
      await stateRefresh.refresh();render();toast(`Forno aggiornato: ${ovenThroughput(oven)} pizze all ora.`);
    }catch(error){toast(error?.message?`Non salvato: ${error.message}`:'Non salvato.')}
  });
  document.querySelector('#toggle-online')?.addEventListener('click',async()=>{const service=state.services[state.shift];if(!service)return toast('Apri prima un servizio.');try{await repository.setServiceOnline(service.id,!state.online);if(runtime.mode==='supabase')await refreshRepositoryState();else{state.online=!state.online;save();render()}}catch{reportRepositoryError()}});
  function readCounterDraft(){
    if(!counterDraft)return null;
    const val=id=>document.querySelector(id)?.value??'';
    return {
      ...counterDraft,
      name:val('#counter-name'),phone:val('#counter-phone'),note:val('#counter-note'),
      payment:document.querySelector('input[name="counter-payment"]:checked')?.value??counterDraft.payment
    };
  }
  document.querySelector('#external')?.addEventListener('click',()=>{
    if(!state.shift)return toast('Apri prima un servizio.');
    counterDraft={quantities:{},name:'',phone:'',note:'',payment:'cash'};render();
  });
  document.querySelectorAll('.order-open').forEach(b=>b.onclick=()=>{detailOrderId=b.dataset.order;segnaVisto(b.dataset.order);render()});
  document.querySelector('#detail-close')?.addEventListener('click',()=>{detailOrderId=null;render()});
  document.querySelector('#detail-edit')?.addEventListener('click',()=>{const id=detailOrderId;detailOrderId=null;adminSection='orders';apriEditor(id)});
  document.querySelector('#counter-close')?.addEventListener('click',()=>{counterDraft=null;render()});
  document.querySelectorAll('.counter-minus,.counter-plus').forEach(b=>b.onclick=()=>{
    const draft=readCounterDraft(),id=b.dataset.id;
    const current=Number(draft.quantities[id]??0);
    const next=b.classList.contains('counter-plus')?Math.min(20,current+1):Math.max(0,current-1);
    counterDraft={...draft,quantities:{...draft.quantities,[id]:next}};render();
  });
  document.querySelector('#counter-save')?.addEventListener('click',async()=>{
    const draft=readCounterDraft();
    const problemi=counterOrderIssues(draft,state.menu);
    if(problemi.length){counterDraft=draft;render();return toast(problemi[0])}
    const service=state.services[state.shift];
    if(!service)return toast('Apri prima un servizio.');
    try{
      // Stesso percorso degli ordini dal sito: numero, prezzo e attesa li
      // decide il server, cosi' la coda del forno resta una sola.
      await repository.createOrder({...counterOrderPayload(draft,state.menu),serviceId:service.id,businessDate:state.activeDay?.date,status:'preparing',shift:state.shift,createdAt:Date.now()});
      await stateRefresh.refresh();
      counterDraft=null;render();toast('Ordine in cucina.');
    }catch(error){counterDraft=draft;render();toast(error?.message?`Non salvato: ${error.message}`:'Non salvato.')}
  });
  ['date','shift','source','status'].forEach(key=>{const el=document.querySelector(`#history-${key}`);if(el)el.onchange=()=>{historyFilters={...historyFilters,[key]:el.value};render()}});
  const historyQuery=document.querySelector('#history-query');
  if(historyQuery)historyQuery.oninput=()=>{historyFilters={...historyFilters,query:historyQuery.value};refocusHistoryQuery=true;render()};
  if(refocusHistoryQuery){refocusHistoryQuery=false;const field=document.querySelector('#history-query');if(field){field.focus();field.setSelectionRange(field.value.length,field.value.length)}}
  function apriEditor(id){
    const ordine=(state.orders||[]).find(o=>String(o.id)===String(id));
    if(!ordine)return;
    editingOrderId=id;editorDraft=draftFromOrder(ordine,state.menu);editorOpenLine=null;editorAdding=false;render();
  }
  document.querySelectorAll('.history-edit').forEach(b=>b.onclick=()=>apriEditor(b.dataset.id));
  document.querySelector('#editor-close')?.addEventListener('click',()=>{editingOrderId=null;editorDraft=null;editorOpenLine=null;editorAdding=false;render()});
  function aggiornaBozza(nuova){
    // La nota si perde se non la si rilegge prima di ridisegnare.
    document.querySelectorAll('.edit-note').forEach(campo=>{nuova=setNote(nuova,campo.dataset.key,campo.value)});
    editorDraft=nuova;render();
  }
  document.querySelectorAll('.edit-minus,.edit-plus').forEach(b=>b.onclick=()=>{
    aggiornaBozza(stepQuantity(editorDraft,b.dataset.key,b.classList.contains('edit-plus')?1:-1));
  });
  document.querySelectorAll('.edit-toggle').forEach(b=>b.onclick=()=>{
    editorOpenLine=editorOpenLine===b.dataset.key?null:b.dataset.key;
    aggiornaBozza(editorDraft);
  });
  document.querySelectorAll('.edit-ing').forEach(b=>b.onclick=()=>{
    aggiornaBozza(toggleRemoved(editorDraft,b.dataset.key,b.dataset.ing));
  });
  document.querySelectorAll('.edit-add-minus,.edit-add-plus').forEach(b=>b.onclick=()=>{
    aggiornaBozza(stepAddition(editorDraft,b.dataset.key,b.dataset.ing,b.classList.contains('edit-add-plus')?1:-1,state.menu));
  });
  document.querySelector('#editor-add')?.addEventListener('click',()=>{editorAdding=!editorAdding;aggiornaBozza(editorDraft)});
  document.querySelectorAll('.edit-pick').forEach(b=>b.onclick=()=>{
    const product=state.menu.find(x=>x.id===b.dataset.product);
    editorAdding=false;
    aggiornaBozza(addLine(editorDraft,product));
  });
  document.querySelector('#editor-save')?.addEventListener('click',async()=>{
    if(!editorDraft)return;
    document.querySelectorAll('.edit-note').forEach(campo=>{editorDraft=setNote(editorDraft,campo.dataset.key,campo.value)});
    if(!draftIsValid(editorDraft))return toast('Un ordine non puo restare vuoto.');
    const reason=document.querySelector('#editor-reason')?.value.trim()||'Modifica del Creator';
    const method=document.querySelector('input[name="adjustment-method"]:checked')?.value;
    const previousTotal=Number(editorDraft.originalTotal??0);
    const orderId=editingOrderId;
    try{
      await repository.reviseOrder(orderId,{items:draftItems(editorDraft),reason});
      // Il totale va letto dallo snapshot restituito: un refresh piu' recente
      // innescato dal Realtime puo' scartare l'applicazione di questo, e lo
      // stato in memoria resterebbe indietro per un istante.
      const snapshot=await stateRefresh.refresh();
      const revised=snapshot.orders.find(o=>String(o.id)===String(orderId));
      const movement=calculateAdjustment(previousTotal,Number(revised?.total??draftTotal(editorDraft,state.menu)));
      if(movement.type!=='none'){
        await repository.recordPaymentAdjustment(orderId,{...movement,method:movement.type==='supplement'?(method||'cash'):null,note:reason});
        await stateRefresh.refresh();
      }
      editingOrderId=null;editorDraft=null;editorOpenLine=null;editorAdding=false;render();
      toast(movement.type==='supplement'?`Revisione salvata · supplemento ${money(movement.amount)}`:movement.type==='refund'?`Revisione salvata · rimborso ${money(movement.amount)}`:'Revisione salvata.');
    }catch(error){toast(error?.message?`Non salvato: ${error.message}`:'Non salvato.')}
  });
  document.querySelectorAll('.movement-record,.movement-cancel').forEach(b=>b.onclick=async()=>{
    const status=b.classList.contains('movement-record')?'recorded':'cancelled';
    try{await repository.transitionPaymentAdjustment(b.dataset.id,status);await stateRefresh.refresh();render();toast(status==='recorded'?'Movimento registrato.':'Movimento annullato.')}catch{reportRepositoryError()}
  });
  function readMenuDraft(){
    if(!menuDraft)return null;
    const val=id=>document.querySelector(id)?.value??'';
    const rows=(cls,key)=>[...document.querySelectorAll(cls)].reduce((acc,el)=>{const i=Number(el.dataset.index);acc[i]={...(acc[i]||{}),[key]:el.value};return acc},[]);
    const nomi=rows('.menu-add-name','name'),prezzi=rows('.menu-add-price','price');
    return {
      ...menuDraft,
      type:val('#menu-type')||menuDraft.type,
      name:val('#menu-name'),
      description:val('#menu-desc'),
      descriptionEn:val('#menu-desc-en'),
      ingredients:val('#menu-ingredients'),
      price:val('#menu-price'),
      available:document.querySelector('#menu-available')?.checked??menuDraft.available,
      imageUrl:(document.querySelector('#menu-photo-url')?.value??menuDraft.imageUrl??'').trim(),
      additions:(menuDraft.additions||[]).map((row,i)=>({...row,...nomi[i],...prezzi[i]})),
      allergenIds:[...document.querySelectorAll('.menu-allergen:checked')].map(el=>el.value)
    };
  }
  document.querySelector('#menu-new')?.addEventListener('click',()=>{const last=Math.max(0,...(state.menu||[]).map(x=>Number(x.sortOrder||0)));menuDraft={...emptyDraft(),sortOrder:last+10};render()});
  // I bottoni su ogni scheda prodotto: si ri-agganciano anche dopo una ricerca,
  // quando la lista viene ridisegnata da sola.
  function bindMenuCards(){
    document.querySelectorAll('.menu-edit').forEach(b=>b.onclick=()=>{const product=state.menu.find(x=>x.id===b.dataset.id);if(product){menuDraft=draftFromProduct(product);render()}});
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
    document.querySelectorAll('.weekly-toggle').forEach(b=>b.onclick=async()=>{
      const p=state.menu.find(x=>x.id===b.dataset.id);if(!p)return;
      const prossimo=!p.weekly;
      try{await repository.setWeekly(p,prossimo);p.weekly=prossimo;save();render();toast(prossimo?'Messa tra le pizze della settimana.':'Tolta dalle pizze della settimana.')}
      catch(error){toast(error?.message?`Non salvato: ${error.message}`:'Non salvato.')}
    });
  }
  bindMenuCards();
  bindIngredientCards();
  // Le tre schede del menu: Pizze / Bibite / Ingredienti.
  document.querySelectorAll('.menu-tab').forEach(b=>b.onclick=()=>{menuTab=b.dataset.tab;menuFilter='';render()});
  // Ricerca nel menu: filtra la lista mentre scrivi, senza perdere il fuoco del
  // campo (ridisegno solo la griglia, non tutta la schermata).
  document.querySelector('#menu-search')?.addEventListener('input',event=>{
    menuFilter=event.target.value;
    const lista=document.querySelector('#menu-list');
    if(!lista)return;
    if(menuTab==='ingredienti'){lista.innerHTML=ingredientCatalogList(ingredientList(),money,menuFilter);bindIngredientCards()}
    else{lista.innerHTML=menuList(state.menu,money,menuFilter,menuTab);bindMenuCards()}
  });
  function bindIngredientCards(){
    // Prezzo dell'aggiunta: si salva quando esci dal campo.
    document.querySelectorAll('.ingredient-price-input').forEach(inp=>inp.onchange=async()=>{
      const ing=ingredientList().find(i=>String(i.id)===inp.dataset.id);if(!ing)return;
      const prezzo=Number(String(inp.value).replace(',','.'));
      if(!(prezzo>=0))return toast('Prezzo non valido.');
      try{await repository.saveIngredient({...ing,price:prezzo});ing.price=prezzo;await stateRefresh.refresh();toast(`Prezzo di ${ing.name} aggiornato.`)}
      catch(error){toast(error?.message?`Non salvato: ${error.message}`:'Non salvato.')}
    });
    // Disponibilità: esaurito/rimetti.
    document.querySelectorAll('.ingredient-avail').forEach(b=>b.onclick=async()=>{
      const ing=ingredientList().find(i=>String(i.id)===b.dataset.id);if(!ing)return;
      const prossimo=!(ing.available!==false);
      try{await repository.saveIngredient({...ing,available:prossimo});ing.available=prossimo;await stateRefresh.refresh();render();toast(prossimo?`${ing.name}: di nuovo disponibile.`:`${ing.name}: segnato esaurito.`)}
      catch(error){toast(error?.message?`Non salvato: ${error.message}`:'Non salvato.')}
    });
  }
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
      const url=await repository.uploadProductPhoto(file,String(draft.name||'piatto').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'piatto');
      menuDraft={...draft,imageUrl:url};render();toast('Foto caricata.');
    }catch(error){menuDraft=draft;render();toast(error?.message?`Foto non caricata: ${error.message}`:'Foto non caricata.')}
  });
  // Aggiungere un extra appende una riga: riscrivere la scheda intera faceva
  // perdere quello che si stava scrivendo e sembrava un ricaricamento.
  document.querySelector('#menu-add-add')?.addEventListener('click',()=>{
    const d=readMenuDraft();
    const righe=[...(d.additions||[]),{name:'',price:''}];
    menuDraft={...d,additions:righe};
    const contenitore=document.querySelector('#menu-add-rows');
    if(!contenitore)return render();
    contenitore.insertAdjacentHTML('beforeend',additionRow({name:'',price:''},righe.length-1));
    bindMenuRows();
    contenitore.querySelector('.menu-add-row:last-child .menu-add-name')?.focus();
  });
  function bindMenuRows(){
    document.querySelectorAll('.menu-add-del').forEach(b=>b.onclick=()=>{
      const d=readMenuDraft();
      menuDraft={...d,additions:d.additions.filter((_,i)=>i!==Number(b.dataset.index))};
      render();
    });
  }
  bindMenuRows();
  document.querySelector('#menu-save')?.addEventListener('click',async()=>{
    const draft=readMenuDraft();
    if(!String(draft.name||'').trim())return toast('Serve un nome.');
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
  document.querySelectorAll('.ticket').forEach(b=>b.onclick=()=>{
    const order=state.orders.find(o=>String(o.id)===b.dataset.id);
    if(order){segnaVisto(order.id);stampaComande([order])}
  });
  document.querySelector('#riprova')?.addEventListener('click',async()=>{
    toast('Riprovo...');
    try{await stateRefresh.refresh();render();toast('Collegato.')}catch{toast('Ancora niente: controlla la rete.')}
  });
  document.querySelectorAll('.income-card').forEach(b=>b.onclick=()=>{
    const key=b.dataset.income;
    // Ritocco lo stesso incasso = lo richiudo; un altro = apro quello.
    incomeDetail=(incomeDetail===key)?undefined:key;
    render();
  });
  document.querySelectorAll('.cash-print').forEach(b=>b.onclick=()=>{
    const shift=b.dataset.shift||null;
    const day=state.activeDay?.date||historyDates(state.orders)[0]||'';
    if(!day)return toast('Nessuna giornata da chiudere.');
    const righeOrdini=ordersWithAdjustments();
    stampaFoglio(linesMarkup(cashReportLines(cashReport(righeOrdini,day,shift),{date:day,shift,orders:righeOrdini})));
  });
  document.querySelector('#autoprint')?.addEventListener('change',event=>{
    autoPrint=event.target.checked;
    localStorage.setItem('hm-autoprint',autoPrint?'1':'0');
    toast(autoPrint?'Le comande usciranno da sole.':'Stampa automatica spenta.');
  });
  // Pronto e consegnato sono due momenti diversi: fra i due la pizza aspetta
  // sul banco e chi la ritira deve ancora arrivare.
  function avanza(id,stato,messaggio){
    return async()=>{
      try{
        await repository.updateOrderStatus(id,stato);
        detailOrderId=null;
        if(runtime.mode==='supabase')await refreshRepositoryState();
        else{const ordine=state.orders.find(o=>String(o.id)===String(id));if(ordine)ordine.status=stato;save();render()}
        toast(messaggio);
      }catch{reportRepositoryError()}
    };
  }
  document.querySelectorAll('.ready').forEach(b=>b.onclick=()=>{segnaVisto(b.dataset.id);avanza(b.dataset.id,'ready','Segnato pronto.')()});
  document.querySelectorAll('.collected').forEach(b=>b.onclick=avanza(b.dataset.id,'collected','Ordine consegnato.'));
  // Chiudere un ordine ancora in preparazione richiede i due passaggi che il
  // database conosce: cosi' resta scritto che e' passato da pronto.
  document.querySelectorAll('.order-close').forEach(b=>b.onclick=async()=>{
    const ordine=(state.orders||[]).find(o=>String(o.id)===String(b.dataset.id));
    const passi=closingSteps(ordine||{});
    if(!passi.length)return;
    try{
      segnaVisto(b.dataset.id);
      for(const passo of passi)await repository.updateOrderStatus(b.dataset.id,passo);
      detailOrderId=null;
      if(runtime.mode==='supabase')await refreshRepositoryState();
      else{if(ordine)ordine.status='collected';save();render()}
      toast('Ordine consegnato.');
    }catch{reportRepositoryError()}
  });
  const dialog=document.querySelector('.dialog-card');
  if(dialog)releaseDialogTrap=trapDialogFocus(dialog,finishDialog);
}
// Ritorno da Stripe: se il cliente ha pagato, si mostra la sala d'attesa del suo
// ordine; se ha annullato, un avviso gentile. Il segno «pagato» lo mette il
// webhook dal server: qui si legge soltanto lo stato.
(function ritornoDaStripe(){
  const q=new URLSearchParams(location.search);
  const pagato=q.get('pagato'),annullato=q.get('annullato');
  if(!pagato&&!annullato)return;
  history.replaceState(null,'',location.pathname);
  if(annullato){toast('Pagamento annullato. L ordine non e stato inviato.');return}
  // La ricevuta minima: il resto (numero, stato) arriva dal server.
  state.receiptDone=false;
  state.receipt={id:pagato,token:null,code:'',customer:'',phone:'',payment:'',total:0,minutes:null,readyAt:null,items:[],pizzeriaPhone:appConfig.pizzeriaPhone??null};
  toast('Pagamento ricevuto. La tua pizza e in coda.');
})();
try{await stateRefresh.refresh()}catch{}
// Un browser non suona finche' la pagina non e' stata toccata: al primo tocco
// si prepara il trillo, cosi' e' pronto quando serve.
document.addEventListener('pointerdown',()=>unlockChime(),{once:true});
// Mentre il cliente aspetta, si richiede lo stato del suo ordine: e' l'unico
// modo perche' «e pronta» arrivi davvero quando e' pronta.
async function aggiornaAttesa(){
  const ricevuta=state.receipt;
  if(!ricevuta?.id||typeof repository.getOrderProgress!=='function')return;
  try{
    const avanzamento=await repository.getOrderProgress(ricevuta.id,ricevuta.token);
    if(!avanzamento)return;
    const cambiato=JSON.stringify(avanzamento)!==JSON.stringify(orderProgress);
    orderProgress=avanzamento;
    // Consegnato o annullato = ordine chiuso: lo segnamo cosi' alla PROSSIMA
    // riapertura il cliente torna al menu. Ora resta visibile ("Ritirato").
    if((avanzamento.status==='collected'||avanzamento.status==='cancelled')&&!state.receiptDone){state.receiptDone=true;save()}
    if(cambiato&&state.view==='customer'&&state.receipt)render();
  }catch{}
}
function seguiAttesa(){
  clearInterval(progressTimer);
  progressTimer=setInterval(()=>{if(state.receipt&&state.view==='customer')void aggiornaAttesa()},20000);
}
// Il conto alla rovescia scorre da solo ogni secondo: chiedere al server ogni
// venti bastava per lo stato, ma il numero sembrava bloccato. Qui si tocca solo
// il numero e la barra, non si ridisegna niente.
setInterval(()=>{
  const ricevuta=state.receipt;
  if(!ricevuta?.readyAt||state.view!=='customer')return;
  const numero=document.querySelector('#wait-countdown');
  if(!numero)return;
  const mancano=Number(ricevuta.readyAt)-Date.now();
  numero.textContent=mancano>0?countdownText(mancano):t('wait.now');
  const barra=document.querySelector('#wait-bar');
  if(barra)barra.style.width=`${waitingProgress(mancano,(orderProgress?.promisedMinutes??ricevuta.minutes??0)*60000)}%`;
},1000);
seguiAttesa();
// Un battito di sicurezza: anche se il canale in tempo reale tace, ogni mezzo
// minuto si ricontrolla comunque. E' la differenza fra accorgersi di un ordine
// con trenta secondi di ritardo e non accorgersene mai.
//
// NB: l'apertura/chiusura del servizio resta MANUALE (i bottoni Apri/Chiudi).
// Gli orari 12:00-14:15 e 19:00-22:15 valgono per il cliente (che fuori orario
// vede "chiuso, chiama"); il servizio lo apre e chiude il locale, cosi' non c'e'
// mai un automatismo che litiga col cameriere.
setInterval(()=>{
  if(!state.creator||document.hidden)return;
  void stateRefresh.schedule();
},30000);
// Tornando dalla sospensione (schermo riacceso, scheda ripresa) i dati sono
// vecchi: si rileggono subito invece di aspettare il battito.
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void stateRefresh.schedule()});
window.addEventListener('online',()=>{void stateRefresh.schedule();render()});
window.addEventListener('offline',()=>render());
render();hasRendered=true;setInterval(()=>{if(state.view==='kitchen')render()},1000);
repository.subscribe(()=>{void stateRefresh.schedule()});
runtime.auth.onChange(session=>{state.creator=isCreatorSession(session);void stateRefresh.schedule()});
