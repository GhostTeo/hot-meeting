import assert from 'node:assert/strict';
import test from 'node:test';

import { counterOrderIssues, counterOrderTotal, counterOrderPayload } from '../js/views/counter-order.js';

const menu = [
  { id: 'margherita', databaseId: 'p1', name: 'Margherita', type: 'pizza', price: 8, available: true },
  { id: 'diavola', databaseId: 'p2', name: 'Diavola', type: 'pizza', price: 10, available: true },
  { id: 'cola', databaseId: 'p3', name: 'Cola', type: 'drink', price: 3, available: true }
];

const bozza = {
  quantities: { margherita: 2, cola: 1 },
  name: 'Signora Rossi',
  phone: '333 123 4567',
  payment: 'cash',
  note: 'Ben cotta'
};

test('il totale segue il listino, non quello che si ricorda chi risponde', () => {
  assert.equal(counterOrderTotal(bozza, menu), 19);
});

test('la bozza diventa l ordine che il database si aspetta', () => {
  const ordine = counterOrderPayload(bozza, menu);

  assert.equal(ordine.source, 'RESTAURANT');
  assert.equal(ordine.customer, 'Signora Rossi');
  assert.equal(ordine.phone, '333 123 4567');
  assert.equal(ordine.paymentMethod, 'cash');
  assert.deepEqual(ordine.items, [
    { databaseId: 'p1', productId: 'p1', name: 'Margherita', quantity: 2, price: 16, note: 'Ben cotta', type: 'pizza' },
    { databaseId: 'p3', productId: 'p3', name: 'Cola', quantity: 1, price: 3, note: 'Ben cotta', type: 'drink' }
  ]);
});

test('un ordine senza righe o senza numero non parte', () => {
  assert.deepEqual(counterOrderIssues({ ...bozza, quantities: {} }, menu), ['Aggiungi almeno un prodotto.']);
  assert.deepEqual(counterOrderIssues({ ...bozza, phone: '123' }, menu), ['Questo numero non esiste: scrivi quello vero.']);
  assert.deepEqual(counterOrderIssues({ ...bozza, name: '  ' }, menu), ['Scrivi il nome di chi ha ordinato.']);
  assert.deepEqual(counterOrderIssues(bozza, menu), []);
});
