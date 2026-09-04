import assert from 'node:assert/strict';
import test from 'node:test';

import { checkoutAmount, righeStripe, esitoWebhook, stripeConfigurato } from '../supabase/functions/_shared/stripe-logic.js';

// Il conto lo tiene il server, sempre. Al momento del pagamento Stripe deve
// incassare esattamente il totale gia' calcolato per quell'ordine, non un
// numero che arriva dal telefono del cliente.

const ordine = {
  id: 'ord-1', sequence: 7, total_cents: 2150,
  items: [
    { product_name_snapshot: 'Diavola', quantity: 2, total_price_cents: 2000 },
    { product_name_snapshot: 'Coca-Cola', quantity: 1, total_price_cents: 150 }
  ]
};

test('l importo da incassare e il totale dell ordine, in centesimi', () => {
  assert.equal(checkoutAmount(ordine), 2150);
});

test('un ordine senza totale non manda mai zero a Stripe: si rifiuta', () => {
  assert.throws(() => checkoutAmount({ id: 'x', total_cents: 0 }));
  assert.throws(() => checkoutAmount({ id: 'x' }));
});

test('le righe per Stripe portano nome, quantita e prezzo in euro', () => {
  const righe = righeStripe(ordine);

  assert.equal(righe.length, 2);
  assert.equal(righe[0].price_data.product_data.name, 'Diavola');
  assert.equal(righe[0].price_data.unit_amount, 1000);
  assert.equal(righe[0].quantity, 2);
  assert.equal(righe[0].price_data.currency, 'eur');
});

test('la somma delle righe combacia con il totale: non si incassa piu ne meno', () => {
  const righe = righeStripe(ordine);
  const somma = righe.reduce((t, r) => t + r.price_data.unit_amount * r.quantity, 0);

  assert.equal(somma, ordine.total_cents);
});

test('solo il pagamento riuscito segna l ordine pagato', () => {
  assert.deepEqual(esitoWebhook({ type: 'checkout.session.completed', data: { object: { payment_status: 'paid', metadata: { order_id: 'ord-1' } } } }),
    { azione: 'segna-pagato', orderId: 'ord-1', importo: 0 });
  assert.deepEqual(esitoWebhook({ type: 'checkout.session.completed', data: { object: { payment_status: 'unpaid', metadata: { order_id: 'ord-1' } } } }),
    { azione: 'ignora' });
  assert.deepEqual(esitoWebhook({ type: 'payment_intent.created', data: { object: {} } }),
    { azione: 'ignora' });
});

test('senza chiave, Stripe e spento e l app lo sa', () => {
  assert.equal(stripeConfigurato({ STRIPE_SECRET_KEY: 'sk_test_123', STRIPE_WEBHOOK_SECRET: 'whsec_1' }), true);
  assert.equal(stripeConfigurato({ STRIPE_SECRET_KEY: '' }), false);
  assert.equal(stripeConfigurato({}), false);
});

import { righeCorrenti, totaleRighe, importoCorrisponde } from '../supabase/functions/_shared/stripe-logic.js';

test('si incassa solo l ultima revisione: un ordine corretto non si paga due volte', () => {
  const righe = [
    { revision: 1, product_name_snapshot: 'Margherita', quantity: 1, total_price_cents: 800 },
    { revision: 1, product_name_snapshot: 'Cola', quantity: 1, total_price_cents: 300 },
    { revision: 2, product_name_snapshot: 'Margherita', quantity: 2, total_price_cents: 1600 }
  ];
  assert.deepEqual(righeCorrenti(righe).map(r => r.product_name_snapshot), ['Margherita']);
  assert.equal(totaleRighe(righe), 1600);
  assert.deepEqual(righeStripe({ items: righe }).map(r => r.quantity), [2]);
});

test('righe senza revisione valgono come prima revisione', () => {
  const righe = [{ quantity: 1, total_price_cents: 800 }, { quantity: 1, total_price_cents: 300 }];
  assert.equal(totaleRighe(righe), 1100);
});

test('l importo incassato deve essere esattamente il totale', () => {
  assert.equal(importoCorrisponde(1600, 1600), true);
  assert.equal(importoCorrisponde(1100, 1600), false);
  assert.equal(importoCorrisponde(0, 0), false);
  assert.equal(esitoWebhook({ type: 'checkout.session.completed', data: { object: { payment_status: 'paid', amount_total: 1600, metadata: { order_id: 'o1' } } } }).importo, 1600);
});
