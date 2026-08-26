// Il banco della cucina.
//
// Chi impasta guarda questo schermo con le mani sporche di farina: deve capire
// in un secondo quale ordine e', chi lo aspetta, cosa contiene e quanto manca.
// Niente altro.
//
// Si lavora per scadenza, non per ordine di arrivo: davanti va quello che deve
// uscire prima. Il ritardo si vede da lontano, e i minuti promessi sono quelli
// dati al cliente, non una stima rifatta ogni volta che si guarda lo schermo.

import { promisedMinutes, smsLink, waitMessage, whatsappLink } from '../messages.js';
import { customizationLines } from '../domain.js';

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

function itemLine(item) {
  const changes = customizationLines(item);
  const note = String(item.note ?? '').trim();
  return `<li>
    <b>${Number(item.quantity ?? 1)}×</b> ${escapeHtml(item.name ?? '')}
    ${changes.length ? `<span class="kt-change">${escapeHtml(changes.join(' · '))}</span>` : ''}
    ${note ? `<span class="kt-note${ALLERGY.test(note) ? ' alert' : ''}">${escapeHtml(note)}</span>` : ''}
  </li>`;
}

function counter(order) {
  if (order.minutesLeft == null) return '<span class="kt-left">—</span>';
  return order.late
    ? `<span class="kt-left late">+${Math.abs(order.minutesLeft)} min</span>`
    : `<span class="kt-left">${order.minutesLeft} min</span>`;
}

function notify(order) {
  if (!order.phone) return '';
  const testo = waitMessage(order);
  const sms = smsLink(order.phone, testo);
  const wa = whatsappLink(order.phone, testo);
  if (!sms && !wa) return '';
  return `<div class="kt-notify"><span>Avvisa</span>
    ${sms ? `<a class="btn secondary" href="${escapeHtml(sms)}">SMS</a>` : ''}
    ${wa ? `<a class="btn secondary" href="${escapeHtml(wa)}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
  </div>`;
}

function ticket(order, actions) {
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
    <div class="kt-actions">${actions}</div>
    ${notify(order)}
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
           <button class="btn primary collected" data-id="${escapeHtml(order.id)}">Consegnato</button>`)).join('')}</div>`
      : ''}`;
}
