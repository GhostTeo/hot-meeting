import assert from 'node:assert/strict';
import test from 'node:test';

import { allergenNames, allergenSentence, allergenShortNames, shortAllergen } from '../js/allergens.js';

// Gli allergeni arrivano in tre forme diverse a seconda di dove passano: dal
// database come oggetto con le due lingue, dallo snapshot dell'ordine come
// oggetto con le etichette di legge, dai dati locali come semplice testo.
// Ovunque devono restare leggibili: e' l'unica parte del menu che, sbagliata,
// manda qualcuno in ospedale.

test('legge l allergene in tutte le forme in cui arriva', () => {
  assert.equal(shortAllergen('Cereali contenenti glutine'), 'Glutine');
  assert.equal(shortAllergen({ label_it: 'Cereali contenenti glutine', label_en: 'Cereals containing gluten' }), 'Glutine');
  assert.equal(shortAllergen({ it: 'Latte', en: 'Milk' }), 'Latte');
  assert.equal(shortAllergen({}), '');
});

test('in inglese accorcia l inglese, non l italiano', () => {
  const glutine = { label_it: 'Cereali contenenti glutine', label_en: 'Cereals containing gluten' };

  assert.equal(shortAllergen(glutine, 'en'), 'Gluten');
  assert.equal(shortAllergen({ it: 'Anidride solforosa e solfiti', en: 'Sulphur dioxide and sulphites' }, 'en'), 'Sulphites');
});

test('un elenco resta un elenco, senza vuoti e senza doppioni', () => {
  const righe = [{ label_it: 'Cereali contenenti glutine' }, 'Latte', { label_it: 'Latte' }, {}];

  // Al cliente l'etichetta di legge per intero, in cucina la parola corta.
  assert.deepEqual(allergenNames(righe), ['Cereali contenenti glutine', 'Latte']);
  assert.deepEqual(allergenShortNames(righe), ['Glutine', 'Latte']);
});

test('la frase per il cliente dice sempre qualcosa, anche quando non ci sono allergeni', () => {
  assert.equal(allergenSentence(['Latte'], 'it'), 'Allergeni: Latte');
  assert.equal(allergenSentence([], 'it'), 'Nessun allergene dichiarato');
  assert.equal(allergenSentence([], 'en'), 'No declared allergens');
});
