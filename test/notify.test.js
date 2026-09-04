import assert from 'node:assert/strict';
import test from 'node:test';

import { arrivedOrders } from '../js/notify.js';

const ordine = (id, sequence, status = 'preparing') => ({ id, sequence, status });

test('riconosce gli ordini arrivati fra un aggiornamento e l altro', () => {
  const prima = [ordine('a', 1), ordine('b', 2)];
  const dopo = [ordine('a', 1), ordine('b', 2), ordine('c', 3)];

  assert.deepEqual(arrivedOrders(prima, dopo).map(o => o.sequence), [3]);
});

test('un ordine che cambia stato non e un ordine nuovo', () => {
  const prima = [ordine('a', 1, 'preparing')];
  const dopo = [ordine('a', 1, 'ready')];

  assert.deepEqual(arrivedOrders(prima, dopo), []);
});

test('al primo caricamento non suona niente: non sono arrivati adesso', () => {
  assert.deepEqual(arrivedOrders(null, [ordine('a', 1)]), []);
  assert.deepEqual(arrivedOrders(undefined, [ordine('a', 1)]), []);
});

test('un ordine gia consegnato appena caricato non fa suonare la campanella', () => {
  const dopo = [ordine('a', 1, 'preparing'), ordine('b', 2, 'collected')];

  assert.deepEqual(arrivedOrders([], dopo).map(o => o.sequence), [1]);
});

import { startAlarm, stopAlarm, alarmActive } from '../js/notify.js';

test('l allarme suona subito e continua a ripetersi finche non lo fermi', () => {
  let suonate = 0; let idCreato = 0; const cancellati = [];
  const fakeSet = () => { idCreato += 1; return idCreato; };
  const fakeClear = id => cancellati.push(id);
  stopAlarm({ clearInterval: fakeClear }); // parto pulito

  const partito = startAlarm({ play: () => { suonate += 1; }, setInterval: fakeSet, clearInterval: fakeClear, intervalMs: 1000 });
  assert.equal(partito, true);
  assert.equal(suonate, 1, 'suona subito, senza aspettare il primo giro');
  assert.equal(alarmActive(), true);

  // Un secondo start non fa partire un secondo allarme sovrapposto.
  assert.equal(startAlarm({ play: () => { suonate += 1; }, setInterval: fakeSet }), false);
  assert.equal(suonate, 1);

  const fermato = stopAlarm({ clearInterval: fakeClear });
  assert.equal(fermato, true);
  assert.equal(alarmActive(), false);
  assert.ok(cancellati.includes(idCreato), 'fermando l allarme si cancella il timer creato');
});

test('fermare un allarme gia spento non fa danni', () => {
  stopAlarm();
  assert.equal(stopAlarm(), false);
  assert.equal(alarmActive(), false);
});

import { announceOrders, notificationState, requestNotificationPermission, showNotification } from '../js/notify.js';

test('l annuncio distingue le prenotazioni dagli ordini immediati', () => {
  try {
    assert.equal(announceOrders([{ id: 'a', sequence: 3, scheduledFor: 1 }]), 'Nuova prenotazione #03');
    assert.equal(announceOrders([{ id: 'a', sequence: 3 }]), 'Nuovo ordine #03');
    assert.equal(announceOrders([{ id: 'a', sequence: 3, scheduledFor: 1 }, { id: 'b', sequence: 4, scheduledFor: 1 }]), '2 nuove prenotazioni');
    assert.equal(announceOrders([{ id: 'a', sequence: 3, scheduledFor: 1 }, { id: 'b', sequence: 4 }]), '2 nuovi ordini, di cui 1 prenotazione');
  } finally {
    stopAlarm();
  }
});

test('le notifiche del dispositivo: stato, permesso e invio passano dall API del browser', async () => {
  assert.equal(notificationState(undefined), 'unsupported');
  const mostrate = [];
  class FakeNotification {
    static permission = 'default';
    static async requestPermission() { FakeNotification.permission = 'granted'; return 'granted'; }
    constructor(title, options) { mostrate.push({ title, ...options }); }
  }
  assert.equal(notificationState(FakeNotification), 'default');
  assert.equal(showNotification({ title: 'x' }, FakeNotification), false);
  assert.equal(await requestNotificationPermission(FakeNotification), 'granted');
  assert.equal(showNotification({ title: 'Nuova prenotazione #05', body: '2 pizze per le 19:30', tag: 'booking-1' }, FakeNotification), true);
  assert.deepEqual(mostrate.map(n => [n.title, n.body, n.tag]), [['Nuova prenotazione #05', '2 pizze per le 19:30', 'booking-1']]);
});
