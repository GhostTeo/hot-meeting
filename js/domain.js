export function normalizePhone(value = '') {
  const raw = String(value).trim();
  const plus = raw.startsWith('+');
  const digits = raw.replace(/\D/g, '');
  return `${plus ? '+' : ''}${digits}`;
}

export function isValidItalianPhone(value) {
  const phone = normalizePhone(value);
  return /^(?:\+39)?(?:3\d{9}|0\d{5,10})$/.test(phone);
}

export function estimateMinutes(pizzasAhead, capacity = 90) {
  return Math.max(10, Math.ceil((Math.max(0, pizzasAhead) / Math.max(1, capacity)) * 60) + 10);
}

export function formatTimer(secondsRemaining) {
  const late = secondsRemaining < 0;
  const value = Math.abs(Math.trunc(secondsRemaining));
  const minutes = String(Math.floor(value / 60)).padStart(2, '0');
  const seconds = String(value % 60).padStart(2, '0');
  return { text: `${late ? '+' : '-'}${minutes}:${seconds}`, late };
}

export function summarizeOrders(orders, shift) {
  const done = orders.filter(order => order.shift === shift && ['ready', 'collected'].includes(order.status));
  return done.reduce((sum, order) => {
    const pizzas = (order.items || []).reduce((count, item) => count + (item.quantity || 1), 0);
    sum.orders += 1;
    sum.pizzas += pizzas;
    sum.gross += Number(order.total || 0);
    sum.fees += Number(order.fee || 0);
    sum.net = sum.gross - sum.fees;
    return sum;
  }, { orders: 0, pizzas: 0, gross: 0, fees: 0, net: 0 });
}
