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

function round2(value) {
  return Number(Number(value ?? 0).toFixed(2));
}

// Il dettaglio dietro l'incasso di un turno: una riga per ordine chiuso, con
// lordo, trattenute (quello che Stripe tiene sui pagamenti online) e netto.
// Serve al Creator per capire da dove arriva la cifra e cosa gli resta davvero.
export function shiftBreakdown(orders, businessDate, shift) {
  const rows = (orders || [])
    .filter(order => order.businessDate === businessDate)
    .filter(order => COMPLETED_ORDER_STATUSES.has(order.status))
    .filter(order => !shift || order.shift === shift)
    .map(order => {
      const adjustments = adjustmentTotals(order.adjustments);
      const gross = round2(Number(order.gross || 0) + adjustments.supplements);
      const fees = round2(Number(order.fees || 0));
      const refunds = round2(adjustments.refunds);
      const net = round2(gross - fees - refunds);
      return {
        number: order.sequence ?? null,
        gross,
        fees,
        refunds,
        net,
        pizzas: pizzaCount(order),
        paymentMethod: order.paymentMethod ?? 'cash',
        // Pagato online = incassato tramite Stripe: e' quello su cui c'e' una
        // trattenuta e che non entra nel cassetto contanti.
        online: order.paymentStatus === 'paid' || Boolean(order.stripeSessionId)
      };
    })
    .sort((a, b) => (a.number ?? 0) - (b.number ?? 0));

  const totals = rows.reduce((total, row) => {
    total.orders += 1;
    total.pizzas += row.pizzas;
    total.gross = round2(total.gross + row.gross);
    total.fees = round2(total.fees + row.fees);
    total.refunds = round2(total.refunds + row.refunds);
    total.net = round2(total.net + row.net);
    return total;
  }, { orders: 0, pizzas: 0, gross: 0, fees: 0, refunds: 0, net: 0 });

  return { businessDate, shift: shift ?? null, rows, totals };
}
