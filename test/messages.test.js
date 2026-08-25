import assert from 'node:assert/strict';
import test from 'node:test';

import { customerMessage, smsLink, whatsappLink } from '../js/messages.js';

const ordine = {
  sequence: 7,
  businessDate: '2026-08-25',
  phone: '3331234567',
  customer: 'Marco',
  readyAt: Date.parse('2026-08-25T19:27:00')
};

test('il messaggio di conferma dice numero e ora, non una promessa vaga', () => {
  assert.equal(
    customerMessage('received', ordine, { pizzeriaPhone: '3467095833' }),
    'Ciao Marco, Hot Meeting: ordine 25-08 · #07 ricevuto. Pronto verso le 19:27. Ti avvisiamo appena esce dal forno. Info: 3467095833'
  );
});

test('il messaggio di pronto invita al ritiro', () => {
  assert.equal(
    customerMessage('ready', ordine, { pizzeriaPhone: '3467095833' }),
    'Ciao Marco, Hot Meeting: il tuo ordine 25-08 · #07 è pronto. Ti aspettiamo in pizzeria. Info: 3467095833'
  );
});

test('senza nome il messaggio resta corretto', () => {
  const testo = customerMessage('ready', { ...ordine, customer: '' }, {});

  assert.equal(testo, 'Hot Meeting: il tuo ordine 25-08 · #07 è pronto. Ti aspettiamo in pizzeria.');
});

test('il ritardo si dice, non si nasconde', () => {
  assert.equal(
    customerMessage('late', ordine, {}),
    'Ciao Marco, Hot Meeting: il tuo ordine 25-08 · #07 sta uscendo con qualche minuto di ritardo. Ci scusiamo, ti avvisiamo appena è pronto.'
  );
});

test('il collegamento SMS apre il messaggio gia scritto', () => {
  const link = smsLink('333 123 4567', 'Ciao');

  assert.equal(link, 'sms:+393331234567?&body=Ciao');
});

test('il collegamento WhatsApp vuole il numero internazionale senza piu', () => {
  assert.equal(whatsappLink('+39 333 123 4567', 'Ciao a te'), 'https://wa.me/393331234567?text=Ciao%20a%20te');
});

test('un numero non italiano non produce un collegamento inventato', () => {
  assert.equal(smsLink('', 'Ciao'), null);
  assert.equal(whatsappLink('12', 'Ciao'), null);
});
