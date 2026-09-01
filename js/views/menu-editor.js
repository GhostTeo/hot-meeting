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

import { translateToEnglish, translationCoverage } from '../translate-menu.js';
import { filterMenu } from '../menu-catalog.js';

function euro(value) {
  return Number(value || 0).toFixed(2);
}

function cents(value) {
  return Math.round(Number(String(value).replace(',', '.') || 0) * 100);
}

export function emptyDraft() {
  return {
    id: null, type: 'pizza', name: '', description: '', descriptionEn: '',
    price: '', available: true, weekly: false, sortOrder: 0, imageUrl: '',
    ingredients: '', additions: [], allergenIds: []
  };
}

export function draftFromProduct(product = {}) {
  return {
    id: product.databaseId ?? product.id ?? null,
    type: product.type ?? 'pizza',
    name: product.names?.it ?? product.name ?? '',
    description: product.descriptions?.it ?? '',
    descriptionEn: product.descriptions?.en ?? '',
    price: euro(product.price),
    available: product.available !== false,
    weekly: product.weekly === true,
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

// Una descrizione e' una frase, non un elenco: il vocabolario di cucina la
// traduce solo quando e' fatta di ingredienti. Se torna identica all'italiano
// vuol dire che non l'ha tradotta, e una frase italiana sotto la bandiera
// inglese e' peggio di nessuna frase. Chi vuole la scrive a mano.
export function englishDescription(draft = {}) {
  const scritta = String(draft.descriptionEn ?? '').trim();
  if (scritta) return scritta;
  const italiana = String(draft.description ?? '').trim();
  if (!italiana) return '';
  // Meno di questo e la frase resta mezza in italiano: meglio niente.
  return translationCoverage(italiana) >= 0.9 ? translateToEnglish(italiana) : '';
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
  // Il nome di una pizza e' un nome proprio: «Bufala» sul menu inglese resta
  // «Bufala», non diventa «Buffalo mozzarella». Una bibita invece si traduce,
  // perche' «Acqua naturale» a un inglese non dice niente.
  const nomeEn = (draft.type ?? 'pizza') === 'drink' ? translateToEnglish(nome) : nome;
  if (nomeEn) translations.en = { name: nomeEn, description: englishDescription(draft) };

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

const MENU_TABS = [
  { id: 'pizza', label: 'Pizze' },
  { id: 'drink', label: 'Bibite' },
  { id: 'ingredienti', label: 'Ingredienti' }
];

export function menuPanel(menu = [], draft = null, allergens = [], money = value => `${value}`, canUpload = false, query = '', tab = 'pizza', ingredients = []) {
  const tabAttiva = MENU_TABS.some(t => t.id === tab) ? tab : 'pizza';
  const cerca = tabAttiva === 'ingredienti' ? 'Cerca un ingrediente (es. salame piccante)…' : 'Cerca per nome o ingrediente…';
  const placeholderNuovo = tabAttiva === 'drink' ? '+ Nuova bibita' : '+ Nuova pizza';
  return `<h1>Menu</h1>
    <div class="menu-tabs">${MENU_TABS.map(t => `<button class="btn ${t.id === tabAttiva ? 'primary' : 'secondary'} menu-tab" data-tab="${t.id}">${t.label}</button>`).join('')}</div>
    ${tabAttiva === 'ingredienti'
      ? `<p class="editor-note">Prezzo e disponibilità di ogni ingrediente e aggiunta. Se togli la disponibilità, l'ingrediente sparisce da solo dalle pizze che lo contengono (es. salame piccante esaurito → via dalla Diavola).</p>`
      : `<div class="actions"><button class="btn primary" id="menu-new">${placeholderNuovo}</button></div>`}
    <div class="field menu-search-field"><input id="menu-search" type="search" value="${escapeHtml(query)}" placeholder="${cerca}" autocomplete="off"></div>
    <div class="grid" id="menu-list">${tabAttiva === 'ingredienti' ? ingredientCatalogList(ingredients, money, query) : menuList(menu, money, query, tabAttiva)}</div>
    ${draft ? menuEditor(draft, allergens, canUpload) : ''}`;
}

export function menuList(menu = [], money = value => `${value}`, query = '', tab = null) {
  const perTipo = tab ? (menu || []).filter(product => product.type === tab) : menu;
  const visibili = filterMenu(perTipo, query);
  if (!perTipo.length) return '<p>Nessun prodotto: creane uno.</p>';
  if (!visibili.length) return `<p>Nessun prodotto trovato per "${escapeHtml(String(query).trim())}".</p>`;
  return visibili.map(product => menuCard(product, money)).join('');
}

// La sezione Ingredienti del menu Creator: una riga per ingrediente con prezzo
// (dell'aggiunta) modificabile e disponibilità.
export function ingredientCatalogList(ingredients = [], money = value => `${value}`, query = '') {
  const q = String(query ?? '').trim().toLowerCase();
  const visibili = q ? (ingredients || []).filter(i => String(i.name ?? '').toLowerCase().includes(q)) : (ingredients || []);
  if (!ingredients.length) return '<p>Nessun ingrediente ancora. Compaiono da soli man mano che li usi nelle pizze.</p>';
  if (!visibili.length) return `<p>Nessun ingrediente trovato per "${escapeHtml(String(query).trim())}".</p>`;
  return visibili.map(ing => `<article class="card ingredient-card${ing.available === false ? ' ingredient-off' : ''}">
    <h2>${escapeHtml(ing.name ?? '')}</h2>
    <div class="ingredient-row">
      <label class="ingredient-price">Prezzo aggiunta €
        <input class="ingredient-price-input" data-id="${escapeHtml(String(ing.id))}" inputmode="decimal" value="${escapeHtml(euro(ing.price))}">
      </label>
      <button class="btn ${ing.available === false ? 'primary' : 'secondary'} ingredient-avail" data-id="${escapeHtml(String(ing.id))}">${ing.available === false ? 'Rimetti disponibile' : 'Segna esaurito'}</button>
    </div>
    ${ing.available === false ? '<p class="ingredient-note">Esaurito: non compare nelle pizze né come aggiunta.</p>' : ''}
  </article>`).join('');
}

function menuCard(product, money) {
  return `<article class="card menu-card">
    ${product.imageUrl ? `<img class="menu-thumb" src="${escapeHtml(product.imageUrl)}" alt="" loading="lazy">` : ''}
    <span class="pill">${escapeHtml(TYPE_LABELS[product.type] ?? product.type ?? '')}${product.available ? '' : ' · non disponibile'}${product.weekly ? ' · della settimana' : ''}</span>
    <h2>${escapeHtml(product.name ?? '')}</h2>
    <p>${escapeHtml((product.ingredients ?? []).join(', '))}</p>
    <p class="price">${money(Number(product.price ?? 0))}</p>
    <div class="actions">
      <button class="btn primary menu-edit" data-id="${escapeHtml(product.id)}">Modifica</button>
      <button class="btn secondary availability" data-id="${escapeHtml(product.id)}">${product.available ? 'Togli dal menu' : 'Rimetti nel menu'}</button>
      ${product.type === 'pizza' ? `<button class="btn secondary weekly-toggle" data-id="${escapeHtml(product.id)}">${product.weekly ? 'Togli dalla settimana' : 'Pizza della settimana'}</button>` : ''}
      <button class="btn secondary menu-delete" data-id="${escapeHtml(product.id)}">Elimina</button>
    </div>
  </article>`;
}

export function additionRow(row = {}, index = 0) {
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
    ${draft.description ? `<div class="field"><label>La stessa in inglese<input id="menu-desc-en" value="${escapeHtml(draft.descriptionEn || englishDescription(draft))}" placeholder="${escapeHtml(englishDescription(draft) || 'Scrivila tu: una frase intera il vocabolario non la sa tradurre')}"></label></div>
    <p class="editor-note">Gli ingredienti li traduciamo noi. Una frase scritta da te no: se la lasci vuota, il menu inglese mostra solo gli ingredienti.</p>` : ''}

    ${photoField(draft, canUpload)}

    <h3>Aggiunte a pagamento</h3>
    <div id="menu-add-rows">${(draft.additions ?? []).map(additionRow).join('')}</div>
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
