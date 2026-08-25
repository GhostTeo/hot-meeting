import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_OVEN, ovenThroughput, readyInMinutes } from '../js/oven.js';

// Il forno di Hot Meeting: 6 pizze insieme, 4 minuti dalla stesura alla
// consegna. Le pizze escono a infornate, non a una a una: e' questo che decide
// l'attesa, non una media all'ora.

test('il forno predefinito e sei pizze ogni quattro minuti', () => {
  assert.deepEqual(DEFAULT_OVEN, { slots: 6, bakeMinutes: 4, bufferMinutes: 5 });
  assert.equal(ovenThroughput(DEFAULT_OVEN), 90);
});

test('una pizza sola aspetta una infornata piu il margine', () => {
  assert.equal(readyInMinutes({ ahead: 0, pizzas: 1 }), 9);
});

test('sei pizze entrano nella stessa infornata e non allungano l attesa', () => {
  assert.equal(readyInMinutes({ ahead: 0, pizzas: 6 }), 9);
  assert.equal(readyInMinutes({ ahead: 0, pizzas: 7 }), 13);
});

test('la coda davanti sposta l ordine nelle infornate successive', () => {
  // 20 pizze davanti + 2 mie = 22esima pizza, quarta infornata: 16 + 5.
  assert.equal(readyInMinutes({ ahead: 20, pizzas: 2 }), 21);
});

test('un ora di coda diventa un ora di attesa, senza addolcirla', () => {
  assert.equal(readyInMinutes({ ahead: 90, pizzas: 1 }), 69);
});

test('un forno diverso cambia il conto', () => {
  assert.equal(readyInMinutes({ ahead: 0, pizzas: 1, slots: 4, bakeMinutes: 6, bufferMinutes: 0 }), 6);
  assert.equal(ovenThroughput({ slots: 4, bakeMinutes: 6 }), 40);
});

test('un ordine senza pizze aspetta solo il ritiro', () => {
  assert.equal(readyInMinutes({ ahead: 0, pizzas: 0 }), 5);
});
