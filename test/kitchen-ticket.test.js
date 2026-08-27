import assert from 'node:assert/strict';
import test from 'node:test';

import { buildKitchenTicket, ticketToText } from '../js/print/kitchen-ticket.js';

const ordine = {
  sequence: 7,
  source: 'WEB',
  customer: 'Marco',
  payment: 'Paga in cassa',
  createdAt: Date.parse('2026-08-25T19:12:00'),
  readyAt: Date.parse('2026-08-25T19:27:00'),
  items: [
    { quantity: 2, name: 'Margherita', removed: ['Basilico'], additions: [{ name: 'Olive', quantity: 1 }] },
    { quantity: 1, name: 'Diavola', note: 'Sono allergico alle noci' }
  ]
};

test('la comanda apre con il numero e il turno di consegna', () => {
  const ticket = buildKitchenTicket(ordine);

  assert.deepEqual(ticket[0], { kind: 'number', text: '#07' });
  assert.equal(ticket[1].text, 'WEB · Marco');
  assert.equal(ticket[2].text, 'Ordinato 19:12 · Pronto 19:27');
});

test('ogni riga porta quantita, cosa togliere e cosa aggiungere', () => {
  const righe = buildKitchenTicket(ordine).filter(row => ['item', 'change'].includes(row.kind));

  assert.deepEqual(righe.map(row => row.text), [
    '2x MARGHERITA',
    'SENZA Basilico',
    '+ 1x Olive',
    '1x DIAVOLA'
  ]);
});

test('una nota che parla di allergie va messa in evidenza', () => {
  const note = buildKitchenTicket(ordine).filter(row => row.kind === 'note');

  assert.deepEqual(note, [{ kind: 'note', text: 'Sono allergico alle noci', alert: true }]);
});

test('una nota qualunque resta una nota', () => {
  const ticket = buildKitchenTicket({ ...ordine, items: [{ quantity: 1, name: 'Bufala', note: 'Ben cotta' }] });

  assert.deepEqual(ticket.filter(row => row.kind === 'note'), [
    { kind: 'note', text: 'Ben cotta', alert: false }
  ]);
});

test('il piede ricorda come si paga', () => {
  const ticket = buildKitchenTicket(ordine);

  assert.equal(ticket.at(-1).text, 'Paga in cassa');
});

test('il testo si spezza sulla larghezza della carta', () => {
  const testo = ticketToText([{ kind: 'note', text: 'Nota molto lunga che non entra su una riga sola', alert: false }], 20);

  assert.deepEqual(testo.split('\n'), [
    'Nota molto lunga che',
    'non entra su una',
    'riga sola'
  ]);
});

test('la comanda stampata dichiara gli allergeni di ogni riga', () => {
  const ticket = buildKitchenTicket({
    sequence: 3,
    items: [{
      quantity: 1, name: 'Napoli',
      allergens: [{ label_it: 'Cereali contenenti glutine' }, { label_it: 'Pesce' }]
    }]
  });

  assert.deepEqual(ticket.filter(row => row.kind === 'allergens'), [
    { kind: 'allergens', text: 'ALLERGENI: Glutine, Pesce' }
  ]);
});

test('le bibite stanno sulla comanda ma in fondo, staccate da cio che va in forno', () => {
  const ticket = buildKitchenTicket({
    sequence: 5,
    items: [
      { quantity: 2, name: 'Margherita' },
      { quantity: 3, name: 'Coca-Cola' },
      { quantity: 1, name: 'Diavola' }
    ]
  }, { isDrink: item => /cola|acqua|birra/i.test(item.name) });

  const testo = ticket.map(row => row.text);
  assert.ok(testo.indexOf('1x DIAVOLA') < testo.indexOf('AL BANCO'));
  assert.ok(testo.indexOf('AL BANCO') < testo.indexOf('3x COCA-COLA'));
  assert.deepEqual(ticket.filter(row => row.kind === 'section').map(row => row.text), ['AL BANCO']);
});

test('senza bibite non compare nessuna sezione al banco', () => {
  const ticket = buildKitchenTicket({ sequence: 5, items: [{ quantity: 1, name: 'Margherita' }] });

  assert.deepEqual(ticket.filter(row => row.kind === 'section'), []);
});
