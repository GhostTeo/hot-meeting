// Editor del menu.
//
// Chi scrive il menu ha una pizzeria da mandare avanti: deve poter cambiare un
// prezzo in trenta secondi, in piedi, col telefono in mano. Quindi una lingua
// sola, gli ingredienti su una riga come si direbbero a voce, e nessun campo
// che il programma puo' compilare da solo.
//
// L'inglese lo mette il vocabolario di cucina (translate-menu.js). La foto
// viaggia separata dal resto del prodotto. La posizione nel menu la decide
// l'ordine di creazione.

import { translateToEnglish } from '../translate-menu.js';

function euro(value) {
  return Number(value || 0).toFixed(2);
}

function cents(value) {
  return Math.round(Number(String(value).replace(',', '.') || 0) * 100);
}

export function emptyDraft() {
  return {
    id: null, type: 'pizza', name: '', description: '',
    price: '', available: true, sortOrder: 0, imageUrl: '',
    ingredients: '', additions: [], allergenIds: []
  };
}

export function draftFromProduct(product = {}) {
  return {
    id: product.databaseId ?? product.id ?? null,
    type: product.type ?? 'pizza',
    name: product.names?.it ?? product.name ?? '',
    description: product.descriptions?.it ?? '',
    price: euro(product.price),
    available: product.available !== false,
    sortOrder: Number(product.sortOrder ?? 0),
    imageUrl: product.imageUrl ?? '',
    ingredients: (product.ingredients ?? []).join(', '),
    additions: (product.additions ?? []).map(addition => ({
      name: addition.name ?? '',
      price: euro(addition.price)
    })),
    allergenIds: [...(product.allergenIds ?? [])]
  };
}

function splitIngredients(value = '') {
  return String(value).split(/[,;\n]/).map(part => part.trim()).filter(Boolean);
}

function translatedRow(name, extra) {
  return { name_it: name, name_en: translateToEnglish(name), ...extra };
}

export function menuProductPayload(draft = {}) {
  const nome = String(draft.name ?? '').trim();
  const descrizione = String(draft.description ?? '').trim();
  const translations = { it: { name: nome, description: descrizione } };
  const nomeEn = translateToEnglish(nome);
  if (nomeEn) translations.en = { name: nomeEn, description: translateToEnglish(descrizione) };

  const payload = {
    product_type: draft.type ?? 'pizza',
    price_cents: cents(draft.price),
    available: draft.available !== false,
    sort_order: Number(draft.sortOrder ?? 0),
    translations,
    // L'ordine in cui sono scritti e' l'ordine in cui si leggono sul menu:
    // «pomodoro, mozzarella, basilico» non e' la stessa cosa alla rinfusa.
    ingredients: [
      ...splitIngredients(draft.ingredients).map(name =>
        translatedRow(name, { included: true, removable: true })),
      ...(draft.additions ?? [])
        .filter(row => String(row.name ?? '').trim())
        .map(row => translatedRow(String(row.name).trim(), {
          can_add: true,
          addition_price_cents: cents(row.price),
          max_quantity: 2
        }))
    ].map((row, index) => ({ ...row, sort_order: index })),
    allergen_ids: [...(draft.allergenIds ?? [])]
  };
  return draft.id ? { product_id: draft.id, ...payload } : payload;
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
}

const TYPE_LABELS = { pizza: 'Pizza', drink: 'Bibita' };

export function menuPanel(menu = [], draft = null, allergens = [], money = value => `${value}`, canUpload = false) {
  const senzaFoto = menu.filter(product => !product.imageUrl).length;
  return `<h1>Menu</h1>
    <div class="actions"><button class="btn primary" id="menu-new">+ Nuovo prodotto</button></div>
    ${senzaFoto ? `<p class="editor-note">${senzaFoto} senza foto: nel menu compaiono con uno sfondo colorato al posto dell'immagine.</p>` : ''}
    <div class="grid">${menu.map(product => menuCard(product, money)).join('') || '<p>Nessun prodotto: creane uno.</p>'}</div>
    ${draft ? menuEditor(draft, allergens, canUpload) : ''}`;
}

function menuCard(product, money) {
  return `<article class="card menu-card">
    ${product.imageUrl ? `<img class="menu-thumb" src="${escapeHtml(product.imageUrl)}" alt="" loading="lazy">` : ''}
    <span class="pill">${escapeHtml(TYPE_LABELS[product.type] ?? product.type ?? '')}${product.available ? '' : ' · non disponibile'}</span>
    <h2>${escapeHtml(product.name ?? '')}</h2>
    <p>${escapeHtml((product.ingredients ?? []).join(', '))}</p>
    <p class="price">${money(Number(product.price ?? 0))}</p>
    <div class="actions">
      <button class="btn primary menu-edit" data-id="${escapeHtml(product.id)}">Modifica</button>
      <button class="btn secondary availability" data-id="${escapeHtml(product.id)}">${product.available ? 'Togli dal menu' : 'Rimetti nel menu'}</button>
      <button class="btn secondary menu-delete" data-id="${escapeHtml(product.id)}">Elimina</button>
    </div>
  </article>`;
}

function additionRow(row, index) {
  return `<div class="menu-add-row">
    <input class="menu-add-name" data-index="${index}" value="${escapeHtml(row.name ?? '')}" placeholder="Aggiunta (es. Olive)">
    <input class="menu-add-price" data-index="${index}" value="${escapeHtml(row.price ?? '')}" inputmode="decimal" placeholder="€">
    <button class="btn secondary menu-add-del" data-index="${index}">Togli</button>
  </div>`;
}

function menuEditor(draft, allergens, canUpload) {
  const anteprima = translateToEnglish(draft.name || '');
  return `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-label="Modifica menu">
    <div class="modal-head">
      <div><span class="eyebrow">${draft.id ? 'Modifica' : 'Nuovo prodotto'}</span><h2>${escapeHtml(draft.name || 'Senza nome')}</h2></div>
      <button class="btn secondary" id="menu-close">Chiudi</button>
    </div>

    <div class="menu-two">
      <div class="field"><label>Nome<input id="menu-name" value="${escapeHtml(draft.name)}" placeholder="Margherita"></label></div>
      <div class="field"><label>Prezzo in euro<input id="menu-price" value="${escapeHtml(draft.price)}" inputmode="decimal" placeholder="8.00"></label></div>
    </div>
    ${anteprima && anteprima !== draft.name ? `<p class="editor-note">In inglese: <b>${escapeHtml(anteprima)}</b> · tradotto in automatico</p>` : ''}

    <div class="field"><label>Ingredienti<input id="menu-ingredients" value="${escapeHtml(draft.ingredients)}" placeholder="Pomodoro, mozzarella, basilico"></label></div>
    <p class="editor-note">Separali con la virgola. L'inglese lo scriviamo noi.</p>

    <div class="field"><label>Descrizione (facoltativa)<input id="menu-desc" value="${escapeHtml(draft.description)}" placeholder="La nostra classica, con basilico fresco"></label></div>

    ${photoField(draft, canUpload)}

    <h3>Aggiunte a pagamento</h3>
    ${(draft.additions ?? []).map(additionRow).join('') || '<p><small>Nessuna.</small></p>'}
    <button class="btn secondary" id="menu-add-add">+ Aggiungi un extra</button>

    <h3>Allergeni</h3>
    <div class="menu-allergens">${allergens.map(allergen => `<label class="menu-check"><input type="checkbox" class="menu-allergen" value="${escapeHtml(allergen.id)}" ${(draft.allergenIds ?? []).includes(allergen.id) ? 'checked' : ''}> ${escapeHtml(allergen.it)}</label>`).join('')}</div>
    <p class="editor-note">Li dichiari tu: il programma non li deduce dagli ingredienti.</p>

    <div class="menu-two">
      <select id="menu-type" class="menu-select">${Object.entries(TYPE_LABELS).map(([value, label]) => `<option value="${value}" ${draft.type === value ? 'selected' : ''}>${label}</option>`).join('')}</select>
      <label class="menu-check"><input type="checkbox" id="menu-available" ${draft.available ? 'checked' : ''}> nel menu</label>
    </div>

    <button class="btn primary" id="menu-save">Salva</button>
  </section></div>`;
}

function photoField(draft, canUpload) {
  return `<h3>Foto</h3>
    <div class="menu-photo-row">
      ${draft.imageUrl
        ? `<img class="menu-photo-preview" src="${escapeHtml(draft.imageUrl)}" alt="">`
        : '<p><small>Nessuna foto.</small></p>'}
      <div style="flex:1;min-width:220px">
        ${canUpload ? '<div class="field"><label>Carica dal telefono<input type="file" id="menu-photo-file" accept="image/jpeg,image/png,image/webp"></label></div>' : ''}
        <div class="field"><label>Oppure un indirizzo https<input id="menu-photo-url" value="${escapeHtml(draft.imageUrl ?? '')}" placeholder="https://..."></label></div>
        ${draft.imageUrl ? '<button class="btn secondary" id="menu-photo-clear">Togli la foto</button>' : ''}
      </div>
    </div>`;
}
