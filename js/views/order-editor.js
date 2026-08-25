// Editor di revisione di un ordine gia' ricevuto.
// Il Creator puo' cambiare le quantita' o togliere una riga; personalizzazioni
// e note restano quelle concordate col cliente. I prezzi non vengono mai
// calcolati qui: il totale definitivo lo ricalcola il database durante la
// revisione. previewTotal serve solo a mostrare in anticipo l'effetto.

import { ADJUSTMENT_METHODS, calculateAdjustment } from '../payments.js';

function quantityFor(item, quantities) {
  const requested = quantities?.[item.id];
  return requested === undefined ? Number(item.quantity ?? 1) : Math.max(0, Number(requested));
}

function itemChanges(item) {
  return [
    ...(item.removedIngredientIds ?? []).filter(Boolean).map(id => ({
      type: 'removed', ingredient_id: id, quantity: 1
    })),
    ...(item.additions ?? []).filter(addition => addition.quantity > 0 && addition.id).map(addition => ({
      type: 'addition', ingredient_id: addition.id, quantity: Number(addition.quantity)
    }))
  ];
}

export function revisionItems(order, quantities = {}) {
  return (order.items ?? [])
    .map(item => ({ item, quantity: quantityFor(item, quantities) }))
    .filter(entry => entry.quantity > 0)
    .map(({ item, quantity }) => ({
      product_id: item.productId,
      quantity,
      note: item.note ?? '',
      changes: itemChanges(item)
    }));
}

export function previewTotal(order, quantities = {}) {
  const cents = (order.items ?? []).reduce(
    (sum, item) => sum + Math.round(Number(item.unitPrice ?? 0) * 100) * quantityFor(item, quantities),
    0
  );
  return cents / 100;
}

export function revisionIsValid(order, quantities = {}) {
  return revisionItems(order, quantities).length > 0;
}


function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
}

export function orderEditorPanel(order, quantities = {}, money = value => `${value}`) {
  const preview = previewTotal(order, quantities);
  const movement = calculateAdjustment(Number(order.total ?? 0), preview);
  return `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-label="Modifica ordine">
    <div class="modal-head">
      <div><span class="eyebrow">Modifica ordine</span><h2>#${String(order.sequence ?? 0).padStart(2, '0')} · ${escapeHtml(order.customer ?? 'Cliente')}</h2></div>
      <button class="btn secondary" id="editor-close">Chiudi</button>
    </div>
    ${(order.items ?? []).map(item => editorRow(item, quantityFor(item, quantities), money)).join('')}
    <div class="editor-total">
      <p>Totale originale <b>${money(Number(order.total ?? 0))}</b></p>
      <p>Totale dopo la modifica <b>${money(preview)}</b></p>
      <p class="editor-movement">${movementText(movement, money)}</p>
    </div>
    ${movement.type === 'supplement' ? `<div class="field"><span>Come incassa il supplemento</span><div class="payment-grid">${ADJUSTMENT_METHODS.map((method, index) => `<label class="payment-option"><input type="radio" name="adjustment-method" value="${method.id}" ${index === 0 ? 'checked' : ''}> <b>${escapeHtml(method.label)}</b></label>`).join('')}</div></div>` : ''}
    <div class="field"><label>Motivo della modifica<input id="editor-reason" placeholder="Es. aggiunta una pizza"></label></div>
    <button class="btn primary" id="editor-save" ${revisionIsValid(order, quantities) ? '' : 'disabled'}>${revisionIsValid(order, quantities) ? 'Salva la revisione' : 'Un ordine non puo restare vuoto'}</button>
    <p class="editor-note">La versione precedente resta nello storico. Supplementi e rimborsi sono dimostrativi: nessun addebito reale viene eseguito.</p>
  </section></div>`;
}

function movementText(movement, money) {
  if (movement.type === 'supplement') return `Da incassare in piu': ${money(movement.amount)}`;
  if (movement.type === 'refund') return `Da rimborsare: ${money(movement.amount)}`;
  return 'Nessuna differenza da incassare o rimborsare.';
}

function editorRow(item, quantity, money) {
  const details = [
    (item.removed ?? []).length ? `senza ${item.removed.join(', ')}` : '',
    (item.additions ?? []).filter(addition => addition.quantity > 0).map(addition => `${addition.quantity}× ${addition.name}`).join(', ')
  ].filter(Boolean).join(' · ');
  return `<div class="option-row">
    <span><b>${escapeHtml(item.name ?? '')}</b>${details ? `<br><small>${escapeHtml(details)}</small>` : ''}${item.note ? `<br><small>${escapeHtml(item.note)}</small>` : ''}<br><small>${money(Number(item.unitPrice ?? 0))} cad.</small></span>
    <div class="stepper">
      <button class="btn secondary editor-minus" data-id="${escapeHtml(item.id)}">−</button>
      <b>${quantity}</b>
      <button class="btn secondary editor-plus" data-id="${escapeHtml(item.id)}">+</button>
    </div>
  </div>`;
}
