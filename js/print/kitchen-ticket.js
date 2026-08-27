// La comanda di cucina, indipendente dalla stampante.
//
// Qui si decide COSA c'e' scritto e con quanta forza: il numero grande, il
// piatto in evidenza, le modifiche sotto, le allergie segnalate. Come si scrive
// (ESC/POS, ePOS-Print XML, un foglio A4 di prova) e' un problema del driver,
// che riceve queste righe e le traduce. Cosi' cambiare stampante non cambia la
// comanda, e la comanda si puo' provare senza avere una stampante.
//
// Ogni riga e' { kind, text } dove kind vale:
//   number     il progressivo del giorno, da stampare grande
//   meta       provenienza, cliente, orari
//   separator  una riga di stacco
//   item       il piatto, con quantita'
//   change     una modifica del piatto (senza / aggiunta)
//   note       una richiesta scritta dal cliente; alert:true se parla di allergie
//   allergens  gli allergeni dichiarati per quel piatto
//   section    uno stacco fra cio' che va in forno e cio' che si prende al banco
//   footer     come si paga

import { allergenShortNames } from '../allergens.js';

const ALLERGY = /allerg|celiac|intoller|lattosio|glutine|noci|arachidi|crostacei/i;

function clock(value) {
  if (!value) return null;
  return new Date(value).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

function orderNumber(order) {
  return order.sequence ? `#${String(order.sequence).padStart(2, '0')}` : `#${order.id ?? ''}`;
}

// Le bibite stanno sulla comanda, perche' chi consegna deve sapere cosa mettere
// nel sacchetto, ma in fondo e staccate: chi impasta non deve cercare la pizza
// in mezzo alle lattine.
export function buildKitchenTicket(order = {}, { isDrink = () => false } = {}) {
  const rows = [{ kind: 'number', text: orderNumber(order) }];

  const chi = [String(order.source ?? '').toUpperCase(), order.customer].filter(Boolean).join(' · ');
  if (chi) rows.push({ kind: 'meta', text: chi });

  const orari = [
    clock(order.createdAt) && `Ordinato ${clock(order.createdAt)}`,
    clock(order.readyAt) && `Pronto ${clock(order.readyAt)}`
  ].filter(Boolean).join(' · ');
  if (orari) rows.push({ kind: 'meta', text: orari });

  rows.push({ kind: 'separator', text: '' });

  const righe = order.items ?? [];
  const forno = righe.filter(item => !isDrink(item));
  const banco = righe.filter(item => isDrink(item));

  for (const item of [...forno, ...banco]) {
    if (banco.length && item === banco[0]) rows.push({ kind: 'section', text: 'AL BANCO' });
    rows.push({ kind: 'item', text: `${item.quantity ?? 1}x ${String(item.name ?? '').toUpperCase()}` });
    for (const tolto of item.removed ?? []) {
      rows.push({ kind: 'change', text: `SENZA ${tolto}` });
    }
    for (const aggiunta of (item.additions ?? []).filter(entry => entry.quantity > 0)) {
      rows.push({ kind: 'change', text: `+ ${aggiunta.quantity}x ${aggiunta.name}` });
    }
    const nota = String(item.note ?? '').trim();
    // In cucina una nota sulle allergie non e' una preferenza: va vista subito.
    if (nota) rows.push({ kind: 'note', text: nota, alert: ALLERGY.test(nota) });

    // Anche sulla carta: chi impasta deve sapere cosa contiene quel piatto,
    // non solo cosa ha scritto il cliente.
    const allergeni = allergenShortNames(item.allergens ?? []);
    if (allergeni.length) rows.push({ kind: 'allergens', text: `ALLERGENI: ${allergeni.join(', ')}` });
  }

  rows.push({ kind: 'separator', text: '' });
  rows.push({ kind: 'footer', text: order.payment ?? 'Pagamento non indicato' });
  return rows;
}

function wrap(text, width) {
  const lines = [];
  let current = '';
  for (const word of String(text).split(/\s+/).filter(Boolean)) {
    if (!current) current = word;
    else if (`${current} ${word}`.length <= width) current = `${current} ${word}`;
    else { lines.push(current); current = word; }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

// Anteprima leggibile: serve a provare la comanda prima di avere la stampante,
// e a stampare da un browser qualunque finche' non arriva quella vera.
export function ticketToText(rows = [], width = 42) {
  return rows
    .map(row => {
      if (row.kind === 'separator') return '-'.repeat(width);
      if (row.kind === 'section') return `\n-- ${row.text} --`;
      return wrap(row.text, width).join('\n');
    })
    .join('\n');
}
