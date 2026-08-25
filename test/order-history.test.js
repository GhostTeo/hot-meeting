import assert from 'node:assert/strict';
import test from 'node:test';

import { filterOrders, historyDates } from '../js/views/order-history.js';

const ordini = [
  { id: '1', sequence: 1, businessDate: '2026-08-24', shift: 'lunch', source: 'WEB', status: 'ready',
    customer: 'Anna', phone: '3331234567', payment: 'Paga in cassa', createdAt: 100 },
  { id: '2', sequence: 2, businessDate: '2026-08-25', shift: 'dinner', source: 'RISTORANTE', status: 'preparing',
    customer: 'Bruno', phone: '3399876543', payment: 'Apple Pay · demo', createdAt: 300 },
  { id: '3', sequence: 3, businessDate: '2026-08-25', shift: 'lunch', source: 'WEB', status: 'cancelled',
    customer: 'Carla', phone: '3402223344', payment: 'Paga in cassa', createdAt: 200 }
];

test('senza filtri lo storico mostra tutto dal piu recente', () => {
  assert.deepEqual(filterOrders(ordini, {}).map(order => order.id), ['2', '3', '1']);
});

test('filtra per giornata operativa, turno, origine e stato', () => {
  assert.deepEqual(filterOrders(ordini, { date: '2026-08-25' }).map(order => order.id), ['2', '3']);
  assert.deepEqual(filterOrders(ordini, { shift: 'lunch' }).map(order => order.id), ['3', '1']);
  assert.deepEqual(filterOrders(ordini, { source: 'RISTORANTE' }).map(order => order.id), ['2']);
  assert.deepEqual(filterOrders(ordini, { status: 'cancelled' }).map(order => order.id), ['3']);
});

test('la ricerca libera copre numero, cliente, telefono e pagamento', () => {
  assert.deepEqual(filterOrders(ordini, { query: 'anna' }).map(order => order.id), ['1']);
  assert.deepEqual(filterOrders(ordini, { query: '9876' }).map(order => order.id), ['2']);
  assert.deepEqual(filterOrders(ordini, { query: 'apple' }).map(order => order.id), ['2']);
  assert.deepEqual(filterOrders(ordini, { query: 'carla' }).map(order => order.id), ['3']);
});

test('il cancelletto cerca per numero ordine e non dentro i telefoni', () => {
  assert.deepEqual(filterOrders(ordini, { query: '#3' }).map(order => order.id), ['3']);
  assert.deepEqual(filterOrders(ordini, { query: '#03' }).map(order => order.id), ['3']);
  assert.deepEqual(filterOrders(ordini, { query: '#9' }), []);
});

test('i filtri si combinano fra loro', () => {
  assert.deepEqual(filterOrders(ordini, { date: '2026-08-25', shift: 'lunch' }).map(order => order.id), ['3']);
  assert.deepEqual(filterOrders(ordini, { date: '2026-08-25', query: 'anna' }), []);
});

test('le giornate disponibili sono elencate dalla piu recente', () => {
  assert.deepEqual(historyDates(ordini), ['2026-08-25', '2026-08-24']);
});
