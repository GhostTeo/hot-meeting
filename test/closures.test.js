import assert from 'node:assert/strict';
import test from 'node:test';

import { calendarFromClosures, closureRowFromException, weeklyClosureRow } from '../js/closures.js';

test('il riposo settimanale del database diventa il giorno chiuso del calendario', () => {
  const calendar = calendarFromClosures([
    { id: 'w1', closure_type: 'weekly', weekday: 2, public_message: '' }
  ]);

  assert.deepEqual(calendar.closedWeekdays, [2]);
  assert.deepEqual(calendar.exceptions, []);
});

test('le ferie diventano un intervallo chiuso e conservano l identificativo', () => {
  const calendar = calendarFromClosures([
    { id: 'h1', closure_type: 'holiday', starts_on: '2026-08-10', ends_on: '2026-08-20', public_message: 'Chiuso per ferie' }
  ]);

  assert.deepEqual(calendar.exceptions, [
    { id: 'h1', from: '2026-08-10', to: '2026-08-20', closed: true, message: 'Chiuso per ferie' }
  ]);
});

test('l apertura straordinaria resta una data esatta cosi da prevalere sulle ferie', () => {
  const calendar = calendarFromClosures([
    { id: 'e1', closure_type: 'exceptional_opening', starts_on: '2026-08-15', ends_on: '2026-08-15', public_message: 'Ferragosto aperto' }
  ]);

  assert.deepEqual(calendar.exceptions, [
    { id: 'e1', date: '2026-08-15', closed: false, message: 'Ferragosto aperto' }
  ]);
});

test('la riga del riposo settimanale usa il giorno ISO senza intervalli', () => {
  assert.deepEqual(weeklyClosureRow(3), {
    closure_type: 'weekly', weekday: 3, starts_on: null, ends_on: null,
    public_message: 'Chiuso per riposo settimanale', enabled: true
  });
});

test('un eccezione del calendario torna nella forma attesa dal database', () => {
  assert.deepEqual(closureRowFromException({ from: '2026-12-24', to: '2026-12-26', closed: true, message: 'Natale' }), {
    closure_type: 'holiday', weekday: null, starts_on: '2026-12-24', ends_on: '2026-12-26', public_message: 'Natale', enabled: true
  });
  assert.deepEqual(closureRowFromException({ date: '2026-12-25', closed: false, message: 'Aperto' }), {
    closure_type: 'exceptional_opening', weekday: null, starts_on: '2026-12-25', ends_on: '2026-12-25', public_message: 'Aperto', enabled: true
  });
});
