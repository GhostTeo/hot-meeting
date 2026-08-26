// Il banco della cucina.
//
// Chi impasta ha le mani nella farina e non tocca niente: questo schermo si
// guarda e basta, non ha nemmeno un bottone. Le comande entrano quando arriva
// l'ordine ed escono quando il cameriere lo chiude dalla sezione Ordini.
//
// Si lavora per scadenza, non per ordine di arrivo: davanti va quello che deve
// uscire prima. Il ritardo si vede da lontano, e i minuti promessi sono quelli
// dati al cliente, non una stima rifatta ogni volta che si guarda lo schermo.

import { promisedMinutes } from '../messages.js';
import { allergenShortNames } from '../allergens.js';

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

  const allergens = allergenShortNames(item.allergens ?? []);
  if (allergens.length) lines.push({ kind: 'allergens', text: allergens.join(', ') });

  return lines;
}

function itemLine(item) {
  return `<li>
    <div class="kt-item"><b>${Number(item.quantity ?? 1)}</b><span>${escapeHtml(item.name ?? '')}</span></div>
    ${ticketLines(item).map(line => `<span class="kt-${line.kind}${line.alert ? ' alert' : ''}">${escapeHtml(line.text)}</span>`).join('')}
  </li>`;
}

function counter(order) {
  if (order.minutesLeft == null) return '<span class="kt-left">—</span>';
  return order.late
    ? `<span class="kt-left late">+${Math.abs(order.minutesLeft)} min</span>`
    : `<span class="kt-left">${order.minutesLeft} min</span>`;
}

function ticket(order) {
  return `<article class="kt ${order.late ? 'late' : ''}">
    <header class="kt-head">
      <span class="kt-number">#${String(order.sequence ?? 0).padStart(2, '0')}</span>
      <div class="kt-times">
        <span>ordinato ${clock(order.createdAt)}</span>
        <span>promessi ${order.promised ?? '—'} min · esce ${clock(order.readyAt)}</span>
      </div>
      ${counter(order)}
    </header>
    <p class="kt-who">${escapeHtml(order.customer ?? 'Cliente')}${order.source ? ` · ${escapeHtml(String(order.source).toLowerCase() === 'web' ? 'dal sito' : 'in pizzeria')}` : ''}</p>
    <ul class="kt-items">${(order.items ?? []).map(itemLine).join('')}</ul>
  </article>`;
}

export function kitchenPanel(orders = [], now = Date.now()) {
  const board = kitchenBoard(orders, now);
  const inRitardo = board.preparing.filter(order => order.late).length;
  return `<div class="kt-top">
      <h1>Cucina</h1>
      <p>${board.preparing.length} da preparare${inRitardo ? ` · <b class="warning">${inRitardo} in ritardo</b>` : ''}</p>
    </div>
    ${board.preparing.length
      ? `<div class="kt-grid">${board.preparing.map(ticket).join('')}</div>
         <p class="kt-foot">Le comande si tolgono da sole quando il cameriere chiude l'ordine.</p>`
      : '<div class="card"><h2>Forno libero</h2><p>Nessuna comanda da preparare.</p></div>'}`;
}
