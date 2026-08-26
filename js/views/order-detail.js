// La scheda di un ordine, aperta toccandolo.
//
// Serve quando qualcosa non torna: il cliente chiama, ha cambiato idea, non si
// presenta. Quindi qui dentro c'e' tutto quello che serve per rispondergli,
// compreso il suo numero che si chiama con un tocco invece di essere ricopiato
// a mano su un tastierino.

import { normalizePhone } from '../domain.js';
import { promisedMinutes } from '../messages.js';
import { ticketLines } from './kitchen.js';

const STATI = {
  received: 'Ricevuto',
  preparing: 'In preparazione',
  ready: 'Pronto, da ritirare',
  collected: 'Consegnato',
  cancelled: 'Annullato'
};

export function contactLinks(order = {}) {
  const digits = normalizePhone(order.phone ?? '').replace('+', '');
  const numero = digits.length >= 9 ? (digits.startsWith('39') ? digits : `39${digits}`) : null;
  const email = String(order.email ?? '').trim();
  return {
    tel: numero ? `tel:+${numero}` : null,
    mail: email ? `mailto:${email}` : null
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

function riga(item) {
  return `<li>
    <div class="kt-item"><b>${Number(item.quantity ?? 1)}</b><span>${escapeHtml(item.name ?? '')}</span></div>
    ${ticketLines(item).map(line => `<span class="kt-${line.kind}${line.alert ? ' alert' : ''}">${escapeHtml(line.text)}</span>`).join('')}
  </li>`;
}

export function orderDetailPanel(order = {}, money = value => `${value}`) {
  const { tel, mail } = contactLinks(order);
  const minuti = promisedMinutes(order);
  const azioni = order.status === 'preparing'
    ? `<button class="btn primary ready" data-id="${escapeHtml(order.id)}">Segna pronto</button>`
    : order.status === 'ready'
      ? `<button class="btn primary collected" data-id="${escapeHtml(order.id)}">Segna consegnato</button>`
      : '';
  return `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-label="Dettaglio ordine">
    <div class="modal-head">
      <div>
        <span class="eyebrow">${escapeHtml(order.businessDate ?? '')} · ${escapeHtml(String(order.source ?? '').toLowerCase() === 'web' ? 'dal sito' : 'in pizzeria')}</span>
        <h2>#${String(order.sequence ?? 0).padStart(2, '0')} · ${escapeHtml(order.customer ?? 'Cliente')}</h2>
      </div>
      <button class="btn secondary" id="detail-close">Chiudi</button>
    </div>

    <div class="detail-facts">
      <div><dt>Stato</dt><dd>${STATI[order.status] ?? order.status ?? '—'}</dd></div>
      <div><dt>Ordinato</dt><dd>${clock(order.createdAt)}</dd></div>
      <div><dt>Promesso</dt><dd>${minuti == null ? '—' : `${minuti} min · ${clock(order.readyAt)}`}</dd></div>
      <div><dt>Pagamento</dt><dd>${escapeHtml(order.payment ?? 'Non indicato')}</dd></div>
    </div>

    <div class="detail-contacts">
      ${tel ? `<a class="btn primary" href="${escapeHtml(tel)}">Chiama ${escapeHtml(order.phone ?? '')}</a>` : '<p class="editor-note">Nessun numero di telefono.</p>'}
      ${mail ? `<a class="btn secondary" href="${escapeHtml(mail)}">Scrivi a ${escapeHtml(order.email ?? '')}</a>` : ''}
    </div>

    <h3>Cosa ha ordinato</h3>
    <ul class="kt-items">${(order.items ?? []).map(riga).join('')}</ul>
    <p class="detail-total">Totale ${money(Number(order.total ?? 0))}</p>

    <div class="detail-actions">
      ${azioni}
      <button class="btn secondary" id="detail-edit" data-id="${escapeHtml(order.id)}">Modifica l'ordine</button>
      <button class="btn secondary ticket" data-id="${escapeHtml(order.id)}">Stampa comanda</button>
    </div>
  </section></div>`;
}
