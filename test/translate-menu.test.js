import assert from 'node:assert/strict';
import test from 'node:test';

import { translateToEnglish } from '../js/translate-menu.js';

test('i nomi delle pizze restano quelli: una Diavola non e una Devil', () => {
  assert.equal(translateToEnglish('Margherita'), 'Margherita');
  assert.equal(translateToEnglish('Diavola'), 'Diavola');
  assert.equal(translateToEnglish('Quattro Stagioni'), 'Quattro Stagioni');
});

test('gli ingredienti si traducono, anche quelli composti', () => {
  assert.equal(translateToEnglish('Pomodoro'), 'Tomato');
  assert.equal(translateToEnglish('Prosciutto cotto'), 'Cooked ham');
  assert.equal(translateToEnglish('Mozzarella di bufala'), 'Buffalo mozzarella');
  assert.equal(translateToEnglish('Funghi'), 'Mushrooms');
});

test('una frase intera tiene virgole e congiunzioni', () => {
  assert.equal(
    translateToEnglish('Pomodoro, mozzarella e basilico'),
    'Tomato, mozzarella and basil'
  );
  assert.equal(
    translateToEnglish('Pomodoro, mozzarella, salame piccante'),
    'Tomato, mozzarella, spicy salami'
  );
});

test('cio che non e nel vocabolario resta in italiano invece di essere inventato', () => {
  assert.equal(translateToEnglish('Sfilacci di cavallo'), 'Sfilacci di cavallo');
  assert.equal(translateToEnglish(''), '');
});

test('la prima lettera segue quella della frase italiana', () => {
  assert.equal(translateToEnglish('pomodoro e mozzarella'), 'tomato and mozzarella');
  assert.equal(translateToEnglish('Pomodoro e mozzarella'), 'Tomato and mozzarella');
});
