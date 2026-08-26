import assert from 'node:assert/strict';
import test from 'node:test';

import { ticketsToPrint, printMarkup } from '../js/print/print-queue.js';

const ordine = (id, sequence) => ({ id, sequence, status: 'preparing', items: [{ quantity: 1, name: 'Margherita' }] });

test('si stampa solo quello che non e gia uscito dalla stampante', () => {
  const stampati = new Set(['a']);

  assert.deepEqual(ticketsToPrint([ordine('a', 1), ordine('b', 2)], stampati).map(o => o.id), ['b']);
});

test('quello che esce viene segnato, cosi non esce due volte', () => {
  const stampati = new Set();
  ticketsToPrint([ordine('a', 1)], stampati);

  assert.equal(stampati.has('a'), true);
  assert.deepEqual(ticketsToPrint([ordine('a', 1)], stampati), []);
});

test('due comande insieme escono in un foglio ciascuna', () => {
  const html = printMarkup([ordine('a', 1), ordine('b', 2)]);

  assert.equal((html.match(/class="ticket-page"/g) ?? []).length, 2);
  assert.ok(html.includes('#01'));
  assert.ok(html.includes('#02'));
});
