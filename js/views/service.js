import { nextDailySequence, resolveBusinessDate, resolveClosure } from '../operations.js';

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

function transitionMode(state, shift, now, action) {
  if (action === 'reopen' && isReopenEligible(state.services[shift], now)) return 'reopen';
  if (action === 'new-day' || state.activeDay?.status !== 'open') return 'new-day';
  return 'open';
}

export function startServiceTransition(state, shift, now = Date.now(), action = 'open') {
  const existing = state.services[shift];
  const mode = transitionMode(state, shift, now, action);
  const reopening = mode === 'reopen';
  const newDay = mode === 'new-day';
  const businessDate = reopening
    ? existing.businessDate
    : resolveBusinessDate(now, newDay ? null : state.activeDay);
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

export function servicePanel(services = {}, now = Date.now()) {
  return `<h1>Servizio</h1><div class="grid service-grid">${['lunch', 'dinner'].map(shift => {
    const service = services[shift];
    const isOpen = service?.status === 'open';
    const canReopen = isReopenEligible(service, now);
    const actions = isOpen
      ? `<button class="btn secondary service-action" data-service-action="close" data-shift="${shift}">Chiudi servizio</button>`
      : canReopen
        ? `<div class="service-actions"><button class="btn primary service-action" data-service-action="reopen" data-shift="${shift}">Riapri servizio</button><button class="btn secondary service-action" data-service-action="new-day" data-shift="${shift}">Avvia nuova giornata</button></div>`
        : `<button class="btn primary service-action" data-service-action="open" data-shift="${shift}">Apri servizio</button>`;
    return `<article class="card"><span class="eyebrow">${shift === 'lunch' ? '☀️ Pranzo' : '🌙 Serale'}</span><h2>${isOpen ? 'APERTO' : 'Chiuso'}</h2>${service ? `<p>Giornata operativa <b>${service.businessDate}</b></p>` : '<p>Nessuna sessione per la giornata.</p>'}${actions}</article>`;
  }).join('')}</div>`;
}

export function shiftLabel(shift) {
  return SHIFT_LABELS[shift] || shift;
}
