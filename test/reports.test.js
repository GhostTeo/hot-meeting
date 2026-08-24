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
    shift: 'lunch',
    pizzas: 2,
    gross: 20,
    fees: 1,
    adjustments: [{ type: 'supplement', amount: 3 }]
  },
  {
    businessDate: '2026-06-30',
    shift: 'dinner',
    items: [{ quantity: 2 }, { quantity: 1 }],
    gross: 30,
    fees: 2,
    adjustments: [{ type: 'refund', amount: 4 }]
  },
  {
    businessDate: '2026-07-01',
    shift: 'lunch',
    pizzas: 5,
    gross: 50,
    fees: 5,
    adjustments: [{ type: 'supplement', amount: 6 }]
  },
  {
    businessDate: '2025-12-31',
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
