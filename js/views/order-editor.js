// La finestra con cui il Creator modifica un ordine gia' preso.
//
// Il cliente richiama e cambia idea: togliete il pomodoro, portate anche due
// birre, la seconda pizza non serve piu'. Qui si fa tutto questo. Solo il
// Creator ci arriva, e il database lo verifica di nuovo: la revisione passa da
// una funzione che rifiuta chiunque non abbia quel ruolo.
//
// I prezzi mostrati sono un'anteprima: il totale che vale lo ricalcola il
// database, riga per riga, quando la revisione viene salvata.

import { ADJUSTMENT_METHODS, calculateAdjustment } from '../payments.js';
import { draftIsValid, draftTotal } from './order-draft.js';

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
}

function movementText(movement, money) {
  if (movement.type === 'supplement') return `Da incassare in piu': ${money(movement.amount)}`;
  if (movement.type === 'refund') return `Da rimborsare: ${money(movement.amount)}`;
  return 'Nessuna differenza da incassare o rimborsare.';
}

function productFor(line, menu) {
  return menu.find(product => String(product.databaseId ?? product.id) === String(line.productId));
}

function linePanel(line, menu, money, aperta) {
  const product = productFor(line, menu);
  const ingredienti = product?.ingredients ?? [];
  const aggiunte = product?.additions ?? [];
  const riassunto = [
    line.removed.length ? `senza ${line.removed.length}` : '',
    Object.keys(line.additions).length ? `+${Object.values(line.additions).reduce((a, b) => a + b, 0)}` : '',
    line.note ? 'nota' : ''
  ].filter(Boolean).join(' · ');

  return `<div class="edit-line${line.quantity ? '' : ' off'}">
    <div class="edit-head">
      <div>
        <b>${escapeHtml(line.name)}</b>
        ${riassunto ? `<p>${escapeHtml(riassunto)}</p>` : ''}
      </div>
      <div class="stepper">
        <button class="btn secondary edit-minus" data-key="${line.key}">−</button>
        <b>${line.quantity}</b>
        <button class="btn secondary edit-plus" data-key="${line.key}">+</button>
      </div>
    </div>
    ${line.quantity ? `<button class="btn secondary edit-toggle" data-key="${line.key}">${aperta ? 'Chiudi' : 'Modifica questa pizza'}</button>` : ''}
    ${aperta && line.quantity ? `<div class="edit-body">
      ${ingredienti.length ? `<h4>Ingredienti</h4>${ingredienti.map(nome => {
        const id = product?.ingredientIds?.[nome];
        const tolto = id && line.removed.includes(id);
        return `<div class="option-row${tolto ? ' removed' : ''}">
          <span>${escapeHtml(nome)}</span>
          <button class="btn secondary edit-ing" data-key="${line.key}" data-ing="${escapeHtml(id ?? '')}" ${id ? '' : 'disabled'}>${tolto ? 'Rimetti' : 'Togli'}</button>
        </div>`;
      }).join('')}` : ''}
      ${aggiunte.length ? `<h4>Aggiunte</h4>${aggiunte.map(addition => `<div class="option-row${line.additions[addition.id] ? ' picked' : ''}">
        <span>${escapeHtml(addition.name)} · ${money(Number(addition.price ?? 0))}</span>
        <div class="stepper">
          <button class="btn secondary edit-add-minus" data-key="${line.key}" data-ing="${escapeHtml(addition.id)}" ${line.additions[addition.id] ? '' : 'disabled'}>−</button>
          <b>${line.additions[addition.id] ?? 0}</b>
          <button class="btn secondary edit-add-plus" data-key="${line.key}" data-ing="${escapeHtml(addition.id)}">+</button>
        </div>
      </div>`).join('')}` : ''}
      <div class="field"><label>Nota per la cucina<input class="edit-note" data-key="${line.key}" value="${escapeHtml(line.note)}" placeholder="Allergie, cottura"></label></div>
    </div>` : ''}
  </div>`;
}

export function orderEditorPanel(draft, menu = [], money = value => `${value}`, opened = null, adding = false) {
  const preview = draftTotal(draft, menu);
  const movement = calculateAdjustment(Number(draft.originalTotal ?? 0), preview);
  const valido = draftIsValid(draft);
  return `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-label="Modifica ordine">
    <div class="modal-head">
      <div><span class="eyebrow">Modifica ordine</span><h2>#${String(draft.sequence ?? 0).padStart(2, '0')}</h2></div>
      <button class="btn secondary" id="editor-close">Chiudi</button>
    </div>

    ${draft.lines.map(line => linePanel(line, menu, money, opened === line.key)).join('')}

    <button class="btn secondary" id="editor-add">+ Aggiungi pizza o bibita</button>
    ${adding ? `<div class="edit-catalog">${menu.filter(product => product.available !== false).map(product => `<button class="edit-pick" data-product="${escapeHtml(product.id)}">
      <b>${escapeHtml(product.name ?? '')}</b><span>${money(Number(product.price ?? 0))}</span>
    </button>`).join('')}</div>` : ''}

    <div class="editor-total">
      <p>Totale originale <b>${money(Number(draft.originalTotal ?? 0))}</b></p>
      <p>Totale dopo la modifica <b>${money(preview)}</b></p>
      <p class="editor-movement">${movementText(movement, money)}</p>
    </div>
    ${movement.type === 'supplement' ? `<div class="field"><span>Come incassa il supplemento</span><div class="payment-grid">${ADJUSTMENT_METHODS.map((method, index) => `<label class="payment-option"><input type="radio" name="adjustment-method" value="${method.id}" ${index === 0 ? 'checked' : ''}> <b>${escapeHtml(method.label)}</b></label>`).join('')}</div></div>` : ''}
    <div class="field"><label>Motivo della modifica<input id="editor-reason" placeholder="Es. il cliente ha aggiunto due birre"></label></div>
    <button class="btn primary" id="editor-save" ${valido ? '' : 'disabled'}>${valido ? 'Salva la revisione' : 'Un ordine non puo restare vuoto'}</button>
    <p class="editor-note">La versione precedente resta nello storico. Il totale definitivo lo ricalcola il server. Supplementi e rimborsi sono dimostrativi: nessun addebito reale viene eseguito.</p>
  </section></div>`;
}
