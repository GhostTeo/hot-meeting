import assert from 'node:assert/strict';
import test from 'node:test';

import { ADJUSTMENT_METHODS, calculateAdjustment } from '../js/payments.js';

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

// Il comportamento della revisione (quantita', ingredienti tolti, prodotti
// aggiunti) e' coperto da order-draft.test.js: qui restano i movimenti di
// pagamento, che sono un'altra cosa e vivono in payments.js.
