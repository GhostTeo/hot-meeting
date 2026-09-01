import assert from 'node:assert/strict';
import test from 'node:test';

import { indirizziDellaRete, riconosciStampante } from '../scripts/rete.js';

test('dalla rete del locale escono tutti gli indirizzi da provare', () => {
  const lista = indirizziDellaRete('192.168.1.42', '255.255.255.0');

  assert.equal(lista.length, 254);
  assert.equal(lista[0], '192.168.1.1');
  assert.equal(lista.at(-1), '192.168.1.254');
  assert.equal(lista.includes('192.168.1.42'), true);
});

test('una rete piu piccola produce meno indirizzi', () => {
  assert.equal(indirizziDellaRete('10.0.0.5', '255.255.255.192').length, 62);
});

test('riconosce una stampante da comande e una fiscale', () => {
  assert.equal(riconosciStampante({ porte: [9100], fpmate: false }).tipo, 'comande');
  assert.equal(riconosciStampante({ porte: [80, 9100], fpmate: true }).tipo, 'fiscale');
  assert.equal(riconosciStampante({ porte: [80], fpmate: false }).tipo, 'sconosciuto');
});

test('dice cosa fare con quello che ha trovato', () => {
  assert.match(riconosciStampante({ porte: [9100], fpmate: false }).nota, /comand/i);
  assert.match(riconosciStampante({ porte: [9100], fpmate: true }).nota, /fiscal/i);
});
