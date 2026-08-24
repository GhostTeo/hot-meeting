import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePhone,
  isValidItalianPhone,
  estimateMinutes,
  formatTimer,
  summarizeOrders,
  calculateCustomizedPrice,
  DEMO_PAYMENT_METHODS,
  mergeMenuDefaults,
  customizationLines
} from '../js/domain.js';

test('normalizza e convalida un cellulare italiano', () => {
  assert.equal(normalizePhone('+39 333-123 4567'), '+393331234567');
  assert.equal(isValidItalianPhone('+39 333-123 4567'), true);
  assert.equal(isValidItalianPhone('pizza123'), false);
});

test('stima la coda con capacità di 90 pizze ora e buffer', () => {
  assert.equal(estimateMinutes(0, 90), 10);
  assert.equal(estimateMinutes(15, 90), 20);
});

test('il timer passa dal countdown al ritardo', () => {
  assert.deepEqual(formatTimer(90), { text: '-01:30', late: false });
  assert.deepEqual(formatTimer(-90), { text: '+01:30', late: true });
});

test('riepiloga soltanto gli ordini completati del turno richiesto', () => {
  const orders = [
    { status: 'ready', shift: 'lunch', total: 20, fee: 1, items: [{ quantity: 2 }] },
    { status: 'preparing', shift: 'lunch', total: 30, fee: 2, items: [{ quantity: 3 }] },
    { status: 'ready', shift: 'dinner', total: 40, fee: 2, items: [{ quantity: 4 }] }
  ];
  assert.deepEqual(summarizeOrders(orders, 'lunch'), {
    orders: 1, pizzas: 2, gross: 20, fees: 1, net: 19
  });
});

test('calcola il prezzo della pizza con aggiunte multiple', () => {
  assert.equal(calculateCustomizedPrice(8, [
    { price: 1.5, quantity: 2 },
    { price: 2, quantity: 1 }
  ]), 13);
});

test('espone i tre metodi di pagamento dimostrativi approvati', () => {
  assert.deepEqual(DEMO_PAYMENT_METHODS.map(method => method.id), [
    'cash', 'apple_pay', 'google_pay'
  ]);
});

test('integra i nuovi campi senza perdere le modifiche salvate al menu', () => {
  const merged = mergeMenuDefaults(
    [{ id: 'margherita', name: 'Margherita speciale', price: 9 }],
    [{ id: 'margherita', name: 'Margherita', price: 8, allergens: ['Glutine'], additions: [{ name: 'Olive', price: 1 }] }]
  );
  assert.equal(merged[0].name, 'Margherita speciale');
  assert.deepEqual(merged[0].allergens, ['Glutine']);
  assert.deepEqual(merged[0].additions, [{ name: 'Olive', price: 1 }]);
});

test('prepara le modifiche operative per la comanda cucina', () => {
  assert.deepEqual(customizationLines({
    removed: ['Basilico'],
    additions: [{ name: 'Olive', quantity: 1 }, { name: 'Bufala', quantity: 0 }]
  }), ['SENZA: Basilico', 'AGGIUNTE: 1× Olive']);
});
