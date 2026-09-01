import test from 'node:test';
import assert from 'node:assert/strict';
import { weeklyPizzas, regularPizzas } from '../js/menu-catalog.js';

const menu = [
  { id: 'margherita', type: 'pizza', available: true, weekly: false },
  { id: 'diavola', type: 'pizza', available: true, weekly: true },
  { id: 'nascosta', type: 'pizza', available: false, weekly: true },
  { id: 'acqua', type: 'drink', available: true, weekly: false }
];

test('la pizza della settimana raccoglie solo le pizze contrassegnate e disponibili', () => {
  const settimana = weeklyPizzas(menu);
  assert.deepEqual(settimana.map(p => p.id), ['diavola']);
});

test('le pizze normali escludono quelle della settimana per non ripeterle', () => {
  const normali = regularPizzas(menu);
  assert.deepEqual(normali.map(p => p.id), ['margherita']);
});

test('senza pizze della settimana la sezione resta vuota e il menu e completo', () => {
  const soloNormali = menu.map(p => ({ ...p, weekly: false }));
  assert.equal(weeklyPizzas(soloNormali).length, 0);
  assert.deepEqual(regularPizzas(soloNormali).map(p => p.id), ['margherita', 'diavola']);
});

import { filterMenu } from '../js/menu-catalog.js';

const catalogo = [
  { id: 'diavola', type: 'pizza', name: 'Diavola', ingredients: ['pomodoro', 'mozzarella', 'salame piccante'], additions: [] },
  { id: 'margherita', type: 'pizza', name: 'Margherita', ingredients: ['pomodoro', 'mozzarella'], additions: [{ name: 'Doppia mozzarella' }] },
  { id: 'acqua', type: 'drink', name: 'Acqua naturale', ingredients: [], additions: [] }
];

test('la ricerca nel menu trova per nome', () => {
  assert.deepEqual(filterMenu(catalogo, 'diavo').map(p => p.id), ['diavola']);
});

test('la ricerca nel menu trova per ingrediente (es. salame piccante)', () => {
  assert.deepEqual(filterMenu(catalogo, 'salame').map(p => p.id), ['diavola']);
});

test('la ricerca nel menu trova per aggiunta e per tipo', () => {
  assert.deepEqual(filterMenu(catalogo, 'doppia mozzarella').map(p => p.id), ['margherita']);
  assert.deepEqual(filterMenu(catalogo, 'bibita').map(p => p.id), ['acqua']);
  assert.deepEqual(filterMenu(catalogo, 'pizza').map(p => p.id).sort(), ['diavola', 'margherita']);
});

test('una ricerca vuota restituisce tutto il menu', () => {
  assert.equal(filterMenu(catalogo, '').length, 3);
  assert.equal(filterMenu(catalogo, '   ').length, 3);
});

import { withDefaultAdditions, DEFAULT_PIZZA_ADDITIONS } from '../js/menu-catalog.js';

test('ogni pizza offre sempre doppia mozzarella e doppio pomodoro', () => {
  const diavola = { type: 'pizza', additions: [{ name: 'Cipolla', price: 1 }] };
  const nomi = withDefaultAdditions(diavola).map(a => a.name.toLowerCase());
  assert.ok(nomi.includes('doppia mozzarella'));
  assert.ok(nomi.includes('doppio pomodoro'));
  assert.ok(nomi.includes('cipolla'));
});

test('se una pizza ha gia doppia mozzarella non la duplichiamo', () => {
  const p = { type: 'pizza', additions: [{ name: 'doppia mozzarella', price: 2.5 }] };
  const doppie = withDefaultAdditions(p).filter(a => a.name.toLowerCase() === 'doppia mozzarella');
  assert.equal(doppie.length, 1);
  assert.equal(doppie[0].price, 2.5, 'tiene il prezzo gia impostato nel menu');
});

test('le bibite non ricevono le aggiunte di default', () => {
  const acqua = { type: 'drink', additions: [] };
  assert.deepEqual(withDefaultAdditions(acqua), []);
});

test('esistono due aggiunte di default con un prezzo', () => {
  assert.equal(DEFAULT_PIZZA_ADDITIONS.length, 2);
  for (const a of DEFAULT_PIZZA_ADDITIONS) assert.ok(a.price > 0);
});
