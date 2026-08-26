import assert from 'node:assert/strict';
import test from 'node:test';

import { addLine, draftFromOrder, draftIsValid, draftItems, draftTotal, toggleRemoved, stepAddition, stepQuantity } from '../js/views/order-draft.js';

const menu = [
  {
    id: 'margherita', databaseId: 'p1', type: 'pizza', name: 'Margherita', price: 8,
    ingredients: ['Pomodoro', 'Mozzarella'],
    ingredientIds: { Pomodoro: 'i1', Mozzarella: 'i2' },
    additions: [{ id: 'i9', name: 'Olive', price: 1, maxQuantity: 2 }]
  },
  { id: 'cola', databaseId: 'p2', type: 'drink', name: 'Cola', price: 3, ingredients: [], ingredientIds: {}, additions: [] }
];

const ordine = {
  id: 'o1', sequence: 4, total: 9,
  items: [{
    id: 'r1', productId: 'p1', name: 'Margherita', quantity: 1, unitPrice: 9,
    removed: ['Pomodoro'], removedIngredientIds: ['i1'],
    additions: [{ id: 'i9', name: 'Olive', price: 1, quantity: 1 }],
    note: 'Ben cotta'
  }]
};

test('la bozza parte da quello che il cliente ha davvero ordinato', () => {
  const draft = draftFromOrder(ordine, menu);

  assert.equal(draft.lines.length, 1);
  assert.equal(draft.lines[0].name, 'Margherita');
  assert.equal(draft.lines[0].quantity, 1);
  assert.deepEqual(draft.lines[0].removed, ['i1']);
  assert.deepEqual(draft.lines[0].additions, { i9: 1 });
  assert.equal(draft.lines[0].note, 'Ben cotta');
});

test('si toglie e si rimette un ingrediente', () => {
  let draft = draftFromOrder(ordine, menu);
  draft = toggleRemoved(draft, draft.lines[0].key, 'i2');
  assert.deepEqual(draft.lines[0].removed, ['i1', 'i2']);

  draft = toggleRemoved(draft, draft.lines[0].key, 'i1');
  assert.deepEqual(draft.lines[0].removed, ['i2']);
});

test('si aggiunge un extra fino al massimo consentito e non oltre', () => {
  let draft = draftFromOrder(ordine, menu);
  const key = draft.lines[0].key;

  draft = stepAddition(draft, key, 'i9', 1, menu);
  assert.deepEqual(draft.lines[0].additions, { i9: 2 });
  draft = stepAddition(draft, key, 'i9', 1, menu);
  assert.deepEqual(draft.lines[0].additions, { i9: 2 });

  draft = stepAddition(draft, key, 'i9', -3, menu);
  assert.deepEqual(draft.lines[0].additions, {});
});

test('si aggiunge un prodotto che non era nell ordine', () => {
  let draft = draftFromOrder(ordine, menu);
  draft = addLine(draft, menu[1]);

  assert.equal(draft.lines.length, 2);
  assert.equal(draft.lines[1].name, 'Cola');
  assert.equal(draft.lines[1].quantity, 1);
});

test('una riga portata a zero esce dall ordine', () => {
  let draft = draftFromOrder(ordine, menu);
  draft = addLine(draft, menu[1]);
  draft = stepQuantity(draft, draft.lines[0].key, -1);

  assert.deepEqual(draftItems(draft).map(i => i.product_id), ['p2']);
  assert.equal(draftIsValid(draft), true);
});

test('un ordine non puo restare vuoto', () => {
  let draft = draftFromOrder(ordine, menu);
  draft = stepQuantity(draft, draft.lines[0].key, -1);

  assert.equal(draftIsValid(draft), false);
});

test('il totale segue il listino: base piu le aggiunte, per la quantita', () => {
  let draft = draftFromOrder(ordine, menu);
  // Margherita 8 + oliva 1 = 9
  assert.equal(draftTotal(draft, menu), 9);

  draft = stepQuantity(draft, draft.lines[0].key, 1);
  assert.equal(draftTotal(draft, menu), 18);

  draft = addLine(draft, menu[1]);
  assert.equal(draftTotal(draft, menu), 21);
});

test('la bozza diventa il payload che il database si aspetta', () => {
  const draft = draftFromOrder(ordine, menu);

  assert.deepEqual(draftItems(draft), [{
    product_id: 'p1',
    quantity: 1,
    note: 'Ben cotta',
    changes: [
      { type: 'removed', ingredient_id: 'i1', quantity: 1 },
      { type: 'addition', ingredient_id: 'i9', quantity: 1 }
    ]
  }]);
});
