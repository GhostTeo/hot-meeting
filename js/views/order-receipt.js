// Recap dell'ordine per il cliente.
// Serve a togliere ansia: dice quale numero ritirare, cosa arriva davvero,
// quali allergeni sono dichiarati e come contattare la pizzeria.

import { translate, translatePaymentMethod, translateProduct } from '../i18n.js';
import { allergenNames } from '../allergens.js';

export function buildPublicOrderCode(businessDate, sequence) {
  const [, month, day] = String(businessDate ?? '').split('-');
  return `${day ?? '--'}-${month ?? '--'} · #${String(sequence ?? 0).padStart(2, '0')}`;
}

function localizedIngredient(name, translations = [], locale) {
  const match = translations.find(entry => entry.it === name);
  return match ? translateProduct(match, locale) : name;
}

function recapItem(item, locale) {
  return {
    name: translateProduct(item.names ?? { it: item.name }, locale) || item.name || '',
    quantity: Number(item.quantity ?? 1),
    removed: (item.removed ?? []).map(name => localizedIngredient(name, item.ingredientNames, locale)),
    additions: (item.additions ?? [])
      .filter(addition => Number(addition.quantity ?? 0) > 0)
      .map(addition => `${addition.quantity}× ${translateProduct(addition.names ?? { it: addition.name }, locale)}`),
    note: item.note ?? '',
    allergens: allergenNames(item.allergenLabels ?? item.allergens ?? [], locale)
  };
}

export function buildCustomerRecap(order, { locale = 'it', pizzeriaPhone = null } = {}) {
  const minutes = order.readyAt && order.createdAt
    ? Math.max(0, Math.round((Number(order.readyAt) - Number(order.createdAt)) / 60000))
    : null;
  return {
    id: order.id,
    code: buildPublicOrderCode(order.businessDate, order.sequence),
    customer: order.customer ?? '',
    phone: order.phone ?? '',
    email: order.email || null,
    payment: order.paymentMethod ? translatePaymentMethod(order.paymentMethod, locale) : (order.payment ?? ''),
    total: Number(order.total ?? 0),
    minutes,
    pizzeriaPhone: pizzeriaPhone || null,
    items: (order.items ?? []).map(item => recapItem(item, locale))
  };
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
}

export function orderReceiptPanel(recap, locale = 'it', money = value => `${value}`) {
  const t = key => escapeHtml(translate(key, locale));
  return `<section class="receipt card">
    <span class="eyebrow">${t('recap.title')}</span>
    <div class="receipt-code">${escapeHtml(recap.code)}</div>
    ${recap.minutes === null ? '' : `<p>${t('recap.ready')} <b>${recap.minutes} ${t('status.minutes')}</b></p>`}
    ${recap.items.map(item => `<div class="receipt-item">
      <b>${item.quantity}× ${escapeHtml(item.name)}</b>
      ${item.removed.length ? `<br><small>${t('cart.without')}: ${escapeHtml(item.removed.join(', '))}</small>` : ''}
      ${item.additions.length ? `<br><small>${escapeHtml(item.additions.join(', '))}</small>` : ''}
      ${item.note ? `<br><small class="receipt-note">${t('recap.note')}: ${escapeHtml(item.note)}</small>` : ''}
      ${item.allergens.length ? `<br><small>${t('recap.allergens')}: ${escapeHtml(item.allergens.join(', '))}</small>` : ''}
    </div>`).join('')}
    <p>${t('recap.payment')}: ${escapeHtml(recap.payment)}</p>
    <p class="receipt-total">${t('recap.total')} <b>${money(recap.total)}</b></p>
    ${recap.pizzeriaPhone ? `<p>${t('recap.contact')} <a href="tel:${escapeHtml(recap.pizzeriaPhone.replace(/\s/g, ''))}">${escapeHtml(recap.pizzeriaPhone)}</a></p>` : `<p>${t('recap.contact')}</p>`}
    <div class="actions">
      <button class="btn secondary" id="recap-sms">${t('recap.sendSms')}</button>
      ${recap.email ? `<button class="btn secondary" id="recap-email">${t('recap.sendEmail')}</button>` : ''}
      <button class="btn primary" id="recap-new">${t('recap.newOrder')}</button>
    </div>
    <p class="receipt-demo">${t('recap.demo')}</p>
  </section>`;
}
