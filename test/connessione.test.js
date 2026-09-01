import assert from 'node:assert/strict';
import test from 'node:test';

import { attesaPrimaDiRiprovare, statoConnessione, vaRiconnesso } from '../js/connessione.js';

test('un canale caduto va riaperto, uno sano no', () => {
  assert.equal(vaRiconnesso('CHANNEL_ERROR'), true);
  assert.equal(vaRiconnesso('TIMED_OUT'), true);
  assert.equal(vaRiconnesso('CLOSED'), true);
  assert.equal(vaRiconnesso('SUBSCRIBED'), false);
});

test('si riprova sempre piu di rado, ma non oltre il mezzo minuto', () => {
  assert.equal(attesaPrimaDiRiprovare(0), 1000);
  assert.equal(attesaPrimaDiRiprovare(1), 2000);
  assert.equal(attesaPrimaDiRiprovare(2), 4000);
  assert.equal(attesaPrimaDiRiprovare(9), 30000);
});

test('lo stato si legge in parole, non in codici', () => {
  const ora = Date.parse('2026-09-01T20:00:00');
  const fa = secondi => ora - secondi * 1000;

  assert.equal(statoConnessione({ online: true, ultimoContatto: fa(5), now: ora }).chiave, 'ok');
  assert.equal(statoConnessione({ online: false, ultimoContatto: fa(5), now: ora }).chiave, 'senzaRete');
  // Se il server non risponde da un paio di minuti qualcosa non va, anche se il
  // telefono dice di essere collegato.
  assert.equal(statoConnessione({ online: true, ultimoContatto: fa(200), now: ora }).chiave, 'nonRisponde');
  assert.equal(statoConnessione({ online: true, ultimoContatto: null, now: ora }).chiave, 'nonRisponde');
});

test('ogni stato ha una frase che si capisce e dice cosa fare', () => {
  for (const chiave of ['ok', 'senzaRete', 'nonRisponde']) {
    const stato = statoConnessione({
      online: chiave !== 'senzaRete',
      ultimoContatto: chiave === 'nonRisponde' ? 0 : Date.now(),
      now: Date.now()
    });
    assert.equal(stato.chiave, chiave);
    assert.ok(stato.testo.length > 5, chiave);
  }
});
