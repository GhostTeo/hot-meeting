const COMPLETED_ORDER_STATUSES = new Set(['ready', 'collected']);

function pizzaCount(order) {
  if (Number.isFinite(Number(order.pizzas))) return Number(order.pizzas);
  return (order.items || []).reduce((total, item) => {
    if (item.type && item.type !== 'pizza') return total;
    return total + Number(item.quantity || 1);
  }, 0);
}

// Un movimento entra nei conti solo quando e' stato davvero registrato:
// quelli in attesa o annullati non hanno ancora mosso denaro.
function adjustmentTotals(adjustments = []) {
  return adjustments.filter(adjustment => adjustment.status === 'recorded').reduce((totals, adjustment) => {
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
