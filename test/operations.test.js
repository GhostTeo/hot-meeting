import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveBusinessDate,
  nextDailySequence,
  canCloseService,
  resolveClosure
} from '../js/operations.js';

test('mantiene il 23 agosto dopo mezzanotte finché la giornata è aperta', () => {
  assert.equal(
    resolveBusinessDate('2026-08-24T00:30:00+02:00', { date: '2026-08-23', status: 'open' }),
    '2026-08-23'
  );
});

test('riparte da 01 in una nuova giornata', () => {
  assert.equal(nextDailySequence([{ businessDate: '2026-08-23', sequence: 18 }], '2026-08-24'), 1);
});

test('blocca la chiusura con un ordine in preparazione', () => {
  assert.equal(canCloseService([{ serviceId: 'dinner-1', status: 'preparing' }], 'dinner-1'), false);
});

test('continua il progressivo più alto della stessa giornata', () => {
  assert.equal(nextDailySequence([
    { businessDate: '2026-08-24', sequence: 3 },
    { businessDate: '2026-08-24', sequence: 8 },
    { businessDate: '2026-08-23', sequence: 20 }
  ], '2026-08-24'), 9);
});

test('consente la chiusura quando il servizio non ha ordini attivi', () => {
  assert.equal(canCloseService([
    { serviceId: 'dinner-1', status: 'ready' },
    { serviceId: 'lunch-1', status: 'preparing' }
  ], 'dinner-1'), true);
});

test('applica la chiusura ricorrente con giorni ISO', () => {
  assert.deepEqual(resolveClosure('2026-08-25', [2], []), { closed: true });
  assert.deepEqual(resolveClosure('2026-08-26', [2], []), { closed: false });
});

test('un’eccezione per data prevale sulla chiusura ricorrente', () => {
  assert.deepEqual(
    resolveClosure('2026-08-25', [2], [{ date: '2026-08-25', closed: false, message: 'Apertura straordinaria' }]),
    { closed: false, message: 'Apertura straordinaria' }
  );
});

test('una chiusura ferie copre ogni data dell’intervallo inclusivo', () => {
  const exceptions = [{ from: '2026-08-25', to: '2026-08-29', closed: true, message: 'Ferie' }];
  assert.deepEqual(resolveClosure('2026-08-25', [], exceptions), { closed: true, message: 'Ferie' });
  assert.deepEqual(resolveClosure('2026-08-29', [], exceptions), { closed: true, message: 'Ferie' });
});

test('un intervallo di apertura straordinaria prevale sulla chiusura settimanale', () => {
  assert.deepEqual(
    resolveClosure('2026-08-27', [4], [{ from: '2026-08-25', to: '2026-08-29', closed: false, message: 'Apertura straordinaria' }]),
    { closed: false, message: 'Apertura straordinaria' }
  );
});
