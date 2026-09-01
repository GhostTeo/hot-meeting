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

import { autoWeeklyPizza } from '../js/menu-catalog.js';

test('se nessuna pizza e contrassegnata, ne sceglie una a rotazione per settimana', () => {
  const pizze = [
    { id: 'a', type: 'pizza', available: true },
    { id: 'b', type: 'pizza', available: true },
    { id: 'c', type: 'pizza', available: true }
  ];
  const s1 = autoWeeklyPizza(pizze, new Date('2026-09-01T12:00:00Z'));
  const s2 = autoWeeklyPizza(pizze, new Date('2026-09-08T12:00:00Z'));
  assert.ok(s1 && pizze.some(p => p.id === s1.id));
  assert.ok(s2 && pizze.some(p => p.id === s2.id));
  // deterministica: stessa settimana, stessa scelta
  assert.equal(autoWeeklyPizza(pizze, new Date('2026-09-02T20:00:00Z')).id, s1.id);
});

test('se una pizza e gia contrassegnata, l auto-scelta non serve (resta null)', () => {
  const pizze = [{ id: 'a', type: 'pizza', available: true, weekly: true }, { id: 'b', type: 'pizza', available: true }];
  assert.equal(autoWeeklyPizza(pizze, new Date('2026-09-01T12:00:00Z')), null);
});

import { ingredientCatalog } from '../js/menu-catalog.js';

test('il catalogo ingredienti raccoglie ingredienti e aggiunte da tutte le pizze, senza doppioni', () => {
  const menu = [
    { type: 'pizza', ingredients: ['Pomodoro', 'Mozzarella'], additions: [{ name: 'Salame piccante', price: 2 }] },
    { type: 'pizza', ingredients: ['Pomodoro', 'Basilico'], additions: [{ name: 'Bufala', price: 2.5 }] },
    { type: 'drink', ingredients: [], additions: [] }
  ];
  const cat = ingredientCatalog(menu);
  const nomi = cat.map(i => i.name);
  assert.deepEqual([...nomi].sort(), ['Basilico', 'Bufala', 'Mozzarella', 'Pomodoro', 'Salame piccante']);
  const salame = cat.find(i => i.name === 'Salame piccante');
  assert.equal(salame.price, 2);
  assert.equal(salame.available, true);
});
