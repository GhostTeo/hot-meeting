import assert from 'node:assert/strict';
import test from 'node:test';

import { draftFromProduct, emptyDraft, menuProductPayload } from '../js/views/menu-editor.js';

test('un prodotto esistente torna nella bozza in una lingua sola', () => {
  const draft = draftFromProduct({
    databaseId: 'p1', type: 'pizza', price: 11, available: true, sortOrder: 3,
    names: { it: 'Bufala', en: 'Buffalo' },
    ingredients: ['Pomodoro', 'Bufala'],
    descriptions: { it: 'La classica', en: 'The classic' },
    additions: [{ name: 'Acciughe', price: 2, maxQuantity: 2 }],
    allergenIds: ['a1'],
    imageUrl: 'https://cdn.example/bufala.jpg'
  });

  assert.equal(draft.id, 'p1');
  assert.equal(draft.name, 'Bufala');
  assert.equal(draft.description, 'La classica');
  assert.equal(draft.price, '11.00');
  // Gli ingredienti sono una riga sola: si scrivono come si direbbero a voce.
  assert.equal(draft.ingredients, 'Pomodoro, Bufala');
  assert.deepEqual(draft.additions, [{ name: 'Acciughe', price: '2.00' }]);
  assert.deepEqual(draft.allergenIds, ['a1']);
  assert.equal(draft.imageUrl, 'https://cdn.example/bufala.jpg');
});

test('una bozza vuota parte da una pizza disponibile', () => {
  const draft = emptyDraft();

  assert.equal(draft.id, null);
  assert.equal(draft.type, 'pizza');
  assert.equal(draft.available, true);
  assert.equal(draft.ingredients, '');
  assert.equal(draft.imageUrl, '');
});

test('l inglese lo mette il programma, non chi scrive il menu', () => {
  const payload = menuProductPayload({
    id: null, type: 'pizza', name: 'Diavola', description: 'Pomodoro e salame piccante',
    price: '10.50', available: true, ingredients: 'Pomodoro, mozzarella, salame piccante',
    additions: [{ name: 'Olive', price: '1' }], allergenIds: ['a1']
  });

  assert.equal(payload.translations.it.name, 'Diavola');
  assert.equal(payload.translations.en.name, 'Diavola');
  assert.equal(payload.translations.en.description, 'Tomato and spicy salami');
  assert.deepEqual(payload.ingredients, [
    { name_it: 'Pomodoro', name_en: 'Tomato', included: true, removable: true, sort_order: 0 },
    { name_it: 'mozzarella', name_en: 'mozzarella', included: true, removable: true, sort_order: 1 },
    { name_it: 'salame piccante', name_en: 'spicy salami', included: true, removable: true, sort_order: 2 },
    { name_it: 'Olive', name_en: 'Olives', can_add: true, addition_price_cents: 100, max_quantity: 2, sort_order: 3 }
  ]);
  assert.equal(payload.price_cents, 1050);
  assert.equal('product_id' in payload, false);
  assert.equal('image_url' in payload, false);
});

test('una riga di ingredienti vuota non diventa un ingrediente senza nome', () => {
  const payload = menuProductPayload({
    name: 'Marinara', price: '7', ingredients: 'Pomodoro, , aglio,',
    additions: [{ name: '', price: '2' }], allergenIds: []
  });

  assert.deepEqual(payload.ingredients.map(row => row.name_it), ['Pomodoro', 'aglio']);
});
