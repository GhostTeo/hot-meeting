import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dailyReport,
  monthlyReport,
  semesterReport,
  annualReport
} from '../js/reports.js';

const sampleOrders = [
  {
    businessDate: '2026-01-01',
    status: 'ready',
    shift: 'lunch',
    pizzas: 2,
    gross: 20,
    fees: 1,
    adjustments: [{ type: 'supplement', amount: 3 }]
  },
  {
    businessDate: '2026-06-30',
    status: 'collected',
    shift: 'dinner',
    items: [{ quantity: 2 }, { quantity: 1 }],
    gross: 30,
    fees: 2,
    adjustments: [{ type: 'refund', amount: 4 }]
  },
  {
    businessDate: '2026-07-01',
    status: 'ready',
    shift: 'lunch',
    pizzas: 5,
    gross: 50,
    fees: 5,
    adjustments: [{ type: 'supplement', amount: 6 }]
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

test('calcola il primo semestre fisso e il netto dei movimenti', () => {
  const report = semesterReport(sampleOrders, 2026, 1);

  assert.deepEqual(report, {
    period: { from: '2026-01-01', to: '2026-06-30' },
    orders: 2,
    pizzas: 5,
    gross: 50,
    fees: 3,
    supplements: 3,
    refunds: 4,
    net: 46
  });
});

test('calcola il secondo semestre fisso senza includere il primo', () => {
  assert.deepEqual(semesterReport(sampleOrders, 2026, 2), {
    period: { from: '2026-07-01', to: '2026-12-31' },
    orders: 1,
    pizzas: 5,
    gross: 50,
    fees: 5,
    supplements: 6,
    refunds: 0,
    net: 51
  });
});

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

test('calcola mese e anno solari con i soli ordini del periodo', () => {
  assert.deepEqual(monthlyReport(sampleOrders, 2026, 1).period, {
    from: '2026-01-01', to: '2026-01-31'
  });
  assert.equal(monthlyReport(sampleOrders, 2026, 1).net, 22);

  assert.deepEqual(annualReport(sampleOrders, 2026).period, {
    from: '2026-01-01', to: '2026-12-31'
  });
  assert.equal(annualReport(sampleOrders, 2026).net, 97);
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
