import test from 'node:test';
import assert from 'node:assert/strict';
import { bookableSlots, slotTimestamp, slotCapacity, BOOKING_LEAD_MINUTES, BOOKING_SLOT_MINUTES } from '../js/booking.js';

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

test('slotTimestamp arrotonda via i secondi di "adesso": il risultato cade sempre in punto', () => {
  // "Adesso" e' alle 19:12:47.382 (con secondi e millisecondi sporchi, come e'
  // sempre nella realta'): lo slot prenotato per le 19:30 deve uscire esatto.
  const now = Date.parse('2026-09-01T19:12:47.382+02:00');
  const target = slotTimestamp(19 * 60 + 30, now, 19 * 60 + 12);
  assert.equal(target % 60000, 0);
  assert.equal(new Date(target).toISOString(), '2026-09-01T17:30:00.000Z');
});

test('slotCapacity: quante pizze stanno in un quarto d ora con il forno di default', () => {
  // 15 minuti / 4 minuti a infornata = 3 infornate (arrotondate per difetto) × 6 pizze = 18.
  assert.equal(slotCapacity({ ovenSlots: 6, bakeMinutes: 4, step: 15 }), 18);
});

test('slotCapacity non scende mai sotto una infornata, anche se il forno e lento', () => {
  // Un'infornata da 20 minuti non ci sta tutta in un quarto d'ora: si conta comunque una volta.
  assert.equal(slotCapacity({ ovenSlots: 6, bakeMinutes: 20, step: 15 }), 6);
});

test('bookableSlots nasconde uno slot gia pieno', () => {
  const slots = bookableSlots({
    shift: 'lunch', hours, nowMinutes: 12 * 60,
    capacity: 18, booked: { [12 * 60 + 30]: 18 }
  });
  assert.equal(slots.some(s => s.minute === 12 * 60 + 30), false);
});

test('bookableSlots tiene conto di quante pizze si vogliono prenotare adesso', () => {
  // Restano 4 posti: un carrello da 5 pizze non ci sta, uno da 4 sì.
  const conCinque = bookableSlots({
    shift: 'lunch', hours, nowMinutes: 12 * 60,
    capacity: 18, booked: { [12 * 60 + 30]: 14 }, partySize: 5
  });
  assert.equal(conCinque.some(s => s.minute === 12 * 60 + 30), false);
  const conQuattro = bookableSlots({
    shift: 'lunch', hours, nowMinutes: 12 * 60,
    capacity: 18, booked: { [12 * 60 + 30]: 14 }, partySize: 4
  });
  const slot = conQuattro.find(s => s.minute === 12 * 60 + 30);
  assert.equal(slot.remaining, 4);
});

test('senza un limite di capienza tutti gli slot restano prenotabili', () => {
  const slots = bookableSlots({ shift: 'lunch', hours, nowMinutes: 12 * 60 });
  assert.ok(slots.length > 0);
  assert.equal(slots[0].remaining, null);
});

// ---- Giorno prenotabile, fusi orari e chiusure ----
import { nextBookingDay, romeTimestamp, romeDate, nextDate, bookingLabel } from '../js/booking.js';

test('romeTimestamp: ora legale (settembre) e ora solare (gennaio) danno l istante giusto', () => {
  assert.equal(new Date(romeTimestamp('2026-09-04', 12 * 60)).toISOString(), '2026-09-04T10:00:00.000Z');
  assert.equal(new Date(romeTimestamp('2026-01-10', 19 * 60 + 30)).toISOString(), '2026-01-10T18:30:00.000Z');
});

test('romeDate e nextDate ragionano sul calendario di Roma', () => {
  // Le 23:30 UTC del 4 settembre sono gia' il 5 a Roma.
  assert.equal(romeDate(Date.parse('2026-09-04T23:30:00Z')), '2026-09-05');
  assert.equal(nextDate('2026-09-30'), '2026-10-01');
});

test('bookableSlots per un giorno futuro (nowMinutes null) parte dall apertura del turno', () => {
  const slots = bookableSlots({ shift: 'lunch', hours, nowMinutes: null });
  assert.equal(slots[0].label, '12:00');
});

test('bookableSlots prima dell apertura non propone orari prima del turno', () => {
  // Alle 10:00 il pranzo non e' ancora iniziato: il primo slot e' le 12:00, non le 10:30.
  const slots = bookableSlots({ shift: 'lunch', hours, nowMinutes: 10 * 60 });
  assert.equal(slots[0].label, '12:00');
});

test('nextBookingDay: alle 16 (fra i turni) si prenota per la cena di oggi', () => {
  const now = Date.parse('2026-09-04T16:00:00+02:00');
  const giorno = nextBookingDay({ now, hours });
  assert.equal(giorno.date, '2026-09-04');
  assert.equal(giorno.today, true);
  assert.ok(giorno.slots.every(s => s.shift === 'dinner'));
  assert.equal(giorno.slots[0].label, '19:00');
  assert.equal(new Date(giorno.slots[0].at).toISOString(), '2026-09-04T17:00:00.000Z');
});

test('nextBookingDay: durante il pranzo propone il resto del pranzo e tutta la cena', () => {
  const now = Date.parse('2026-09-04T12:30:00+02:00');
  const giorno = nextBookingDay({ now, hours });
  assert.equal(giorno.slots[0].shift, 'lunch');
  assert.equal(giorno.slots[0].label, '13:00');
  assert.ok(giorno.slots.some(s => s.shift === 'dinner' && s.label === '19:00'));
});

test('nextBookingDay: dopo la cena si passa a domani a pranzo', () => {
  const now = Date.parse('2026-09-04T22:30:00+02:00');
  const giorno = nextBookingDay({ now, hours });
  assert.equal(giorno.date, '2026-09-05');
  assert.equal(giorno.today, false);
  assert.equal(giorno.slots[0].label, '12:00');
});

test('nextBookingDay: chiusi oggi e domani, si prenota solo per il giorno dopo la chiusura', () => {
  const now = Date.parse('2026-09-04T10:00:00+02:00');
  const chiusi = new Set(['2026-09-04', '2026-09-05']);
  const giorno = nextBookingDay({ now, hours, isClosed: date => chiusi.has(date) });
  assert.equal(giorno.date, '2026-09-06');
});

test('nextBookingDay: senza giorni aperti nell orizzonte non c e niente', () => {
  const now = Date.parse('2026-09-04T10:00:00+02:00');
  assert.equal(nextBookingDay({ now, hours, isClosed: () => true }), null);
});

test('nextBookingDay: le pizze gia prenotate si confrontano con la capienza del giorno giusto', () => {
  const now = Date.parse('2026-09-04T16:00:00+02:00');
  const pieno = romeTimestamp('2026-09-04', 19 * 60);
  const altroGiorno = romeTimestamp('2026-09-05', 19 * 60 + 15);
  const giorno = nextBookingDay({ now, hours, capacity: 18, booked: [{ at: pieno, pizzas: 18 }, { at: altroGiorno, pizzas: 18 }] });
  assert.ok(!giorno.slots.some(s => s.label === '19:00'));
  assert.ok(giorno.slots.some(s => s.label === '19:15'));
});

test('bookingLabel: solo l ora se e per oggi, anche il giorno se e per un altro giorno', () => {
  const now = Date.parse('2026-09-04T16:00:00+02:00');
  assert.equal(bookingLabel(romeTimestamp('2026-09-04', 19 * 60 + 30), { now }), '19:30');
  assert.match(bookingLabel(romeTimestamp('2026-09-06', 12 * 60), { now }), /6 set.*12:00/);
});
