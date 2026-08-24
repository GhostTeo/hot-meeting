const COMPLETED_ORDER_STATUSES = new Set(['ready', 'collected']);

function isoDate(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function pizzaCount(order) {
  if (Number.isFinite(Number(order.pizzas))) return Number(order.pizzas);
  return (order.items || []).reduce((total, item) => total + Number(item.quantity || 1), 0);
}

function adjustmentTotals(adjustments = []) {
  return adjustments.reduce((totals, adjustment) => {
    const amount = Number(adjustment.amount || 0);
    if (adjustment.type === 'supplement') totals.supplements += amount;
    if (adjustment.type === 'refund') totals.refunds += amount;
    return totals;
  }, { supplements: 0, refunds: 0 });
}

function reportForPeriod(orders, period, shift) {
  const report = (orders || [])
    .filter(order => order.businessDate >= period.from && order.businessDate <= period.to)
    .filter(order => COMPLETED_ORDER_STATUSES.has(order.status))
    .filter(order => !shift || order.shift === shift)
    .reduce((total, order) => {
      const adjustments = adjustmentTotals(order.adjustments);
      total.orders += 1;
      total.pizzas += pizzaCount(order);
      total.gross += Number(order.gross || 0);
      total.fees += Number(order.fees || 0);
      total.supplements += adjustments.supplements;
      total.refunds += adjustments.refunds;
      return total;
    }, { orders: 0, pizzas: 0, gross: 0, fees: 0, supplements: 0, refunds: 0 });

  return { period, ...report, net: report.gross + report.supplements - report.fees - report.refunds };
}

export function dailyReport(orders, businessDate, shift) {
  return reportForPeriod(orders, { from: businessDate, to: businessDate }, shift);
}

export function monthlyReport(orders, year, month) {
  return reportForPeriod(orders, {
    from: isoDate(year, month, 1),
    to: isoDate(year, month, daysInMonth(year, month))
  });
}

export function semesterReport(orders, year, semester) {
  const firstMonth = semester === 1 ? 1 : 7;
  const lastMonth = semester === 1 ? 6 : 12;
  return reportForPeriod(orders, {
    from: isoDate(year, firstMonth, 1),
    to: isoDate(year, lastMonth, daysInMonth(year, lastMonth))
  });
}

export function annualReport(orders, year) {
  return reportForPeriod(orders, {
    from: isoDate(year, 1, 1),
    to: isoDate(year, 12, 31)
  });
}
