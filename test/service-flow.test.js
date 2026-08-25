import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCloseDialog,
  closeService,
  nextServiceSequence,
  reopenService,
  servicePanel,
  serviceAcceptsOrders,
  startServiceWithCalendar,
  startServiceTransition
} from '../js/views/service.js';
import {
  addExceptionalOpening,
  addHoliday,
  updateWeeklyClosure
} from '../js/views/calendar.js';

const closedDinner = {
  id: 'dinner-2026-08-24',
  shift: 'dinner',
  status: 'closed',
  businessDate: '2026-08-24',
  sequenceBase: 18,
  sessions: [{ openedAt: 100, closedAt: 200 }]
};

test('una riapertura mantiene giornata e progressivo', () => {
  const reopened = reopenService(closedDinner, 300);

  assert.equal(reopened.businessDate, closedDinner.businessDate);
  assert.equal(reopened.sequenceBase, closedDinner.sequenceBase);
  assert.equal(reopened.status, 'open');
  assert.deepEqual(reopened.sessions, [
    { openedAt: 100, closedAt: 200 },
    { openedAt: 300, closedAt: null }
  ]);
});

test('la transizione UI riapre dopo mezzanotte la giornata appena chiusa', () => {
  const state = {
    activeDay: { id: 'day-24', date: '2026-08-24', status: 'closed' },
    orders: [{ businessDate: '2026-08-24', sequence: 18 }],
    services: { lunch: null, dinner: { ...closedDinner, businessDayId: 'day-24' } },
    shift: null
  };

  const reopened = startServiceTransition(
    state,
    'dinner',
    '2026-08-25T00:30:00+02:00',
    'reopen'
  );

  assert.equal(reopened.activeDay.date, '2026-08-24');
  assert.equal(reopened.activeDay.status, 'open');
  assert.equal(reopened.services.dinner.businessDate, '2026-08-24');
  assert.equal(reopened.services.dinner.sequenceBase, 18);
  assert.equal(reopened.activeDay.id, 'day-24');
  assert.equal(reopened.services.dinner.sessions.length, 2);
  assert.equal(reopened.shift, 'dinner');
  assert.equal(nextServiceSequence(reopened.orders, reopened.services.dinner, reopened.activeDay), 19);
});

test('giorni dopo una chiusura la stessa azione avvia la data corrente', () => {
  const state = {
    activeDay: { id: 'day-24', date: '2026-08-24', status: 'closed' },
    orders: [{ businessDayId: 'day-24', businessDate: '2026-08-24', sequence: 18 }],
    services: { lunch: null, dinner: { ...closedDinner, businessDayId: 'day-24' } },
    shift: null
  };

  const started = startServiceTransition(state, 'dinner', '2026-08-27T10:00:00+02:00', 'reopen');

  assert.equal(started.activeDay.date, '2026-08-27');
  assert.notEqual(started.activeDay.id, 'day-24');
  assert.equal(started.services.dinner.sequenceBase, 0);
  assert.equal(started.services.dinner.sessions.length, 1);
  assert.equal(nextServiceSequence(started.orders, started.services.dinner, started.activeDay), 1);
});

test('entro la finestra notturna il Creator può iniziare esplicitamente una nuova giornata', () => {
  const state = {
    activeDay: { id: 'day-24', date: '2026-08-24', status: 'closed' },
    orders: [{ businessDayId: 'day-24', businessDate: '2026-08-24', sequence: 18 }],
    services: { lunch: null, dinner: { ...closedDinner, businessDayId: 'day-24' } },
    shift: null
  };

  const started = startServiceTransition(state, 'dinner', '2026-08-25T01:00:00+02:00', 'new-day');

  assert.equal(started.activeDay.date, '2026-08-25');
  assert.notEqual(started.activeDay.id, 'day-24');
  assert.equal(started.services.dinner.sequenceBase, 0);
  assert.equal(started.services.dinner.sessions.length, 1);
});

test('la validazione calendario usa la data operativa scelta dalla transizione', () => {
  const state = {
    activeDay: { id: 'day-24', date: '2026-08-24', status: 'closed' },
    orders: [],
    services: { lunch: null, dinner: { ...closedDinner, businessDayId: 'day-24' } },
    shift: null
  };
  const calendar = { closedWeekdays: [2], exceptions: [] };

  const reopened = startServiceWithCalendar(state, 'dinner', '2026-08-25T01:00:00+02:00', 'reopen', calendar);
  const newDay = startServiceWithCalendar(state, 'dinner', '2026-08-25T01:00:00+02:00', 'new-day', calendar);

  assert.equal(reopened.started, true);
  assert.equal(reopened.targetDate, '2026-08-24');
  assert.equal(newDay.started, false);
  assert.equal(newDay.targetDate, '2026-08-25');
  assert.equal(newDay.closure.closed, true);
});

test('il pannello offre nuova giornata insieme alla riapertura solo nella finestra valida', () => {
  const state = {
    activeDay: { date: '2026-08-24', status: 'closed' },
    services: { lunch: null, dinner: closedDinner }
  };

  const withinWindow = servicePanel(state, '2026-08-25T01:00:00+02:00');
  const daysLater = servicePanel(state, '2026-08-27T10:00:00+02:00');

  assert.match(withinWindow, /Riapri servizio/);
  assert.match(withinWindow, /Avvia nuova giornata/);
  assert.doesNotMatch(daysLater, /Riapri servizio/);
  assert.match(daysLater, /Apri servizio/);
});

test('iniziare una nuova giornata dal pranzo sopprime la riapertura della cena storica', () => {
  const oldDay = {
    activeDay: { id: 'day-24', date: '2026-08-24', status: 'closed' },
    orders: [{ businessDayId: 'day-24', businessDate: '2026-08-24', sequence: 18 }],
    services: { lunch: null, dinner: { ...closedDinner, businessDayId: 'day-24' } },
    shift: null
  };

  const newDay = startServiceTransition(oldDay, 'lunch', '2026-08-25T01:00:00+02:00', 'new-day');
  const panel = servicePanel(newDay, '2026-08-25T01:05:00+02:00');

  assert.doesNotMatch(panel, /Riapri servizio/);
  assert.doesNotMatch(panel, /Avvia nuova giornata/);
  assert.match(panel, /data-shift="dinner">Apri servizio/);
});

test('un servizio legacy della stessa data non sostituisce l’identità nuova selezionata', () => {
  const oldDay = {
    activeDay: { date: '2026-08-24', status: 'closed' },
    orders: [],
    services: { lunch: null, dinner: closedDinner },
    shift: null
  };

  const newIdentity = startServiceTransition(oldDay, 'lunch', '2026-08-24T20:00:00+02:00', 'new-day');
  const panel = servicePanel(newIdentity, '2026-08-24T20:05:00+02:00');

  assert.doesNotMatch(panel, /data-shift="dinner">Riapri servizio/);
  assert.match(panel, /data-shift="dinner">Apri servizio/);
});

test('una giornata già selezionata non propone di crearne un’altra dopo la chiusura del turno', () => {
  const oldDay = {
    activeDay: { id: 'day-24', date: '2026-08-24', status: 'closed' },
    orders: [],
    services: { lunch: null, dinner: { ...closedDinner, businessDayId: 'day-24' } },
    shift: null
  };
  const lunchOpen = startServiceTransition(oldDay, 'lunch', '2026-08-25T01:00:00+02:00', 'new-day');
  const selectedDay = {
    ...lunchOpen,
    shift: null,
    services: {
      ...lunchOpen.services,
      lunch: closeService(lunchOpen.services.lunch, new Date('2026-08-25T01:30:00+02:00').getTime())
    }
  };

  const panel = servicePanel(selectedDay, '2026-08-25T01:35:00+02:00');

  assert.match(panel, /Riapri servizio/);
  assert.doesNotMatch(panel, /Avvia nuova giornata/);
  assert.match(panel, /data-shift="dinner">Apri servizio/);
});

test('aprire la cena continua identità data e progressivo della nuova giornata selezionata', () => {
  const oldDay = {
    activeDay: { id: 'day-24', date: '2026-08-24', status: 'closed' },
    orders: [],
    services: { lunch: null, dinner: { ...closedDinner, businessDayId: 'day-24' } },
    shift: null
  };
  const lunchOpen = startServiceTransition(oldDay, 'lunch', '2026-08-25T01:00:00+02:00', 'new-day');
  const withLunchOrder = {
    ...lunchOpen,
    shift: null,
    orders: [{
      businessDayId: lunchOpen.activeDay.id,
      businessDate: '2026-08-25',
      sequence: 1
    }]
  };

  const dinnerOpen = startServiceTransition(withLunchOrder, 'dinner', '2026-08-25T01:10:00+02:00', 'open');

  assert.equal(dinnerOpen.activeDay.id, lunchOpen.activeDay.id);
  assert.equal(dinnerOpen.activeDay.date, '2026-08-25');
  assert.equal(dinnerOpen.services.dinner.businessDayId, lunchOpen.activeDay.id);
  assert.equal(dinnerOpen.services.dinner.sequenceBase, 1);
  assert.equal(nextServiceSequence(dinnerOpen.orders, dinnerOpen.services.dinner, dinnerOpen.activeDay), 2);
});

test('un’azione di riapertura obsoleta non riporta lo stato alla giornata precedente', () => {
  const oldDay = {
    activeDay: { id: 'day-24', date: '2026-08-24', status: 'closed' },
    orders: [],
    services: { lunch: null, dinner: { ...closedDinner, businessDayId: 'day-24' } },
    shift: null
  };
  const selected = startServiceTransition(oldDay, 'lunch', '2026-08-25T01:00:00+02:00', 'new-day');
  const staleAction = { ...selected, shift: null };

  const result = startServiceTransition(staleAction, 'dinner', '2026-08-25T01:10:00+02:00', 'reopen');

  assert.equal(result.activeDay.id, selected.activeDay.id);
  assert.equal(result.activeDay.date, '2026-08-25');
  assert.equal(result.services.dinner.businessDayId, selected.activeDay.id);
  assert.equal(result.services.dinner.sessions.length, 1);
});

test('la chiusura resta bloccata e identifica gli ordini attivi del turno', () => {
  const orders = [
    { id: 21, serviceId: closedDinner.id, status: 'preparing' },
    { id: 22, serviceId: closedDinner.id, status: 'ready' },
    { id: 23, serviceId: 'lunch-2026-08-24', status: 'received' }
  ];

  assert.deepEqual(buildCloseDialog(closedDinner, orders, {}), {
    kind: 'blocked',
    blockingOrders: [orders[0]]
  });
});

test('la conferma di chiusura riepiloga il turno senza perdere i totali', () => {
  const summary = { orders: 3, pizzas: 7, gross: 72, net: 68.4 };

  assert.deepEqual(buildCloseDialog(closedDinner, [], summary), {
    kind: 'confirm',
    shift: 'dinner',
    businessDate: '2026-08-24',
    summary,
    closesBusinessDay: true
  });
});

test('la chiusura termina soltanto la sessione corrente', () => {
  const openDinner = reopenService(closedDinner, 300);
  const closed = closeService(openDinner, 450);

  assert.equal(closed.status, 'closed');
  assert.equal(closed.businessDate, '2026-08-24');
  assert.equal(closed.sequenceBase, 18);
  assert.deepEqual(closed.sessions.at(-1), { openedAt: 300, closedAt: 450 });
});

test('il Creator può sostituire il martedì come chiusura settimanale', () => {
  assert.deepEqual(updateWeeklyClosure({ closedWeekdays: [2], exceptions: [] }, 1), {
    closedWeekdays: [1],
    exceptions: []
  });
});

test('le ferie e l’apertura straordinaria diventano eccezioni esplicite', () => {
  const calendar = { closedWeekdays: [2], exceptions: [] };
  const withHoliday = addHoliday(calendar, {
    from: '2026-08-25',
    to: '2026-08-29',
    message: 'Chiuso per ferie'
  });
  const withOpening = addExceptionalOpening(withHoliday, {
    date: '2026-08-25',
    message: 'Apertura straordinaria'
  });

  assert.deepEqual(withOpening.exceptions, [
    { from: '2026-08-25', to: '2026-08-29', closed: true, message: 'Chiuso per ferie' },
    { date: '2026-08-25', closed: false, message: 'Apertura straordinaria' }
  ]);
  assert.deepEqual(calendar.exceptions, []);
});

test('un servizio appena aperto accetta ordini online', () => {
  assert.equal(serviceAcceptsOrders(null, 'open'), true);
  assert.equal(serviceAcceptsOrders({ online: false, status: 'closed' }, 'new-day'), true);
});

test('la riapertura conserva la sospensione degli ordini online', () => {
  assert.equal(serviceAcceptsOrders({ online: false, status: 'closed' }, 'reopen'), false);
  assert.equal(serviceAcceptsOrders({ online: true, status: 'closed' }, 'reopen'), true);
});
