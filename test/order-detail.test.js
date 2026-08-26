import assert from 'node:assert/strict';
import test from 'node:test';

import { contactLinks, orderDetailPanel } from '../js/views/order-detail.js';

const ordine = {
  id: 'o1', sequence: 7, businessDate: '2026-08-25', source: 'WEB', status: 'preparing',
  customer: 'Marco Rossi', phone: '333 123 4567', email: 'marco@example.it',
  payment: 'Paga in cassa', total: 21,
  createdAt: Date.parse('2026-08-25T19:12:00'), readyAt: Date.parse('2026-08-25T19:29:00'),
  items: [{ quantity: 2, name: 'Diavola', removed: ['Basilico'], additions: [{ name: 'Olive', quantity: 1 }], note: 'Ben cotta' }]
};

test('il telefono si chiama con un tocco, l email si scrive con un tocco', () => {
  assert.deepEqual(contactLinks(ordine), {
    tel: 'tel:+393331234567',
    mail: 'mailto:marco@example.it'
  });
});

test('senza email non si inventa un collegamento vuoto', () => {
  assert.deepEqual(contactLinks({ ...ordine, email: '' }), { tel: 'tel:+393331234567', mail: null });
  assert.deepEqual(contactLinks({}), { tel: null, mail: null });
});

test('la scheda mostra numero, cliente, contatti, righe e totale', () => {
  const html = orderDetailPanel(ordine, value => `${value} EUR`);

  assert.ok(html.includes('#07'));
  assert.ok(html.includes('Marco Rossi'));
  assert.ok(html.includes('tel:+393331234567'));
  assert.ok(html.includes('mailto:marco@example.it'));
  assert.ok(html.includes('Diavola'));
  assert.ok(html.includes('SENZA Basilico'));
  assert.ok(html.includes('21 EUR'));
  assert.ok(html.includes('detail-edit'));
  assert.ok(html.includes('order-close'));
});
