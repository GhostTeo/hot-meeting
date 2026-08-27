import assert from 'node:assert/strict';
import test from 'node:test';

import { waitingStage } from '../js/views/waiting-room.js';

// Chi aspetta vuole sapere due cose: a che punto e', e quando uscire di casa.

test('appena ordinato la pizza e in coda, non ancora in forno', () => {
  const stage = waitingStage({ status: 'preparing', minutesLeft: 9, promisedMinutes: 9 });

  assert.equal(stage.key, 'queued');
  assert.equal(stage.progress, 0);
});

test('a meta strada e in lavorazione', () => {
  const stage = waitingStage({ status: 'preparing', minutesLeft: 5, promisedMinutes: 10 });

  assert.equal(stage.key, 'working');
  assert.equal(stage.progress, 50);
});

test('negli ultimi minuti si dice di muoversi', () => {
  assert.equal(waitingStage({ status: 'preparing', minutesLeft: 2, promisedMinutes: 10 }).key, 'almost');
});

test('quando e pronta lo dice forte, e la barra e piena', () => {
  const stage = waitingStage({ status: 'ready', minutesLeft: 0, promisedMinutes: 10 });

  assert.equal(stage.key, 'ready');
  assert.equal(stage.progress, 100);
});

test('consegnato chiude la storia', () => {
  assert.equal(waitingStage({ status: 'collected' }).key, 'collected');
});

test('se il tempo e scaduto ma non e ancora pronta non si mente: sta uscendo', () => {
  const stage = waitingStage({ status: 'preparing', minutesLeft: 0, promisedMinutes: 10 });

  assert.equal(stage.key, 'almost');
  assert.equal(stage.progress, 97);
});
