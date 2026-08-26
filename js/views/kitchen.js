// Il banco della cucina.
//
// Chi impasta guarda questo schermo con le mani sporche di farina: deve capire
// in un secondo quale ordine e', chi lo aspetta, cosa contiene e quanto manca.
// Niente altro.
//
// Si lavora per scadenza, non per ordine di arrivo: davanti va quello che deve
// uscire prima. Il ritardo si vede da lontano, e i minuti promessi sono quelli
// dati al cliente, non una stima rifatta ogni volta che si guarda lo schermo.

import { promisedMinutes } from '../messages.js';

function decorate(order, now) {
  const minutesLeft = order.readyAt ? Math.round((Number(order.readyAt) - now) / 60000) : null;
  return {
    ...order,
    promised: promisedMinutes(order),
    minutesLeft,
    late: minutesLeft != null && minutesLeft < 0
  };
}

export function kitchenBoard(orders = [], now = Date.now()) {
  const byDeadline = (left, right) => Number(left.readyAt ?? 0) - Number(right.readyAt ?? 0);
  const decorated = orders.map(order => decorate(order, now));
  return {
    preparing: decorated.filter(order => ['received', 'preparing'].includes(order.status)).sort(byDeadline),
    ready: decorated.filter(order => order.status === 'ready').sort(byDeadline)
  };
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
}

function clock(value) {
  return value ? new Date(value).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : '--:--';
}

const ALLERGY = /allerg|celiac|intoller|glutine|lattosio|noci|arachidi|crostacei/i;

// «Cereali contenenti glutine» e' la formula di legge, giusta sul menu. Sul
// banco serve la parola che si usa impastando.
const ALLERGENE_BREVE = {
  'cereali contenenti glutine': 'Glutine',
  'anidride solforosa e solfiti': 'Solfiti',
  'frutta a guscio': 'Frutta a guscio',
  'semi di sesamo': 'Sesamo'
};

// L'allergene arriva come oggetto dal database (etichetta nelle due lingue) o
// come semplice testo dai dati locali: la comanda deve leggersi in entrambi i
// casi, non stampare «[object Object]» sul banco.
function shortAllergen(allergen) {
  const label = typeof allergen === 'string' ? allergen : (allergen?.label_it ?? allergen?.it ?? '');
  return ALLERGENE_BREVE[String(label).toLowerCase()] ?? label;
}

// Le righe sotto il nome del piatto, nell'ordine in cui servono al pizzaiolo:
// prima cosa NON deve mettere, poi cosa aggiungere, poi la richiesta scritta,
// infine gli allergeni dichiarati.
export function ticketLines(item = {}) {
  const lines = [];
  const removed = (item.removed ?? []).filter(Boolean);
  if (removed.length) lines.push({ kind: 'remove', text: `SENZA ${removed.join(', ')}` });

  const additions = (item.additions ?? []).filter(addition => Number(addition.quantity ?? 0) > 0);
  if (additions.length) {
    lines.push({ kind: 'add', text: `+ ${additions.map(a => `${a.quantity} ${a.name}`).join(', ')}` });
  }

  const note = String(item.note ?? '').trim();
  if (note) lines.push({ kind: 'note', text: note, alert: ALLERGY.test(note) });

  const allergens = (item.allergens ?? []).map(shortAllergen).filter(Boolean);
  if (allergens.length) lines.push({ kind: 'allergens', text: allergens.join(', ') });

  return lines;
}

function itemLine(item) {
  return `<li>
    <div class="kt-item"><b>${Number(item.quantity ?? 1)}</b><span>${escapeHtml(item.name ?? '')}</span></div>
    ${ticketLines(item).map(line => `<span class="kt-${line.kind}${line.alert ? ' alert' : ''}">${escapeHtml(line.text)}</span>`).join('')}
  </li>`;
}

// In preparazione conta quanto manca. Sul banco dei pronti no: la pizza e' gia'
// fatta, un ritardo enorme in rosso direbbe soltanto che il cliente tarda a
// passare. Li' serve sapere da quanto sta aspettando.
function counter(order, waiting) {
  if (order.minutesLeft == null) return '<span class="kt-left">—</span>';
  if (waiting) {
    const attesa = Math.max(0, -order.minutesLeft);
    return `<span class="kt-left waiting">${attesa === 0 ? 'ora' : `da ${attesa} min`}</span>`;
  }
  return order.late
    ? `<span class="kt-left late">+${Math.abs(order.minutesLeft)} min</span>`
    : `<span class="kt-left">${order.minutesLeft} min</span>`;
}

function ticket(order, actions, waiting = false) {
  return `<article class="kt ${order.late && !waiting ? 'late' : ''} ${waiting ? 'done' : ''}">
    <header class="kt-head">
      <span class="kt-number">#${String(order.sequence ?? 0).padStart(2, '0')}</span>
      <div class="kt-times">
        <span>ordinato ${clock(order.createdAt)}</span>
        <span>${waiting ? `promessi ${order.promised ?? '—'} min` : `promessi ${order.promised ?? '—'} min · esce ${clock(order.readyAt)}`}</span>
      </div>
      ${counter(order, waiting)}
    </header>
    <p class="kt-who">${escapeHtml(order.customer ?? 'Cliente')}${order.source ? ` · ${escapeHtml(String(order.source).toLowerCase() === 'web' ? 'dal sito' : 'in pizzeria')}` : ''}</p>
    <ul class="kt-items">${(order.items ?? []).map(itemLine).join('')}</ul>
    <div class="kt-actions">${actions}</div>
  </article>`;
}

export function kitchenPanel(orders = [], now = Date.now()) {
  const board = kitchenBoard(orders, now);
  const inRitardo = board.preparing.filter(order => order.late).length;
  return `<div class="kt-top">
      <h1>Cucina</h1>
      <p>${board.preparing.length} da preparare${inRitardo ? ` · <b class="warning">${inRitardo} in ritardo</b>` : ''}${board.ready.length ? ` · ${board.ready.length} da ritirare` : ''}</p>
    </div>
    ${board.preparing.length
      ? `<div class="kt-grid">${board.preparing.map(order => ticket(order, `
          <button class="btn primary ready" data-id="${escapeHtml(order.id)}">Pronto</button>
          <button class="btn secondary ticket" data-id="${escapeHtml(order.id)}">Stampa</button>`)).join('')}</div>`
      : '<div class="card"><h2>Forno libero</h2><p>Nessuna comanda da preparare.</p></div>'}
    ${board.ready.length
      ? `<h2 class="kt-section">Pronti, da consegnare</h2>
         <div class="kt-grid">${board.ready.map(order => ticket(order, `
           <button class="btn primary collected" data-id="${escapeHtml(order.id)}">Consegnato</button>`, true)).join('')}</div>`
      : ''}`;
}
