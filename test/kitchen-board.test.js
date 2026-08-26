import assert from 'node:assert/strict';
import test from 'node:test';

import { kitchenBoard } from '../js/views/kitchen.js';

const ora = Date.parse('2026-08-25T19:30:00');
const ordini = [
  { id: 'a', sequence: 3, status: 'preparing', createdAt: ora - 5 * 60000, readyAt: ora + 12 * 60000 },
  { id: 'b', sequence: 1, status: 'ready', createdAt: ora - 40 * 60000, readyAt: ora - 15 * 60000 },
  { id: 'c', sequence: 2, status: 'preparing', createdAt: ora - 30 * 60000, readyAt: ora - 3 * 60000 },
  { id: 'd', sequence: 4, status: 'collected', createdAt: ora - 60 * 60000, readyAt: ora - 50 * 60000 }
];

test('in cucina si lavora per scadenza: prima quello che esce prima', () => {
  const board = kitchenBoard(ordini, ora);

  assert.deepEqual(board.preparing.map(order => order.sequence), [2, 3]);
  assert.deepEqual(board.ready.map(order => order.sequence), [1]);
});

test('un ordine gia consegnato sparisce dal banco', () => {
  const board = kitchenBoard(ordini, ora);

  assert.equal([...board.preparing, ...board.ready].some(order => order.sequence === 4), false);
});

test('ogni comanda porta il ritardo, cosi si vede a colpo d occhio', () => {
  const board = kitchenBoard(ordini, ora);

  assert.equal(board.preparing[0].late, true);
  assert.equal(board.preparing[0].minutesLeft, -3);
  assert.equal(board.preparing[1].late, false);
  assert.equal(board.preparing[1].minutesLeft, 12);
});

test('i minuti promessi restano quelli dati al cliente', () => {
  const board = kitchenBoard(ordini, ora);

  assert.equal(board.preparing[1].promised, 17);
});
