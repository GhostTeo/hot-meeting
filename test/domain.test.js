import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePhone,
  formatTimer,
  calculateCustomizedPrice,
  DEMO_PAYMENT_METHODS,
  mergeMenuDefaults,
  customizationLines,
  paymentLabel
} from '../js/domain.js';

test('normalizza il numero in cifre e prefisso', () => {
  assert.equal(normalizePhone('+39 333-123 4567'), '+393331234567');
});

test('il timer passa dal countdown al ritardo', () => {
  assert.deepEqual(formatTimer(90), { text: '-01:30', late: false });
  assert.deepEqual(formatTimer(-90), { text: '+01:30', late: true });
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

test('traduce il metodo di pagamento in etichetta leggibile per la comanda', () => {
  assert.equal(paymentLabel('cash'), 'Paga in cassa');
  assert.equal(paymentLabel('apple_pay'), 'Apple Pay · demo');
});

test('un metodo di pagamento sconosciuto resta visibile senza inventare etichette', () => {
  assert.equal(paymentLabel('bancomat'), 'bancomat');
  assert.equal(paymentLabel(null), 'Pagamento non indicato');
});
