import assert from 'node:assert/strict';
import test from 'node:test';

import { orderSuggestions } from '../js/suggestions.js';

const menu = [
  { id: 'margherita', type: 'pizza', name: 'Margherita', price: 8, available: true },
  { id: 'diavola', type: 'pizza', name: 'Diavola', price: 10, available: true },
  { id: 'bufala', type: 'pizza', name: 'Bufala', price: 11, available: false },
  { id: 'acqua', type: 'drink', name: 'Acqua', price: 2, available: true },
  { id: 'cola', type: 'drink', name: 'Cola', price: 3, available: true },
  { id: 'birra', type: 'drink', name: 'Birra', price: 5, available: true }
];

test('chi ordina una pizza e nessuna bibita si sente proporre da bere', () => {
  const proposte = orderSuggestions([{ id: 'margherita' }], menu);

  assert.deepEqual(proposte.map(p => p.id), ['acqua', 'cola', 'birra']);
});

test('chi ha gia una bibita si sente proporre altro, non la stessa', () => {
  const proposte = orderSuggestions([{ id: 'margherita' }, { id: 'acqua' }], menu);

  assert.equal(proposte.some(p => p.id === 'acqua'), false);
  assert.equal(proposte.some(p => p.id === 'cola'), true);
});

test('non si propone mai qualcosa che non c e', () => {
  const proposte = orderSuggestions([{ id: 'margherita' }, { id: 'acqua' }, { id: 'cola' }, { id: 'birra' }], menu);

  assert.deepEqual(proposte.map(p => p.id), ['diavola']);
  assert.equal(proposte.some(p => p.id === 'bufala'), false);
});

test('con il carrello vuoto non si propone niente: si sta ancora scegliendo', () => {
  assert.deepEqual(orderSuggestions([], menu), []);
});
