import assert from 'node:assert/strict';
import test from 'node:test';

import { ordineProtetto, captchaAttivo } from '../js/ordine-protetto.js';

test('senza orderEndpoint non c e nessuna porta blindata', () => {
  assert.equal(ordineProtetto({}), null);
  assert.equal(captchaAttivo({ orderEndpoint: 'https://x/place-order' }), false);
  assert.equal(captchaAttivo({ orderEndpoint: 'https://x/place-order', turnstileSiteKey: '1x' }), true);
});

test('con orderEndpoint l ordine passa dalla funzione con il gettone del captcha', async () => {
  const chiamate = [];
  const fetchFinto = async (url, opzioni) => {
    chiamate.push({ url, corpo: JSON.parse(opzioni.body), headers: opzioni.headers });
    return { ok: true, json: async () => ({ order_id: 'o1', sequence: 3 }) };
  };
  const invia = ordineProtetto({ orderEndpoint: 'https://x/place-order', supabaseAnonKey: 'sb_publishable_x' }, fetchFinto);
  const esito = await invia({ items: [] }, { turnstileToken: 'tok' });
  assert.deepEqual(esito, { order_id: 'o1', sequence: 3 });
  assert.equal(chiamate[0].url, 'https://x/place-order');
  assert.deepEqual(chiamate[0].corpo, { payload: { items: [] }, turnstile_token: 'tok' });
  assert.equal(chiamate[0].headers.apikey, 'sb_publishable_x');
});

test('un rifiuto della funzione diventa un errore con le parole del database', async () => {
  const fetchFinto = async () => ({ ok: false, json: async () => ({ error: 'requested time slot is full' }) });
  const invia = ordineProtetto({ orderEndpoint: 'https://x/place-order' }, fetchFinto);
  await assert.rejects(invia({}, {}), /requested time slot is full/);
});
