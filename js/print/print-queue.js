// Cosa mandare alla stampante e quando.
//
// La comanda deve uscire da sola quando entra l'ordine: se qualcuno deve
// premere «stampa», in un venerdi' sera non lo premera'. Qui si tiene il conto
// di cosa e' gia' uscito, perche' una comanda stampata due volte manda in forno
// due pizze.
//
// Il browser, da solo, apre comunque la finestra di stampa: per farla uscire in
// silenzio Chrome va avviato con --kiosk-printing e una stampante predefinita.
// La strada definitiva resta la Epson collegata direttamente.

import { buildKitchenTicket } from './kitchen-ticket.js';

export function ticketsToPrint(orders = [], printed = new Set()) {
  const nuovi = orders.filter(order => !printed.has(String(order.id)));
  for (const order of nuovi) printed.add(String(order.id));
  return nuovi;
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
}

function riga(row) {
  if (row.kind === 'separator') return `<div>${'-'.repeat(42)}</div>`;
  if (row.kind === 'section') return `<div class="ticket-section">${escapeHtml(row.text)}</div>`;
  const classe = row.kind === 'number' ? ' class="ticket-number"' : row.kind === 'booking' ? ' class="ticket-booking"' : row.alert ? ' class="ticket-alert"' : '';
  return `<div${classe}>${escapeHtml(row.text)}</div>`;
}

export function printMarkup(orders = [], options = {}) {
  return orders
    .map(order => `<div class="ticket-page">${buildKitchenTicket(order, options).map(riga).join('')}</div>`)
    .join('');
}

// Il riepilogo di cassa esce dalla stessa stampante e con lo stesso codice:
// sono righe con la stessa forma, cambia solo cosa dicono.
export function linesMarkup(lines = []) {
  return `<div class="ticket-page">${lines.map(riga).join('')}</div>`;
}
