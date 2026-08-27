// L'ordine preso in pizzeria, al telefono o al banco.
//
// Deve entrare nel sistema come tutti gli altri: se un ordine telefonico resta
// su un foglietto, la coda del forno non lo conosce e l'attesa promessa a chi
// ordina dal sito diventa falsa. Per questo qui si compila e si salva, non si
// annota.
//
// Il prezzo lo rifa' il server dal listino: quello calcolato qui serve solo a
// dire a voce quanto viene.

import { nameCheck, phoneProblem } from '../customer-identity.js';

function rows(draft = {}, menu = []) {
  return menu
    .map(product => ({ product, quantity: Number(draft.quantities?.[product.id] ?? 0) }))
    .filter(entry => entry.quantity > 0);
}

export function counterOrderTotal(draft, menu) {
  return rows(draft, menu).reduce((total, entry) => total + entry.product.price * entry.quantity, 0);
}

export function counterOrderIssues(draft = {}, menu = []) {
  const issues = [];
  if (!rows(draft, menu).length) issues.push('Aggiungi almeno un prodotto.');
  // Anche al telefono serve un nome vero e un numero raggiungibile: e' con
  // quelli che si richiama se la pizza non viene ritirata.
  if (nameCheck(draft.name ?? '') === 'no') issues.push('Scrivi il nome di chi ha ordinato.');
  const telefono = phoneProblem(draft.phone ?? '');
  if (telefono) issues.push(telefono);
  return issues;
}

export function counterOrderPayload(draft = {}, menu = []) {
  const note = String(draft.note ?? '').trim();
  return {
    source: 'RESTAURANT',
    customer: String(draft.name ?? '').trim(),
    phone: String(draft.phone ?? '').trim(),
    paymentMethod: draft.payment ?? 'cash',
    items: rows(draft, menu).map(({ product, quantity }) => ({
      databaseId: product.databaseId ?? product.id,
      productId: product.databaseId ?? product.id,
      name: product.name,
      quantity,
      price: product.price * quantity,
      note,
      type: product.type
    }))
  };
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
}

export function counterOrderPanel(draft = {}, menu = [], money = value => `${value}`, payments = []) {
  const disponibili = menu.filter(product => product.available !== false);
  return `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-label="Ordine dalla pizzeria">
    <div class="modal-head">
      <div><span class="eyebrow">Ordine dalla pizzeria</span><h2>Al telefono o al banco</h2></div>
      <button class="btn secondary" id="counter-close">Chiudi</button>
    </div>
    <p class="editor-note">Entra nella coda del forno come gli ordini dal sito, quindi sposta l'attesa promessa a chi ordina dopo.</p>
    ${disponibili.map(product => `<div class="option-row">
      <span>${escapeHtml(product.name)} · ${money(product.price)}</span>
      <div class="stepper">
        <button class="btn secondary counter-minus" data-id="${escapeHtml(product.id)}">−</button>
        <b>${Number(draft.quantities?.[product.id] ?? 0)}</b>
        <button class="btn secondary counter-plus" data-id="${escapeHtml(product.id)}">+</button>
      </div>
    </div>`).join('')}
    <div class="field"><label>Nome di chi ordina<input id="counter-name" value="${escapeHtml(draft.name ?? '')}"></label></div>
    <div class="field"><label>Telefono<input id="counter-phone" inputmode="tel" value="${escapeHtml(draft.phone ?? '')}"></label></div>
    <div class="field"><label>Nota per la cucina<input id="counter-note" value="${escapeHtml(draft.note ?? '')}" placeholder="Allergie, cottura, orario di ritiro"></label></div>
    <div class="field"><span>Pagamento</span><div class="payment-grid">${payments.map(method => `<label class="payment-option"><input type="radio" name="counter-payment" value="${escapeHtml(method.id)}" ${(draft.payment ?? 'cash') === method.id ? 'checked' : ''}> <b>${escapeHtml(method.label)}</b></label>`).join('')}</div></div>
    <h3 class="cart-total">Totale ${money(counterOrderTotal(draft, menu))}</h3>
    <button class="btn primary" id="counter-save">Manda in cucina</button>
  </section></div>`;
}
