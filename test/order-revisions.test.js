import assert from 'node:assert/strict';
import test from 'node:test';

import { ADJUSTMENT_METHODS, calculateAdjustment } from '../js/payments.js';
import { previewTotal, revisionIsValid, revisionItems } from '../js/views/order-editor.js';

test('crea un supplemento senza alterare il pagamento originale', () => {
  assert.deepEqual(calculateAdjustment(20, 25), { type: 'supplement', amount: 5, status: 'pending' });
});

test('una riduzione diventa un rimborso dimostrativo', () => {
  assert.deepEqual(calculateAdjustment(25, 20), { type: 'refund', amount: 5, status: 'pending' });
});

test('un totale invariato non genera alcun movimento', () => {
  assert.deepEqual(calculateAdjustment(20, 20), { type: 'none', amount: 0, status: 'none' });
});

test('gli importi si arrotondano al centesimo senza errori di virgola mobile', () => {
  assert.deepEqual(calculateAdjustment(10.1, 10.3), { type: 'supplement', amount: 0.2, status: 'pending' });
});

test('un supplemento si puo pagare solo con i metodi dimostrativi approvati', () => {
  assert.deepEqual(ADJUSTMENT_METHODS.map(method => method.id), ['cash', 'apple_pay', 'google_pay']);
});

const ordineDiProva = {
  total: 21,
  items: [
    {
      id: 'a', productId: 'p-margherita', name: 'Margherita', quantity: 2, unitPrice: 9,
      note: 'ben cotta', removedIngredientIds: ['i-basilico'],
      additions: [{ id: 'i-olive', name: 'Olive', price: 1, quantity: 1 }]
    },
    { id: 'b', productId: 'p-cola', name: 'Cola', quantity: 1, unitPrice: 3, note: '', removedIngredientIds: [], additions: [] }
  ]
};

test('la revisione conserva note e personalizzazioni e toglie le righe azzerate', () => {
  assert.deepEqual(revisionItems(ordineDiProva, { a: 3, b: 0 }), [{
    product_id: 'p-margherita',
    quantity: 3,
    note: 'ben cotta',
    changes: [
      { type: 'removed', ingredient_id: 'i-basilico', quantity: 1 },
      { type: 'addition', ingredient_id: 'i-olive', quantity: 1 }
    ]
  }]);
});

test('una quantita non toccata resta quella originale', () => {
  assert.deepEqual(revisionItems(ordineDiProva, {}).map(item => item.quantity), [2, 1]);
});

test('l anteprima del totale usa i prezzi gia applicati all ordine', () => {
  assert.equal(previewTotal(ordineDiProva, { a: 3, b: 0 }), 27);
  assert.equal(previewTotal(ordineDiProva, {}), 21);
});

test('una revisione che svuota l ordine non e ammessa', () => {
  assert.equal(revisionIsValid(ordineDiProva, { a: 0, b: 0 }), false);
  assert.equal(revisionIsValid(ordineDiProva, { a: 0 }), true);
});
