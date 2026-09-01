import assert from 'node:assert/strict';
import test from 'node:test';

import { countdownText, waitingProgress, waitingStage, shouldForgetReceipt } from '../js/views/waiting-room.js';

// Chi aspetta vuole sapere due cose: a che punto e', e quando uscire di casa.

test('appena ordinato la pizza e in coda, non ancora in forno', () => {
  const stage = waitingStage({ status: 'preparing', minutesLeft: 9, promisedMinutes: 9 });

  assert.equal(stage.key, 'queued');
  assert.equal(stage.progress, 0);
});

test('a meta strada e in lavorazione', () => {
  const stage = waitingStage({ status: 'preparing', minutesLeft: 5, promisedMinutes: 10 });

  assert.equal(stage.key, 'working');
  assert.equal(stage.progress, 50);
});

test('negli ultimi minuti si dice di muoversi', () => {
  assert.equal(waitingStage({ status: 'preparing', minutesLeft: 2, promisedMinutes: 10 }).key, 'almost');
});

test('quando e pronta lo dice forte, e la barra e piena', () => {
  const stage = waitingStage({ status: 'ready', minutesLeft: 0, promisedMinutes: 10 });

  assert.equal(stage.key, 'ready');
  assert.equal(stage.progress, 100);
});

test('consegnato chiude la storia', () => {
  assert.equal(waitingStage({ status: 'collected' }).key, 'collected');
});

test('se il tempo e scaduto ma non e ancora pronta non si mente: sta uscendo', () => {
  const stage = waitingStage({ status: 'preparing', minutesLeft: 0, promisedMinutes: 10 });

  assert.equal(stage.key, 'almost');
  assert.equal(stage.progress, 97);
});

test('il conto alla rovescia scorre al secondo, non a scatti di minuto', () => {
  assert.equal(countdownText(9 * 60000), '9:00');
  assert.equal(countdownText(8 * 60000 + 32000), '8:32');
  assert.equal(countdownText(45000), '0:45');
  assert.equal(countdownText(0), '0:00');
  assert.equal(countdownText(-5000), '0:00');
});

test('la barra si riempie sui secondi, cosi si muove sotto gli occhi', () => {
  const promessi = 10 * 60000;

  assert.equal(waitingProgress(promessi, promessi), 0);
  assert.equal(waitingProgress(promessi / 2, promessi), 50);
  assert.equal(waitingProgress(0, promessi), 97);
});

test('un ordine consegnato viene dimenticato alla riapertura, cosi il cliente torna al menu', () => {
  // Terminato = consegnato: alla riapertura dell'app il cliente deve trovarsi al
  // menu, non fermo sull'attesa dell'ordine di prima.
  assert.equal(shouldForgetReceipt({ receipt: { id: 'a', readyAt: 1000 }, receiptDone: true, now: 2000 }), true);
});

test('un ordine ancora in corso resta in attesa alla riapertura', () => {
  const now = 1_000_000;
  assert.equal(shouldForgetReceipt({ receipt: { id: 'a', readyAt: now + 60_000 }, receiptDone: false, now }), false);
});

test('un ordine vecchio di ore viene dimenticato anche senza conferma di consegna', () => {
  const now = Date.parse('2026-09-01T21:00:00Z');
  const treOreFa = now - 3 * 60 * 60 * 1000;
  assert.equal(shouldForgetReceipt({ receipt: { id: 'a', readyAt: treOreFa }, receiptDone: false, now }), true);
});

test('senza ricevuta non c e nulla da dimenticare', () => {
  assert.equal(shouldForgetReceipt({ receipt: null, receiptDone: false, now: 1 }), false);
});
