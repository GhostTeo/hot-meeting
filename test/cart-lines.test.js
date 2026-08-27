import assert from 'node:assert/strict';
import test from 'node:test';

import { groupCartLines, groupOrderItems, plainCartCount } from '../js/cart-lines.js';

const cola = { id: 'cola', name: 'Cola', price: 3, removed: [], additions: [], note: '' };
const margherita = { id: 'margherita', name: 'Margherita', price: 8, removed: [], additions: [], note: '' };
const modificata = { id: 'margherita', name: 'Margherita', price: 9, removed: ['Basilico'], additions: [], note: '' };

test('quattro cole sono una riga per quattro, non quattro righe uguali', () => {
  const righe = groupCartLines([cola, margherita, cola, cola, cola]);

  assert.deepEqual(righe.map(r => [r.item.name, r.quantity]), [['Cola', 4], ['Margherita', 1]]);
  assert.equal(righe[0].total, 12);
});

test('una pizza modificata resta una riga a se: non e la stessa cosa', () => {
  const righe = groupCartLines([margherita, modificata]);

  assert.equal(righe.length, 2);
  assert.deepEqual(righe.map(r => r.quantity), [1, 1]);
});

test('ogni riga sa quali posti del carrello occupa, per poterla togliere', () => {
  const righe = groupCartLines([cola, margherita, cola]);

  assert.deepEqual(righe[0].indexes, [0, 2]);
  assert.deepEqual(righe[1].indexes, [1]);
});

test('si conta quante volte un prodotto e nel carrello senza modifiche', () => {
  assert.equal(plainCartCount([cola, cola, modificata], 'cola'), 2);
  assert.equal(plainCartCount([modificata], 'margherita'), 0);
  assert.equal(plainCartCount([], 'cola'), 0);
});

test('sulle comande due righe uguali diventano una riga per due', () => {
  const righe = groupOrderItems([
    { id: 'a', name: 'Acqua', quantity: 1, price: 2, removed: [], additions: [], note: '' },
    { id: 'b', name: 'Acqua', quantity: 1, price: 2, removed: [], additions: [], note: '' },
    { id: 'c', name: 'Margherita', quantity: 2, price: 16, removed: ['Basilico'], additions: [], note: '' },
    { id: 'd', name: 'Margherita', quantity: 1, price: 8, removed: [], additions: [], note: '' }
  ]);

  assert.deepEqual(righe.map(r => [r.name, r.quantity]), [['Acqua', 2], ['Margherita', 2], ['Margherita', 1]]);
  assert.deepEqual(righe[1].removed, ['Basilico']);
});
