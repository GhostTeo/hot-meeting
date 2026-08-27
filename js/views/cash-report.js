// Il riepilogo da fare in cassa a fine turno.
//
// La sera si contano i soldi nel cassetto e devono tornare: per questo i
// contanti si contano a parte dall'elettronico, che nel cassetto non c'e'.
// I supplementi incassati dopo una modifica finiscono nel metodo con cui sono
// stati presi, non in quello dell'ordine originale.
//
// Entrano solo gli ordini chiusi: quello che e' ancora in forno non e' incasso.

import { DEMO_PAYMENT_METHODS } from '../domain.js';

const CHIUSI = new Set(['ready', 'collected']);

// «Paga in cassa» e' come lo si dice al cliente. In cassa la parola giusta e'
// «Contanti»: e' quello che si conta nel cassetto.
const IN_CASSA = { cash: 'Contanti', apple_pay: 'Apple Pay', google_pay: 'Google Pay' };
const TURNI = { lunch: 'Pranzo', dinner: 'Serale' };

function pizzaCount(order) {
  return (order.items ?? []).reduce((totale, item) => totale + Number(item.quantity ?? 1), 0);
}

export function cashReport(orders = [], businessDate, shift) {
  const vuoto = Object.fromEntries(DEMO_PAYMENT_METHODS.map(method => [method.id, 0]));
  return (orders ?? [])
    .filter(order => order.businessDate === businessDate)
    .filter(order => CHIUSI.has(order.status))
    .filter(order => !shift || order.shift === shift)
    .reduce((report, order) => {
      const metodo = order.paymentMethod ?? 'cash';
      report.orders += 1;
      report.pizzas += pizzaCount(order);
      report.gross += Number(order.gross ?? 0);
      report.fees += Number(order.fees ?? 0);
      report.byMethod[metodo] = Number(((report.byMethod[metodo] ?? 0) + Number(order.gross ?? 0)).toFixed(2));

      for (const movimento of (order.adjustments ?? []).filter(entry => entry.status === 'recorded')) {
        const importo = Number(movimento.amount ?? 0);
        const dove = movimento.method ?? metodo;
        if (movimento.type === 'supplement') {
          report.supplements += importo;
          report.byMethod[dove] = Number(((report.byMethod[dove] ?? 0) + importo).toFixed(2));
        }
        if (movimento.type === 'refund') {
          report.refunds += importo;
          report.byMethod[dove] = Number(((report.byMethod[dove] ?? 0) - importo).toFixed(2));
        }
      }

      report.net = Number((report.gross + report.supplements - report.fees - report.refunds).toFixed(2));
      return report;
    }, { orders: 0, pizzas: 0, gross: 0, fees: 0, supplements: 0, refunds: 0, net: 0, byMethod: vuoto });
}

function euro(value) {
  return `${Number(value ?? 0).toFixed(2).replace('.', ',')} EUR`;
}

// Le stesse righe della comanda: chi stampa le traduce, cosi' il riepilogo esce
// dalla stessa stampante e con lo stesso codice.
export function cashReportLines(report, { date = '', shift = null } = {}) {
  const [anno, mese, giorno] = String(date).split('-');
  const righe = [
    { kind: 'number', text: `${giorno ?? '--'}-${mese ?? '--'}` },
    { kind: 'meta', text: `Riepilogo di cassa · ${shift ? TURNI[shift] ?? shift : 'giornata intera'}` },
    { kind: 'meta', text: `Anno ${anno ?? '----'}` },
    { kind: 'separator', text: '' },
    { kind: 'item', text: `Ordini chiusi: ${report.orders}` },
    { kind: 'item', text: `Pezzi usciti: ${report.pizzas}` },
    { kind: 'separator', text: '' }
  ];
  for (const method of DEMO_PAYMENT_METHODS) {
    righe.push({ kind: 'item', text: `${IN_CASSA[method.id] ?? method.label}: ${euro(report.byMethod[method.id])}` });
  }
  righe.push({ kind: 'separator', text: '' });
  righe.push({ kind: 'change', text: `Incasso lordo: ${euro(report.gross)}` });
  if (report.supplements) righe.push({ kind: 'change', text: `Supplementi: ${euro(report.supplements)}` });
  if (report.refunds) righe.push({ kind: 'change', text: `Rimborsi: ${euro(report.refunds)}` });
  if (report.fees) righe.push({ kind: 'change', text: `Trattenute: ${euro(report.fees)}` });
  righe.push({ kind: 'footer', text: `Totale netto: ${euro(report.net)}` });
  return righe;
}
