import { nextDailySequence, resolveBusinessDate, resolveClosure } from '../operations.js';
import { DEFAULT_OVEN, ovenThroughput } from '../oven.js';

const ACTIVE_STATUSES = new Set(['received', 'preparing']);

const SHIFT_LABELS = {
  lunch: 'Pranzo',
  dinner: 'Serale'
};

export function reopenService(service, openedAt = Date.now()) {
  return {
    ...service,
    status: 'open',
    sessions: [...(service.sessions || []), { openedAt, closedAt: null }]
  };
}

// Aprire, iniziare una nuova giornata o riaprire significa sempre tornare ad
// accettare ordini. La chiusura di un servizio azzera online_orders_enabled sul
// database, quindi quel flag non puo' ricordare una sospensione voluta: la
// sospensione vive solo mentre il servizio e' aperto, dal comando dedicato.
export function serviceAcceptsOrders() {
  return true;
}

export function closeService(service, closedAt = Date.now()) {
  const sessions = [...(service.sessions || [])];
  const current = sessions.at(-1);
  if (current && current.closedAt == null) sessions[sessions.length - 1] = { ...current, closedAt };
  return { ...service, status: 'closed', sessions };
}

function nextCalendarDate(date) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

function hourInRome(now) {
  return Number(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Rome',
    hour: '2-digit',
    hourCycle: 'h23'
  }).format(new Date(now)));
}

export function isReopenEligible(service, now = Date.now()) {
  if (!service || service.status !== 'closed') return false;
  const calendarDate = resolveBusinessDate(now, null);
  return calendarDate === service.businessDate || (
    calendarDate === nextCalendarDate(service.businessDate) && hourInRome(now) < 6
  );
}

function belongsToBusinessDay(service, activeDay) {
  if (!service || !activeDay) return false;
  if (service.businessDayId && activeDay.id) return service.businessDayId === activeDay.id;
  if (activeDay.id && !service.businessDayId) {
    return activeDay.id === `legacy-${activeDay.date}` && service.businessDate === activeDay.date;
  }
  return service.businessDate === activeDay.date;
}

function canReopenSelectedService(state, shift, now) {
  const service = state.services[shift];
  const newerDaySelected = state.activeDay && !belongsToBusinessDay(service, state.activeDay);
  return !newerDaySelected && isReopenEligible(service, now);
}

function transitionMode(state, shift, now, action) {
  if (action === 'reopen' && canReopenSelectedService(state, shift, now)) return 'reopen';
  if (state.activeDay?.status === 'open') return 'open';
  if (action === 'open' && state.activeDay && !belongsToBusinessDay(state.services[shift], state.activeDay)) return 'open';
  return 'new-day';
}

export function startServiceTransition(state, shift, now = Date.now(), action = 'open') {
  const existing = state.services[shift];
  const mode = transitionMode(state, shift, now, action);
  const reopening = mode === 'reopen';
  const newDay = mode === 'new-day';
  const businessDate = reopening
    ? existing.businessDate
    : newDay ? resolveBusinessDate(now, null) : state.activeDay.date;
  const openedAt = new Date(now).getTime();
  const businessDayId = reopening
    ? (existing.businessDayId || state.activeDay?.id || `legacy-${businessDate}`)
    : (newDay ? `day-${businessDate}-${openedAt}` : (state.activeDay?.id || `legacy-${businessDate}`));
  const dayOrders = state.orders.filter(order => (
    order.businessDayId ? order.businessDayId === businessDayId : order.businessDate === businessDate
  ));
  const service = reopening
    ? { ...reopenService(existing, openedAt), businessDayId }
    : {
        id: `${shift}-${businessDate}-${openedAt}`,
        shift,
        status: 'open',
        businessDate,
        businessDayId,
        sequenceBase: newDay ? 0 : nextDailySequence(dayOrders, businessDate) - 1,
        sessions: [{ openedAt, closedAt: null }]
      };

  return {
    ...state,
    services: { ...state.services, [shift]: service },
    activeDay: { id: businessDayId, date: businessDate, status: 'open' },
    shift
  };
}

export function startServiceWithCalendar(state, shift, now, action, calendar) {
  const mode = transitionMode(state, shift, now, action);
  const nextState = startServiceTransition(state, shift, now, action);
  const targetDate = nextState.activeDay.date;
  const closure = resolveClosure(targetDate, calendar.closedWeekdays, calendar.exceptions);
  return closure.closed
    ? { state, started: false, targetDate, closure, mode }
    : { state: nextState, started: true, targetDate, closure, mode };
}

export function nextServiceSequence(orders, service, activeDay) {
  const sequences = orders
    .filter(order => order.businessDayId === activeDay.id)
    .map(order => Number(order.sequence) || 0);
  return Math.max(Number(service.sequenceBase) || 0, ...sequences) + 1;
}

export function buildCloseDialog(service, orders, summary) {
  const blockingOrders = (orders || []).filter(order => (
    order.serviceId === service.id && ACTIVE_STATUSES.has(order.status)
  ));
  if (blockingOrders.length) return { kind: 'blocked', blockingOrders };
  return {
    kind: 'confirm',
    shift: service.shift,
    businessDate: service.businessDate,
    summary,
    closesBusinessDay: service.shift === 'dinner'
  };
}

export function servicePanel(state, now = Date.now()) {
  const services = state.services || {};
  const selectedDay = state.activeDay || null;
  return `<h1>Servizio</h1><div class="grid service-grid">${['lunch', 'dinner'].map(shift => {
    const historicalService = services[shift];
    const service = selectedDay && !belongsToBusinessDay(historicalService, selectedDay)
      ? null
      : historicalService;
    const isOpen = service?.status === 'open';
    const canReopen = canReopenSelectedService(state, shift, now);
    const actions = isOpen
      ? `<button class="btn secondary service-action" data-service-action="close" data-shift="${shift}">Chiudi servizio</button>`
      : canReopen
        ? selectedDay?.status === 'open'
          ? `<button class="btn primary service-action" data-service-action="reopen" data-shift="${shift}">Riapri servizio</button>`
          : `<div class="service-actions"><button class="btn primary service-action" data-service-action="reopen" data-shift="${shift}">Riapri servizio</button><button class="btn secondary service-action" data-service-action="new-day" data-shift="${shift}">Avvia nuova giornata</button></div>`
        : `<button class="btn primary service-action" data-service-action="open" data-shift="${shift}">Apri servizio</button>`;
    const context = service
      ? `<p>Giornata operativa <b>${service.businessDate}</b></p>`
      : selectedDay
        ? `<p>Giornata operativa <b>${selectedDay.date}</b> · turno non aperto</p>`
        : '<p>Nessuna sessione per la giornata.</p>';
    return `<article class="card"><span class="eyebrow">${shift === 'lunch' ? '☀️ Pranzo' : '🌙 Serale'}</span><h2>${isOpen ? 'APERTO' : 'Chiuso'}</h2>${context}${actions}</article>`;
  }).join('')}</div>${ovenPanel(state)}`;
}

// Il forno decide l'attesa promessa a chi ordina: se cambia la teglia o il
// tempo di cottura, deve cambiare anche qui, altrimenti l'orario che diamo
// smette di essere vero.
export function ovenPanel(state = {}) {
  const service = Object.values(state.services || {}).find(entry => entry?.status === 'open');
  const oven = service?.oven || DEFAULT_OVEN;
  if (!service) {
    return `<article class="card"><span class="eyebrow">Forno</span><h2>${oven.slots} pizze ogni ${oven.bakeMinutes} minuti</h2>
      <p>Circa ${ovenThroughput(oven)} pizze all'ora. Apri un servizio per cambiare queste impostazioni.</p></article>`;
  }
  return `<article class="card"><span class="eyebrow">Forno</span>
    <h2>${ovenThroughput(oven)} pizze all'ora</h2>
    <p>${oven.slots} pizze insieme, ${oven.bakeMinutes} minuti a infornata, piu ${oven.bufferMinutes} minuti di margine per incartare e consegnare.</p>
    <form id="oven-form" class="history-filters">
      <label>Pizze nel forno<input name="slots" inputmode="numeric" value="${oven.slots}"></label>
      <label>Minuti a infornata<input name="bakeMinutes" inputmode="numeric" value="${oven.bakeMinutes}"></label>
      <label>Margine in minuti<input name="bufferMinutes" inputmode="numeric" value="${oven.bufferMinutes}"></label>
      <label>&nbsp;<button class="btn primary" type="submit">Salva il forno</button></label>
    </form>
    <p class="editor-note">Vale per gli ordini che arrivano da adesso: quelli gia' in coda tengono l'orario promesso.</p>
  </article>`;
}

export function shiftLabel(shift) {
  return SHIFT_LABELS[shift] || shift;
}
