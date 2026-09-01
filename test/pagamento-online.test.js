import assert from 'node:assert/strict';
import test from 'node:test';

import { pagaOnline, urlCheckout } from '../js/pagamento-online.js';

const config = { stripeEndpoint: 'https://xyz.functions.supabase.co/create-checkout', supabaseAnonKey: 'sb_publishable_x' };

test('senza endpoint configurato il pagamento online e spento', () => {
  assert.equal(pagaOnline({ paymentId: 'apple_pay' }, {}), false);
  assert.equal(pagaOnline({ paymentId: 'apple_pay' }, { stripeEndpoint: '' }), false);
});

test('si paga online solo con carta o wallet, mai in contanti', () => {
  assert.equal(pagaOnline({ paymentId: 'cash' }, config), false);
  assert.equal(pagaOnline({ paymentId: 'apple_pay' }, config), true);
  assert.equal(pagaOnline({ paymentId: 'google_pay' }, config), true);
});

test('l indirizzo del pagamento si costruisce dall ordine e dal suo gettone', async () => {
  const chiamate = [];
  const fetchFinto = async (url, opzioni) => {
    chiamate.push({ url, body: JSON.parse(opzioni.body), headers: opzioni.headers });
    return { ok: true, json: async () => ({ url: 'https://checkout.stripe.com/pay/cs_test_1' }) };
  };

  const url = await urlCheckout({ id: 'ord-1', requestToken: 'tok-1' }, config, fetchFinto);

  assert.equal(url, 'https://checkout.stripe.com/pay/cs_test_1');
  assert.equal(chiamate[0].url, config.stripeEndpoint);
  assert.deepEqual(chiamate[0].body, { order_id: 'ord-1', request_token: 'tok-1' });
  assert.match(chiamate[0].headers.Authorization, /^Bearer sb_publishable_/);
});

test('se il server non apre il pagamento, si dice invece di far finta', async () => {
  const fetchFinto = async () => ({ ok: false, json: async () => ({ error: 'Pagamento online non ancora attivo.' }) });

  await assert.rejects(urlCheckout({ id: 'ord-1', requestToken: 'tok-1' }, config, fetchFinto),
    /non ancora attivo/);
});
