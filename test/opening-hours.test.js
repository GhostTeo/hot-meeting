import test from 'node:test';
import assert from 'node:assert/strict';
import { openingStatus, SERVICE_HOURS } from '../js/opening-hours.js';

// Orari fissi della pizzeria: pranzo 12:00-14:15, sera 19:00-22:15 (ora di Roma).
// Fuori da queste due finestre l'app deve dire "chiuso, chiama il ristorante".

const at = iso => Date.parse(iso);

test('gli orari standard sono pranzo 12-14:15 e sera 19-22:15', () => {
  assert.deepEqual(SERVICE_HOURS.lunch, { open: '12:00', close: '14:15' });
  assert.deepEqual(SERVICE_HOURS.dinner, { open: '19:00', close: '22:15' });
});

test('a mezzogiorno e mezzo siamo aperti a pranzo', () => {
  const status = openingStatus(at('2026-09-01T12:30:00+02:00'));
  assert.equal(status.open, true);
  assert.equal(status.shift, 'lunch');
});

test('alle 14:20 il pranzo e finito: chiuso', () => {
  const status = openingStatus(at('2026-09-01T14:20:00+02:00'));
  assert.equal(status.open, false);
  assert.equal(status.shift, null);
  assert.equal(status.nextShift, 'dinner');
});

test('alle 20:00 siamo aperti la sera', () => {
  const status = openingStatus(at('2026-09-01T20:00:00+02:00'));
  assert.equal(status.open, true);
  assert.equal(status.shift, 'dinner');
});

test('alle 23:00 la sera e chiusa', () => {
  const status = openingStatus(at('2026-09-01T23:00:00+02:00'));
  assert.equal(status.open, false);
  assert.equal(status.shift, null);
});

test('il confine e incluso all apertura ed escluso alla chiusura', () => {
  assert.equal(openingStatus(at('2026-09-01T12:00:00+02:00')).open, true);
  assert.equal(openingStatus(at('2026-09-01T14:15:00+02:00')).open, false);
  assert.equal(openingStatus(at('2026-09-01T19:00:00+02:00')).open, true);
  assert.equal(openingStatus(at('2026-09-01T22:15:00+02:00')).open, false);
});

test('prima di pranzo il prossimo turno e il pranzo', () => {
  const status = openingStatus(at('2026-09-01T09:00:00+02:00'));
  assert.equal(status.open, false);
  assert.equal(status.nextShift, 'lunch');
});

test('nel pomeriggio fra i due turni il prossimo e la sera', () => {
  const status = openingStatus(at('2026-09-01T16:00:00+02:00'));
  assert.equal(status.open, false);
  assert.equal(status.nextShift, 'dinner');
});
