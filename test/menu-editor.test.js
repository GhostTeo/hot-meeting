import assert from 'node:assert/strict';
import test from 'node:test';

import { draftFromProduct, emptyDraft, menuProductPayload } from '../js/views/menu-editor.js';

test('un prodotto esistente torna nella bozza con le due lingue', () => {
  const draft = draftFromProduct({
    databaseId: 'p1', type: 'pizza', price: 11, available: true, sortOrder: 3,
    names: { it: 'Bufala', en: 'Buffalo mozzarella' },
    ingredients: ['Pomodoro', 'Bufala'],
    ingredientNames: [{ it: 'Pomodoro', en: 'Tomato' }, { it: 'Bufala', en: 'Buffalo mozzarella' }],
    additions: [{ names: { it: 'Acciughe', en: 'Anchovies' }, price: 2, maxQuantity: 2 }],
    allergenIds: ['a1']
  });

  assert.equal(draft.id, 'p1');
  assert.equal(draft.nameIt, 'Bufala');
  assert.equal(draft.nameEn, 'Buffalo mozzarella');
  assert.equal(draft.price, '11.00');
  assert.deepEqual(draft.included, [
    { it: 'Pomodoro', en: 'Tomato', removable: true },
    { it: 'Bufala', en: 'Buffalo mozzarella', removable: true }
  ]);
  assert.deepEqual(draft.additions, [{ it: 'Acciughe', en: 'Anchovies', price: '2.00', max: 2 }]);
  assert.deepEqual(draft.allergenIds, ['a1']);
});

test('una bozza vuota parte da una pizza disponibile', () => {
  const draft = emptyDraft();

  assert.equal(draft.id, null);
  assert.equal(draft.type, 'pizza');
  assert.equal(draft.available, true);
  assert.deepEqual(draft.included, []);
  assert.equal(draft.imageUrl, '');
});

test('la foto viaggia nella bozza ma resta fuori dal payload del prodotto', () => {
  const draft = draftFromProduct({
    databaseId: 'p1', names: { it: 'Bufala' }, price: 11,
    imageUrl: 'https://cdn.example/bufala.jpg'
  });

  assert.equal(draft.imageUrl, 'https://cdn.example/bufala.jpg');
  // Prezzo e ingredienti cambiano insieme o niente; la foto no, ha una sua
  // strada. Il payload ha uno schema chiuso: una chiave in piu' e' un errore.
  assert.equal('image_url' in menuProductPayload(draft), false);
});

test('la bozza diventa il payload atteso dal database', () => {
  const payload = menuProductPayload({
    id: 'p1', type: 'pizza', nameIt: 'Diavola', nameEn: 'Spicy salami',
    descIt: 'Piccante', descEn: 'Hot', price: '10.50', available: false, sortOrder: 2,
    included: [{ it: 'Pomodoro', en: 'Tomato', removable: true }],
    additions: [{ it: 'Olive', en: 'Olives', price: '1.50', max: 3 }],
    allergenIds: ['a1', 'a2']
  });

  assert.deepEqual(payload, {
    product_id: 'p1',
    product_type: 'pizza',
    price_cents: 1050,
    available: false,
    sort_order: 2,
    translations: {
      it: { name: 'Diavola', description: 'Piccante' },
      en: { name: 'Spicy salami', description: 'Hot' }
    },
    ingredients: [
      { name_it: 'Pomodoro', name_en: 'Tomato', included: true, removable: true },
      { name_it: 'Olive', name_en: 'Olives', can_add: true, addition_price_cents: 150, max_quantity: 3 }
    ],
    allergen_ids: ['a1', 'a2']
  });
});

test('un prodotto nuovo non manda un identificativo inventato', () => {
  const payload = menuProductPayload({ ...emptyDraft(), nameIt: 'Acqua', price: '3' });

  assert.equal('product_id' in payload, false);
  assert.equal(payload.price_cents, 300);
});

test('senza traduzione inglese il payload non porta un inglese vuoto', () => {
  const payload = menuProductPayload({ ...emptyDraft(), nameIt: 'Marinara', price: '7' });

  assert.deepEqual(payload.translations, { it: { name: 'Marinara', description: '' } });
});

test('righe senza nome italiano vengono scartate invece di rompere il salvataggio', () => {
  const payload = menuProductPayload({
    ...emptyDraft(), nameIt: 'Margherita', price: '8',
    included: [{ it: 'Pomodoro', removable: true }, { it: '   ', removable: true }],
    additions: [{ it: '', price: '1', max: 1 }]
  });

  assert.deepEqual(payload.ingredients, [{ name_it: 'Pomodoro', included: true, removable: true }]);
});
