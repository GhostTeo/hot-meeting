import assert from 'node:assert/strict';
import test from 'node:test';

import { createRepositoryRefreshCoordinator } from '../js/app-state.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

test('una risposta lenta non può sovrascrivere una generazione più recente', async () => {
  const first = deferred();
  const second = deferred();
  const pending = [first, second];
  const applied = [];
  const refresh = createRepositoryRefreshCoordinator({
    repository: { getState: () => pending.shift().promise },
    apply: snapshot => applied.push(snapshot.version)
  });

  const oldRequest = refresh.refresh();
  const newRequest = refresh.refresh();
  second.resolve({ version: 2 });
  await newRequest;
  first.resolve({ version: 1 });
  await oldRequest;

  assert.deepEqual(applied, [2]);
});

test('una raffica Realtime viene accorpata e serializzata in un solo recupero successivo', async () => {
  const loads = [];
  const applied = [];
  const refresh = createRepositoryRefreshCoordinator({
    repository: {
      getState() {
        const request = deferred();
        loads.push(request);
        return request.promise;
      }
    },
    apply: snapshot => applied.push(snapshot.version)
  });

  const initialBurst = Array.from({ length: 8 }, () => refresh.schedule());
  await Promise.resolve();
  assert.equal(loads.length, 1);

  const duringFlight = Array.from({ length: 8 }, () => refresh.schedule());
  loads[0].resolve({ version: 1 });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(loads.length, 2);
  loads[1].resolve({ version: 2 });
  await Promise.all([...initialBurst, ...duringFlight]);

  assert.equal(loads.length, 2);
  assert.deepEqual(applied, [1, 2]);
});
