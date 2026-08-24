const ACTIVE_ORDER_STATUSES = new Set(['received', 'preparing']);

function dateInRome(now) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Rome',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date(now));
  const value = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function isoWeekday(date) {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

function scheduledClosureDays(schedule) {
  if (Array.isArray(schedule)) return schedule;
  return schedule?.closedWeekdays || schedule?.weekdays || [];
}

function matchingException(date, exceptions) {
  if (Array.isArray(exceptions)) {
    return exceptions.find(exception => exception.date === date || (exception.from <= date && date <= exception.to));
  }
  return exceptions?.[date];
}

export function resolveBusinessDate(now, activeDay) {
  return activeDay?.status === 'open' ? activeDay.date : dateInRome(now);
}

export function nextDailySequence(orders, businessDate) {
  const sequences = orders
    .filter(order => order.businessDate === businessDate)
    .map(order => Number(order.sequence) || 0);
  return (sequences.length ? Math.max(...sequences) : 0) + 1;
}

export function canCloseService(orders, serviceId) {
  return !orders.some(order => order.serviceId === serviceId && ACTIVE_ORDER_STATUSES.has(order.status));
}

export function resolveClosure(date, schedule, exceptions) {
  const exception = matchingException(date, exceptions);
  if (exception) return { closed: Boolean(exception.closed), ...(exception.message ? { message: exception.message } : {}) };
  return { closed: scheduledClosureDays(schedule).includes(isoWeekday(date)) };
}
