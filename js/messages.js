// I messaggi che la pizzeria manda a chi ha ordinato.
//
// Sono gia' scritti perche' durante il servizio non c'e' tempo di comporli, e
// perche' un messaggio scritto di fretta dice meno di quello che serve: il
// numero dell'ordine, l'ora, e come farsi sentire.
//
// L'invio automatico non c'e' e non puo' esserci da qui: mandare un SMS senza
// che nessuno tocchi il telefono richiede un operatore esterno a pagamento con
// le sue credenziali. Quello che si puo' fare, e che si fa, e' aprire l'app di
// messaggi con il testo gia' pronto: un tocco e parte.

import { buildPublicOrderCode } from './views/order-receipt.js';
import { normalizePhone } from './domain.js';

function clock(value) {
  if (!value) return null;
  return new Date(value).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

const TEMPLATES = {
  received: (code, order) => {
    const ora = clock(order.readyAt);
    return `Hot Meeting: ordine ${code} ricevuto.${ora ? ` Pronto verso le ${ora}.` : ''} Ti avvisiamo appena esce dal forno.`;
  },
  ready: code => `Hot Meeting: il tuo ordine ${code} è pronto. Ti aspettiamo in pizzeria.`,
  late: code => `Hot Meeting: il tuo ordine ${code} sta uscendo con qualche minuto di ritardo. Ci scusiamo, ti avvisiamo appena è pronto.`
};

export const MESSAGE_KINDS = Object.freeze([
  { id: 'received', label: 'Ordine ricevuto' },
  { id: 'ready', label: 'È pronto' },
  { id: 'late', label: 'Un po’ di ritardo' }
]);

export function customerMessage(kind, order = {}, { pizzeriaPhone = '' } = {}) {
  const code = buildPublicOrderCode(order.businessDate, order.sequence);
  const corpo = (TEMPLATES[kind] ?? TEMPLATES.ready)(code, order);
  const nome = String(order.customer ?? '').trim();
  const apertura = nome && nome.toLowerCase() !== 'cliente' ? `Ciao ${nome}, ` : '';
  const coda = String(pizzeriaPhone ?? '').trim() ? ` Info: ${pizzeriaPhone}` : '';
  return `${apertura}${corpo}${coda}`;
}

// Numero in formato internazionale: senza prefisso i collegamenti non aprono
// niente, e un numero storto e' peggio di nessun bottone.
function international(phone) {
  const normalized = normalizePhone(phone);
  const digits = normalized.replace('+', '');
  if (digits.length < 9) return null;
  return digits.startsWith('39') ? digits : `39${digits}`;
}

export function smsLink(phone, text) {
  const numero = international(phone);
  if (!numero) return null;
  // La forma "?&body=" e' quella che apre il messaggio precompilato sia su
  // iPhone sia su Android.
  return `sms:+${numero}?&body=${encodeURIComponent(text)}`;
}

export function whatsappLink(phone, text) {
  const numero = international(phone);
  if (!numero) return null;
  return `https://wa.me/${numero}?text=${encodeURIComponent(text)}`;
}
