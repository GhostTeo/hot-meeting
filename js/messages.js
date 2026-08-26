// Il messaggio che la pizzeria manda a chi ha ordinato.
//
// Uno solo, e dice una cosa sola: fra quanto e' pronto. Chi lavora in sala non
// ha tempo di scegliere fra tre testi e due canali; e chi aspetta vuole sapere
// quel numero, non leggere un comunicato.
//
// I minuti sono quelli dell'ordine, gli stessi che la cucina ha davanti: non si
// ricalcolano qui, altrimenti col passare del tempo il messaggio direbbe una
// cosa e lo schermo un'altra.
//
// L'invio automatico non c'e' e non si finge: mandare un SMS senza che nessuno
// tocchi il telefono richiede un operatore esterno a pagamento. Qui il bottone
// apre l'app di messaggi col testo gia' scritto e il numero gia' dentro.

import { normalizePhone } from './domain.js';

export function promisedMinutes(order = {}) {
  if (!order.readyAt || !order.createdAt) return null;
  return Math.max(0, Math.round((Number(order.readyAt) - Number(order.createdAt)) / 60000));
}

function orderNumber(order = {}) {
  return `#${String(order.sequence ?? 0).padStart(2, '0')}`;
}

export function waitMessage(order = {}) {
  const minuti = promisedMinutes(order);
  return minuti == null
    ? `Hot Meeting: ordine ${orderNumber(order)}, ti avvisiamo appena e pronto.`
    : `Hot Meeting: ordine ${orderNumber(order)}, pronto tra circa ${minuti} minuti.`;
}

// Numero in formato internazionale: senza prefisso i collegamenti non aprono
// niente, e un numero storto e' peggio di nessun bottone.
function international(phone) {
  const digits = normalizePhone(phone).replace('+', '');
  if (digits.length < 9) return null;
  return digits.startsWith('39') ? digits : `39${digits}`;
}

export function smsLink(phone, text) {
  const numero = international(phone);
  // La forma "?&body=" e' quella che apre il messaggio precompilato sia su
  // iPhone sia su Android.
  return numero ? `sms:+${numero}?&body=${encodeURIComponent(text)}` : null;
}

export function whatsappLink(phone, text) {
  const numero = international(phone);
  return numero ? `https://wa.me/${numero}?text=${encodeURIComponent(text)}` : null;
}
