import assert from 'node:assert/strict';
import test from 'node:test';

import { ticketLines } from '../js/views/kitchen.js';

const riga = {
  quantity: 2,
  name: 'Diavola',
  removed: ['Basilico', 'Origano'],
  additions: [{ name: 'Olive', quantity: 1 }, { name: 'Bufala', quantity: 2 }],
  note: 'Ben cotta',
  allergens: ['Cereali contenenti glutine', 'Latte']
};

test('la riga dice quante e quale, poi cosa togliere, poi cosa aggiungere', () => {
  const righe = ticketLines(riga);

  assert.deepEqual(righe.map(entry => entry.kind), ['remove', 'add', 'note', 'allergens']);
  assert.equal(righe[0].text, 'SENZA Basilico, Origano');
  assert.equal(righe[1].text, '+ 1 Olive, 2 Bufala');
  assert.equal(righe[2].text, 'Ben cotta');
  assert.equal(righe[3].text, 'Glutine, Latte');
});

test('una pizza senza modifiche non porta righe inutili sulla comanda', () => {
  assert.deepEqual(ticketLines({ quantity: 1, name: 'Margherita' }), []);
});

test('una nota che parla di allergie e un avviso, non una preferenza', () => {
  const [nota] = ticketLines({ name: 'Margherita', note: 'Allergico alle noci' });

  assert.equal(nota.kind, 'note');
  assert.equal(nota.alert, true);
  assert.equal(ticketLines({ name: 'Margherita', note: 'Ben cotta' })[0].alert, false);
});

test('gli allergeni si accorciano: in cucina si legge l ingrediente, non la formula di legge', () => {
  const righe = ticketLines({ name: 'Napoli', allergens: ['Cereali contenenti glutine', 'Pesce'] });

  assert.equal(righe[0].text, 'Glutine, Pesce');
});

test('l allergene arriva dal database come oggetto e resta leggibile', () => {
  const righe = ticketLines({
    name: 'Margherita',
    allergens: [
      { id: 'a1', label_it: 'Cereali contenenti glutine', label_en: 'Cereals containing gluten' },
      { id: 'a7', label_it: 'Latte', label_en: 'Milk' }
    ]
  });

  assert.equal(righe[0].text, 'Glutine, Latte');
});
