import assert from 'node:assert/strict';
import test from 'node:test';

import { LOCALES, translate, translatePaymentMethod, translateProduct } from '../js/i18n.js';
import { buildCustomerRecap, buildPublicOrderCode } from '../js/views/order-receipt.js';

test('formatta codice giornaliero', () => {
  assert.equal(buildPublicOrderCode('2026-08-23', 1), '23-08 · #01');
  assert.equal(buildPublicOrderCode('2026-12-05', 14), '05-12 · #14');
});

test('usa italiano se manca la traduzione inglese', () => {
  assert.equal(translateProduct({ it: 'Bufala' }, 'en'), 'Bufala');
  assert.equal(translateProduct({ it: 'Bufala', en: 'Buffalo mozzarella' }, 'en'), 'Buffalo mozzarella');
  assert.equal(translateProduct({ it: 'Bufala', en: 'Buffalo mozzarella' }, 'it'), 'Bufala');
});

test('le etichette dell interfaccia esistono nelle due lingue', () => {
  assert.deepEqual(LOCALES, ['it', 'en']);
  assert.equal(translate('cart.total', 'it'), 'Totale');
  assert.equal(translate('cart.total', 'en'), 'Total');
});

test('una chiave sconosciuta resta visibile invece di sparire', () => {
  assert.equal(translate('chiave.inesistente', 'en'), 'chiave.inesistente');
});

const ordine = {
  id: 'ord-1', businessDate: '2026-08-25', sequence: 3, total: 21, payment: 'Paga in cassa',
  customer: 'Anna', phone: '3331234567', email: 'anna@example.test', readyAt: 1000, createdAt: 400,
  items: [{
    name: 'Margherita', names: { it: 'Margherita', en: 'Margherita' }, quantity: 2, note: 'Allergia alle noci',
    removed: ['Basilico'], ingredientNames: [{ it: 'Basilico', en: 'Basil' }],
    additions: [{ name: 'Olive', names: { it: 'Olive', en: 'Olives' }, quantity: 1 }],
    allergenLabels: [{ it: 'Cereali contenenti glutine', en: 'Cereals containing gluten' }]
  }]
};

test('il recap raccoglie codice, personalizzazioni, allergeni e contatti', () => {
  const recap = buildCustomerRecap(ordine, { locale: 'it', pizzeriaPhone: '02 1234567' });

  assert.equal(recap.code, '25-08 · #03');
  assert.equal(recap.total, 21);
  assert.equal(recap.payment, 'Paga in cassa');
  assert.equal(recap.pizzeriaPhone, '02 1234567');
  assert.equal(recap.email, 'anna@example.test');
  assert.deepEqual(recap.items[0].removed, ['Basilico']);
  assert.deepEqual(recap.items[0].additions, ['1× Olive']);
  assert.deepEqual(recap.items[0].allergens, ['Cereali contenenti glutine']);
  assert.equal(recap.items[0].note, 'Allergia alle noci');
});

test('in inglese il recap usa le etichette inglesi degli allergeni', () => {
  const recap = buildCustomerRecap(ordine, { locale: 'en' });

  assert.deepEqual(recap.items[0].allergens, ['Cereals containing gluten']);
  assert.deepEqual(recap.items[0].removed, ['Basil']);
  assert.deepEqual(recap.items[0].additions, ['1× Olives']);
  assert.equal(recap.pizzeriaPhone, null);
});

test('i metodi di pagamento hanno un nome anche in inglese', () => {
  assert.equal(translatePaymentMethod('cash', 'it'), 'Paga in cassa');
  assert.equal(translatePaymentMethod('cash', 'en'), 'Pay at the counter');
  assert.equal(translatePaymentMethod('apple_pay', 'en'), 'Apple Pay · demo');
});

test('un metodo sconosciuto non inventa una traduzione', () => {
  assert.equal(translatePaymentMethod('bancomat', 'en'), 'bancomat');
});

test('il recap mostra il pagamento nella lingua scelta', () => {
  const recap = buildCustomerRecap({ ...ordine, paymentMethod: 'cash' }, { locale: 'en' });

  assert.equal(recap.payment, 'Pay at the counter');
});
