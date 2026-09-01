import assert from 'node:assert/strict';
import test from 'node:test';

import { cashReport, cashReportLines } from '../js/views/cash-report.js';

const ordini = [
  { businessDate: '2026-08-27', shift: 'dinner', status: 'collected', gross: 20, fees: 0, paymentMethod: 'cash', items: [{ quantity: 2 }] },
  { businessDate: '2026-08-27', shift: 'dinner', status: 'collected', gross: 10, fees: 0.2, paymentMethod: 'apple_pay', items: [{ quantity: 1 }] },
  { businessDate: '2026-08-27', shift: 'dinner', status: 'ready', gross: 8, fees: 0, paymentMethod: 'cash', items: [{ quantity: 1 }],
    adjustments: [{ type: 'supplement', amount: 2, status: 'recorded', method: 'cash' }] },
  { businessDate: '2026-08-27', shift: 'lunch', status: 'collected', gross: 30, fees: 0, paymentMethod: 'cash', items: [{ quantity: 3 }] },
  { businessDate: '2026-08-27', shift: 'dinner', status: 'preparing', gross: 99, fees: 0, paymentMethod: 'cash', items: [{ quantity: 9 }] }
];

test('in cassa contano solo gli ordini chiusi, non quelli ancora in forno', () => {
  const report = cashReport(ordini, '2026-08-27', 'dinner');

  assert.equal(report.orders, 3);
  assert.equal(report.pizzas, 4);
});

test('i contanti si contano a parte dall elettronico: sono due cassetti diversi', () => {
  const report = cashReport(ordini, '2026-08-27', 'dinner');

  // 20 + 8 in contanti, piu' 2 di supplemento incassato in contanti
  assert.equal(report.byMethod.cash, 30);
  assert.equal(report.byMethod.apple_pay, 10);
  assert.equal(report.byMethod.google_pay, 0);
});

test('il totale del turno tiene conto di trattenute e movimenti', () => {
  const report = cashReport(ordini, '2026-08-27', 'dinner');

  assert.equal(report.gross, 38);
  assert.equal(report.supplements, 2);
  assert.equal(report.fees, 0.2);
  assert.equal(report.net, 39.8);
});

test('senza turno si contano tutte le giornate insieme', () => {
  assert.equal(cashReport(ordini, '2026-08-27').orders, 4);
});

test('il foglio da appendere in cassa dice giornata, turno e ogni voce', () => {
  const righe = cashReportLines(cashReport(ordini, '2026-08-27', 'dinner'), { date: '2026-08-27', shift: 'dinner' });
  const testo = righe.map(riga => riga.text).join('\n');

  assert.ok(testo.includes('27-08'));
  assert.ok(testo.includes('Serale'));
  assert.ok(testo.includes('Contanti'));
  assert.ok(testo.includes('Ordini'));
});

test('con gli ordini il foglio elenca ogni ordine e separa cassetto ed elettronico', () => {
  const righe = cashReportLines(cashReport(ordini, '2026-08-27', 'dinner'), { date: '2026-08-27', shift: 'dinner', orders: ordini });
  const testo = righe.map(riga => riga.text).join('\n');

  // Sezione dettaglio: ogni ordine chiuso compare con il suo numero/metodo.
  assert.ok(testo.includes('Dettaglio ordini'));
  // Il cassetto (contanti) e l'elettronico sono chiamati per nome nel riepilogo.
  assert.ok(testo.includes('Nel cassetto'));
  assert.ok(testo.includes('Elettronico'));
});

test('senza ordini il foglio resta quello sintetico di prima', () => {
  const righe = cashReportLines(cashReport(ordini, '2026-08-27', 'dinner'), { date: '2026-08-27', shift: 'dinner' });
  const testo = righe.map(riga => riga.text).join('\n');
  assert.ok(!testo.includes('Dettaglio ordini'));
});
