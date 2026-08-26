import assert from 'node:assert/strict';
import test from 'node:test';

import { arrivedOrders } from '../js/notify.js';

const ordine = (id, sequence, status = 'preparing') => ({ id, sequence, status });

test('riconosce gli ordini arrivati fra un aggiornamento e l altro', () => {
  const prima = [ordine('a', 1), ordine('b', 2)];
  const dopo = [ordine('a', 1), ordine('b', 2), ordine('c', 3)];

  assert.deepEqual(arrivedOrders(prima, dopo).map(o => o.sequence), [3]);
});

test('un ordine che cambia stato non e un ordine nuovo', () => {
  const prima = [ordine('a', 1, 'preparing')];
  const dopo = [ordine('a', 1, 'ready')];

  assert.deepEqual(arrivedOrders(prima, dopo), []);
});

test('al primo caricamento non suona niente: non sono arrivati adesso', () => {
  assert.deepEqual(arrivedOrders(null, [ordine('a', 1)]), []);
  assert.deepEqual(arrivedOrders(undefined, [ordine('a', 1)]), []);
});

test('un ordine gia consegnato appena caricato non fa suonare la campanella', () => {
  const dopo = [ordine('a', 1, 'preparing'), ordine('b', 2, 'collected')];

  assert.deepEqual(arrivedOrders([], dopo).map(o => o.sequence), [1]);
});
