import assert from 'node:assert/strict';
import test from 'node:test';

import { promisedMinutes, waitMessage, smsLink, whatsappLink } from '../js/messages.js';

const ordine = {
  sequence: 7,
  businessDate: '2026-08-25',
  phone: '3331234567',
  customer: 'Marco',
  createdAt: Date.parse('2026-08-25T19:12:00'),
  readyAt: Date.parse('2026-08-25T19:29:00')
};

test('i minuti promessi sono quelli dell ordine, non una stima rifatta', () => {
  assert.equal(promisedMinutes(ordine), 17);
  assert.equal(promisedMinutes({}), null);
});

test('il messaggio dice il tempo di attesa e basta', () => {
  assert.equal(waitMessage(ordine), 'Hot Meeting: ordine #07, pronto tra circa 17 minuti.');
});

test('lo stesso numero di minuti che vede la cucina finisce nel messaggio', () => {
  const minuti = promisedMinutes(ordine);

  assert.ok(waitMessage(ordine).includes(`${minuti} minuti`));
});

test('senza orario promesso non si inventa un tempo', () => {
  assert.equal(waitMessage({ sequence: 3 }), 'Hot Meeting: ordine #03, ti avvisiamo appena e pronto.');
});

test('il collegamento SMS apre il messaggio gia scritto', () => {
  assert.equal(smsLink('333 123 4567', 'Ciao'), 'sms:+393331234567?&body=Ciao');
});

test('il collegamento WhatsApp vuole il numero internazionale senza piu', () => {
  assert.equal(whatsappLink('+39 333 123 4567', 'Ciao a te'), 'https://wa.me/393331234567?text=Ciao%20a%20te');
});

test('un numero non valido non produce un collegamento inventato', () => {
  assert.equal(smsLink('', 'Ciao'), null);
  assert.equal(whatsappLink('12', 'Ciao'), null);
});
