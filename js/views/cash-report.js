// Il riepilogo da fare in cassa a fine turno.
//
// La sera si contano i soldi nel cassetto e devono tornare: per questo i
// contanti si contano a parte dall'elettronico, che nel cassetto non c'e'.
// I supplementi incassati dopo una modifica finiscono nel metodo con cui sono
// stati presi, non in quello dell'ordine originale.
//
// Entrano solo gli ordini chiusi: quello che e' ancora in forno non e' incasso.

import { DEMO_PAYMENT_METHODS } from '../domain.js';
import { shiftBreakdown } from '../reports.js';

// I contanti sono l'unica cosa che sta davvero nel cassetto; tutto il resto
// (Apple Pay, Google Pay, online) e' elettronico e non si conta a mano.
const METODI_CONTANTI = new Set(['cash']);

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
export function cashReportLines(report, { date = '', shift = null, orders = null } = {}) {
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

  // Riepilogo che serve a far quadrare il cassetto: da un lato i contanti (che
  // ci sono davvero), dall'altro tutto l'elettronico (che non c'e').
  const contanti = Number(DEMO_PAYMENT_METHODS
    .filter(method => METODI_CONTANTI.has(method.id))
    .reduce((totale, method) => totale + Number(report.byMethod[method.id] ?? 0), 0).toFixed(2));
  const elettronico = Number((Number(report.gross ?? 0) + Number(report.supplements ?? 0) - Number(report.refunds ?? 0) - contanti).toFixed(2));
  righe.push({ kind: 'separator', text: '' });
  righe.push({ kind: 'change', text: `Nel cassetto (contanti): ${euro(contanti)}` });
  righe.push({ kind: 'change', text: `Elettronico: ${euro(elettronico)}` });

  righe.push({ kind: 'separator', text: '' });
  righe.push({ kind: 'change', text: `Incasso lordo: ${euro(report.gross)}` });
  if (report.supplements) righe.push({ kind: 'change', text: `Supplementi: ${euro(report.supplements)}` });
  if (report.refunds) righe.push({ kind: 'change', text: `Rimborsi: ${euro(report.refunds)}` });
  if (report.fees) righe.push({ kind: 'change', text: `Trattenute Stripe: ${euro(report.fees)}` });
  righe.push({ kind: 'footer', text: `Totale netto: ${euro(report.net)}` });

  // Con gli ordini in mano stampiamo anche il dettaglio, uno per riga: numero,
  // pezzi, metodo e netto. Cosi' il foglio di cassa spiega da dove nasce la
  // cifra, non e' solo un totale.
  if (Array.isArray(orders)) {
    const dettaglio = shiftBreakdown(orders, date, shift);
    if (dettaglio.rows.length) {
      righe.push({ kind: 'separator', text: '' });
      righe.push({ kind: 'meta', text: 'Dettaglio ordini' });
      for (const row of dettaglio.rows) {
        const numero = `#${String(row.number ?? '').padStart(2, '0')}`;
        const metodo = IN_CASSA[row.paymentMethod] ?? row.paymentMethod;
        const nota = row.online ? ' online' : '';
        righe.push({ kind: 'item', text: `${numero} ${row.pizzas}pz ${metodo}${nota}: ${euro(row.net)}` });
      }
    }
  }

  return righe;
}
