import assert from 'node:assert/strict';
import test from 'node:test';

import { escPos, testoPerStampante } from '../js/print/escpos.js';

const byte = (...n) => Buffer.from(n);

test('la comanda comincia azzerando la stampante e finisce tagliando la carta', () => {
  const dati = escPos([{ kind: 'item', text: '1x MARGHERITA' }]);

  assert.ok(dati.subarray(0, 2).equals(byte(0x1b, 0x40)), 'ESC @ in testa');
  assert.ok(dati.includes(byte(0x1d, 0x56)), 'taglio in coda');
});

test('il numero dell ordine esce grande e centrato', () => {
  const dati = escPos([{ kind: 'number', text: '#07' }]).toString('latin1');

  assert.ok(dati.includes('\x1b\x61\x01'), 'centrato');
  assert.ok(dati.includes('\x1d\x21\x11'), 'doppia altezza e larghezza');
  assert.ok(dati.includes('#07'));
});

test('cio che non deve andare sulla pizza esce in negativo, si vede da lontano', () => {
  const dati = escPos([{ kind: 'remove', text: 'SENZA Basilico' }]).toString('latin1');

  assert.ok(dati.includes('\x1d\x42\x01'), 'bianco su nero acceso');
  assert.ok(dati.includes('\x1d\x42\x00'), 'e poi spento');
});

test('gli accenti diventano lettere semplici: la carta non li conosce tutti', () => {
  assert.equal(testoPerStampante('È pronta, perché è così'), 'E pronta, perche e cosi');
  assert.equal(testoPerStampante('Müller'), 'Muller');
  assert.equal(testoPerStampante('caffè'), 'caffe');
});

// I comandi viaggiano in mezzo al testo: per misurare le righe vanno tolti,
// altrimenti si conta «ESC E 1» come se fossero lettere sulla carta.
function soloTesto(dati) {
  // Prima «ESC @», che non ha parametro: se no la regola con il parametro si
  // mangia anche l'ESC del comando dopo e lascia in giro una lettera.
  return dati
    .replace(/\x1b@/g, '')
    .replace(/\x1dVB./g, '')
    .replace(/\x1b[Ea]./g, '')
    .replace(/\x1d[!B]./g, '');
}

test('il testo lungo va a capo sulla larghezza della carta', () => {
  const dati = escPos([{ kind: 'note', text: 'Nota molto lunga che non entra su una riga sola davvero' }], 20)
    .toString('latin1');

  for (const riga of soloTesto(dati).split('\n')) {
    assert.ok(riga.length <= 20, `troppo lunga: ${JSON.stringify(riga)}`);
  }
});

test('i piatti non si incollano fra loro: una riga vuota li separa', () => {
  const dati = escPos([
    { kind: 'item', text: '2x MARGHERITA' },
    { kind: 'item', text: '1x DIAVOLA' },
    { kind: 'section', text: 'AL BANCO' },
    { kind: 'item', text: '2x COCA-COLA' }
  ]).toString('latin1');

  const righe = soloTesto(dati).split('\n');
  assert.equal(righe[righe.indexOf('1x DIAVOLA') - 1], '');
  assert.equal(righe[righe.indexOf('AL BANCO') - 1], '');
});
