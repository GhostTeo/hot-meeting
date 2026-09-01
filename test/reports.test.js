import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyReport } from '../js/reports.js';

const sampleOrders = [
  {
    businessDate: '2026-01-01',
    status: 'ready',
    shift: 'lunch',
    pizzas: 2,
    gross: 20,
    fees: 1,
    adjustments: [{ type: 'supplement', amount: 3, status: 'recorded' }]
  },
  {
    businessDate: '2026-06-30',
    status: 'collected',
    shift: 'dinner',
    items: [{ quantity: 2 }, { quantity: 1 }],
    gross: 30,
    fees: 2,
    adjustments: [{ type: 'refund', amount: 4, status: 'recorded' }]
  },
  {
    businessDate: '2026-07-01',
    status: 'ready',
    shift: 'lunch',
    pizzas: 5,
    gross: 50,
    fees: 5,
    adjustments: [{ type: 'supplement', amount: 6, status: 'recorded' }]
  },
  {
    businessDate: '2025-12-31',
    status: 'collected',
    shift: 'dinner',
    pizzas: 1,
    gross: 10,
    fees: 1,
    adjustments: []
  }
];



test('restituisce un report giornaliero filtrabile per turno', () => {
  assert.deepEqual(dailyReport(sampleOrders, '2026-01-01', 'lunch'), {
    period: { from: '2026-01-01', to: '2026-01-01' },
    orders: 1,
    pizzas: 2,
    gross: 20,
    fees: 1,
    supplements: 3,
    refunds: 0,
    net: 22
  });
});

test('esclude ordini in preparazione e annullati dai totali', () => {
  const orders = [
    { businessDate: '2026-08-24', status: 'ready', shift: 'lunch', pizzas: 1, gross: 10, fees: 1 },
    { businessDate: '2026-08-24', status: 'preparing', shift: 'lunch', pizzas: 2, gross: 20, fees: 2 },
    { businessDate: '2026-08-24', status: 'cancelled', shift: 'lunch', pizzas: 3, gross: 30, fees: 3 }
  ];

  assert.deepEqual(dailyReport(orders, '2026-08-24', 'lunch'), {
    period: { from: '2026-08-24', to: '2026-08-24' },
    orders: 1,
    pizzas: 1,
    gross: 10,
    fees: 1,
    supplements: 0,
    refunds: 0,
    net: 9
  });
});


test('un ordine checkout non conta le bibite come pizze', () => {
  const checkoutOrder = {
    businessDate: '2026-08-24',
    shift: 'dinner',
    status: 'ready',
    gross: 14,
    fees: 0,
    items: [
      { type: 'pizza', name: 'Margherita', quantity: 1 },
      { type: 'drink', name: 'Cola', quantity: 2 }
    ]
  };

  assert.equal(dailyReport([checkoutOrder], '2026-08-24').pizzas, 1);
});

test('nel report entrano solo i movimenti registrati, non quelli ancora in attesa', () => {
  const orders = [{
    businessDate: '2026-08-25', shift: 'lunch', status: 'ready', gross: 20, fees: 0,
    items: [{ quantity: 1 }],
    adjustments: [
      { type: 'supplement', amount: 5, status: 'recorded' },
      { type: 'supplement', amount: 7, status: 'pending' },
      { type: 'refund', amount: 2, status: 'recorded' },
      { type: 'refund', amount: 9, status: 'cancelled' }
    ]
  }];

  const report = dailyReport(orders, '2026-08-25');

  assert.equal(report.supplements, 5);
  assert.equal(report.refunds, 2);
  assert.equal(report.net, 23);
});

import { shiftBreakdown } from '../js/reports.js';

const breakdownOrders = [
  { sequence: 1, businessDate: '2026-01-01', status: 'collected', shift: 'lunch',
    gross: 20, fees: 0, paymentMethod: 'cash', paymentStatus: 'unpaid',
    items: [{ quantity: 2 }] },
  { sequence: 2, businessDate: '2026-01-01', status: 'ready', shift: 'lunch',
    gross: 15, fees: 0.53, paymentMethod: 'apple_pay', paymentStatus: 'paid',
    stripeSessionId: 'cs_test_1', items: [{ quantity: 1 }],
    adjustments: [{ type: 'supplement', amount: 5, status: 'recorded', method: 'apple_pay' }] },
  { sequence: 3, businessDate: '2026-01-01', status: 'preparing', shift: 'lunch',
    gross: 9, fees: 0, paymentMethod: 'cash', items: [{ quantity: 1 }] }
];

test('il dettaglio incassi elenca gli ordini chiusi, con lordo, trattenute e netto', () => {
  const detail = shiftBreakdown(breakdownOrders, '2026-01-01', 'lunch');
  // Solo gli ordini conclusi (ready/collected): l'ordine #3 e' ancora in forno.
  assert.equal(detail.rows.length, 2);
  const primo = detail.rows[0];
  assert.equal(primo.number, 1);
  assert.equal(primo.gross, 20);
  assert.equal(primo.fees, 0);
  assert.equal(primo.net, 20);
  assert.equal(primo.online, false);
  const secondo = detail.rows[1];
  assert.equal(secondo.number, 2);
  assert.equal(secondo.gross, 20); // 15 + 5 di supplemento
  assert.equal(secondo.fees, 0.53);
  assert.equal(secondo.net, 19.47);
  assert.equal(secondo.online, true);
});

test('il dettaglio incassi porta i totali di turno coerenti col report', () => {
  const detail = shiftBreakdown(breakdownOrders, '2026-01-01', 'lunch');
  assert.equal(detail.totals.orders, 2);
  assert.equal(detail.totals.gross, 40);
  assert.equal(detail.totals.fees, 0.53);
  assert.equal(detail.totals.net, 39.47);
});
