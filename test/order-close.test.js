import assert from 'node:assert/strict';
import test from 'node:test';

import { closingSteps, workingOrders } from '../js/views/order-flow.js';

// Il pizzaiolo non tocca lo schermo: l'ordine lo chiude il cameriere dalla
// sezione Ordini, e da li' sparisce anche dalla cucina.

test('un ordine in preparazione si chiude passando per pronto', () => {
  assert.deepEqual(closingSteps({ status: 'preparing' }), ['ready', 'collected']);
});

test('un ordine gia pronto si chiude in un passo solo', () => {
  assert.deepEqual(closingSteps({ status: 'ready' }), ['collected']);
});

test('un ordine gia consegnato non si richiude', () => {
  assert.deepEqual(closingSteps({ status: 'collected' }), []);
  assert.deepEqual(closingSteps({ status: 'cancelled' }), []);
});

test('nella sezione Ordini restano solo quelli aperti, i piu urgenti davanti', () => {
  const ora = Date.parse('2026-08-26T20:00:00');
  const ordini = [
    { id: 'a', status: 'collected', readyAt: ora },
    { id: 'b', status: 'preparing', readyAt: ora + 10 * 60000 },
    { id: 'c', status: 'ready', readyAt: ora - 5 * 60000 },
    { id: 'd', status: 'preparing', readyAt: ora + 2 * 60000 }
  ];

  const aperti = workingOrders(ordini);

  assert.deepEqual(aperti.map(order => order.id), ['c', 'd', 'b']);
});
