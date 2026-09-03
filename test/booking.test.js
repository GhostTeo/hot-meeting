import test from 'node:test';
import assert from 'node:assert/strict';
import { bookableSlots, slotTimestamp, BOOKING_LEAD_MINUTES, BOOKING_SLOT_MINUTES } from '../js/booking.js';

const hours = { lunch: { open: '12:00', close: '14:15' }, dinner: { open: '19:00', close: '22:15' } };

test('senza turno o orari non ci sono slot', () => {
  assert.deepEqual(bookableSlots({ shift: null, hours, nowMinutes: 12 * 60 }), []);
  assert.deepEqual(bookableSlots({ shift: 'lunch', hours: null, nowMinutes: 12 * 60 }), []);
});

test('il primo slot e il primo quarto d ora utile dopo il margine di preparazione', () => {
  // 12:00 + 25 minuti di margine = 12:25, arrotondato al quarto successivo: 12:30.
  const slots = bookableSlots({ shift: 'lunch', hours, nowMinutes: 12 * 60 });
  assert.equal(slots[0].label, '12:30');
  assert.equal(slots[0].minute, 12 * 60 + 30);
});

test('quando il margine cade gia su un quarto esatto non se ne aggiunge uno in piu', () => {
  // 12:05 + 25 = 12:30 esatto: il primo slot resta 12:30, non 12:45.
  const slots = bookableSlots({ shift: 'lunch', hours, nowMinutes: 12 * 60 + 5 });
  assert.equal(slots[0].label, '12:30');
});

test('l ultimo slot lascia dieci minuti prima della chiusura del turno', () => {
  // Chiusura pranzo 14:15: l'ultimo slot utile e 14:00 (14:15 - 10 = 14:05, arrotondato al quarto sotto).
  const slots = bookableSlots({ shift: 'lunch', hours, nowMinutes: 13 * 60 });
  const ultimo = slots[slots.length - 1];
  assert.equal(ultimo.label, '14:00');
});

test('vicino alla chiusura non restano slot prenotabili', () => {
  const slots = bookableSlots({ shift: 'lunch', hours, nowMinutes: 14 * 60 + 10 });
  assert.deepEqual(slots, []);
});

test('gli slot sono ogni quarto d ora', () => {
  const slots = bookableSlots({ shift: 'dinner', hours, nowMinutes: 19 * 60 });
  for (let i = 1; i < slots.length; i += 1) {
    assert.equal(slots[i].minute - slots[i - 1].minute, BOOKING_SLOT_MINUTES);
  }
});

test('il margine e il passo si possono personalizzare', () => {
  const slots = bookableSlots({ shift: 'lunch', hours, nowMinutes: 12 * 60, leadMinutes: 0, step: 30 });
  assert.equal(slots[0].label, '12:00');
  assert.equal(slots[1].label, '12:30');
});

test('BOOKING_LEAD_MINUTES e il margine di default usato sopra', () => {
  assert.equal(BOOKING_LEAD_MINUTES, 25);
});

test('slotTimestamp sposta "now" degli stessi minuti reali fra now e lo slot', () => {
  const now = Date.parse('2026-09-01T12:00:00+02:00');
  const nowMinutes = 12 * 60;
  const target = slotTimestamp(12 * 60 + 30, now, nowMinutes);
  assert.equal(target, now + 30 * 60000);
});

test('slotTimestamp con lo slot uguale a ora restituisce lo stesso istante', () => {
  const now = Date.parse('2026-09-01T19:00:00+02:00');
  assert.equal(slotTimestamp(19 * 60, now, 19 * 60), now);
});
