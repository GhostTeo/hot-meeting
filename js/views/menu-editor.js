// Editor del menu.
// L'italiano e' obbligatorio, l'inglese facoltativo: una traduzione vuota non
// va mandata al database, altrimenti sovrascriverebbe con il nulla. I prezzi si
// gestiscono in centesimi verso il database e in euro nell'interfaccia.

function euro(value) {
  return Number(value || 0).toFixed(2);
}

function cents(value) {
  return Math.round(Number(String(value).replace(',', '.') || 0) * 100);
}

function localized(entry = {}, fallback = '') {
  return { it: entry.it ?? fallback, en: entry.en ?? '' };
}

export function emptyDraft() {
  return {
    id: null, type: 'pizza', nameIt: '', nameEn: '', descIt: '', descEn: '',
    price: '', available: true, sortOrder: 0, included: [], additions: [], allergenIds: []
  };
}

export function draftFromProduct(product = {}) {
  const names = product.names ?? { it: product.name ?? '' };
  const translations = product.ingredientNames ?? [];
  return {
    id: product.databaseId ?? product.id ?? null,
    type: product.type ?? 'pizza',
    nameIt: names.it ?? '',
    nameEn: names.en ?? '',
    descIt: product.descriptions?.it ?? '',
    descEn: product.descriptions?.en ?? '',
    price: euro(product.price),
    available: product.available !== false,
    sortOrder: Number(product.sortOrder ?? 0),
    included: (product.ingredients ?? []).map((name, index) => ({
      ...localized(translations[index], name),
      removable: true
    })),
    additions: (product.additions ?? []).map(addition => ({
      ...localized(addition.names, addition.name),
      price: euro(addition.price),
      max: Number(addition.maxQuantity ?? 1)
    })),
    allergenIds: [...(product.allergenIds ?? [])]
  };
}

function ingredientRows(draft) {
  const included = (draft.included ?? [])
    .filter(row => String(row.it ?? '').trim())
    .map(row => {
      const entry = { name_it: row.it.trim(), included: true, removable: row.removable !== false };
      if (String(row.en ?? '').trim()) entry.name_en = row.en.trim();
      return orderKeys(entry, ['name_it', 'name_en', 'included', 'removable']);
    });
  const additions = (draft.additions ?? [])
    .filter(row => String(row.it ?? '').trim())
    .map(row => {
      const entry = {
        name_it: row.it.trim(), can_add: true,
        addition_price_cents: cents(row.price),
        max_quantity: Math.min(10, Math.max(1, Number(row.max ?? 1)))
      };
      if (String(row.en ?? '').trim()) entry.name_en = row.en.trim();
      return orderKeys(entry, ['name_it', 'name_en', 'can_add', 'addition_price_cents', 'max_quantity']);
    });
  return [...included, ...additions];
}

function orderKeys(entry, order) {
  return Object.fromEntries(order.filter(key => key in entry).map(key => [key, entry[key]]));
}

export function menuProductPayload(draft) {
  const translations = { it: { name: String(draft.nameIt ?? '').trim(), description: String(draft.descIt ?? '').trim() } };
  if (String(draft.nameEn ?? '').trim()) {
    translations.en = { name: draft.nameEn.trim(), description: String(draft.descEn ?? '').trim() };
  }
  const payload = {
    product_type: draft.type ?? 'pizza',
    price_cents: cents(draft.price),
    available: draft.available !== false,
    sort_order: Number(draft.sortOrder ?? 0),
    translations,
    ingredients: ingredientRows(draft),
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

export function menuPanel(menu = [], draft = null, allergens = [], money = value => `${value}`) {
  return `<h1>Menu</h1>
    <div class="actions"><button class="btn primary" id="menu-new">+ Nuovo prodotto</button></div>
    <div class="grid">${menu.map(product => menuCard(product, money)).join('') || '<p>Nessun prodotto: creane uno.</p>'}</div>
    ${draft ? menuEditor(draft, allergens) : ''}`;
}

function menuCard(product, money) {
  const included = (product.ingredients ?? []).join(' · ');
  return `<article class="card">
    <span class="pill">${escapeHtml(TYPE_LABELS[product.type] ?? product.type ?? '')} · posizione ${Number(product.sortOrder ?? 0)}</span>
    <h2>${escapeHtml(product.name ?? '')}</h2>
    ${product.names?.en ? `<p><small>EN: ${escapeHtml(product.names.en)}</small></p>` : '<p><small>Nessuna traduzione inglese</small></p>'}
    ${included ? `<p><small>${escapeHtml(included)}</small></p>` : ''}
    <p>${money(Number(product.price ?? 0))}</p>
    <div class="actions">
      <button class="btn secondary availability" data-id="${escapeHtml(product.id)}">${product.available ? 'Disponibile' : 'Non disponibile'}</button>
      <button class="btn secondary menu-edit" data-id="${escapeHtml(product.id)}">Modifica</button>
      <button class="btn secondary menu-delete" data-id="${escapeHtml(product.id)}">Elimina</button>
    </div>
  </article>`;
}

function includedRow(row, index) {
  return `<div class="option-row menu-row">
    <input class="menu-inc-it" data-index="${index}" value="${escapeHtml(row.it ?? '')}" placeholder="Ingrediente (italiano)">
    <input class="menu-inc-en" data-index="${index}" value="${escapeHtml(row.en ?? '')}" placeholder="English (facoltativo)">
    <label class="menu-check"><input type="checkbox" class="menu-inc-rem" data-index="${index}" ${row.removable !== false ? 'checked' : ''}> si puo togliere</label>
    <button class="btn secondary menu-inc-del" data-index="${index}">Togli</button>
  </div>`;
}

function additionRow(row, index) {
  return `<div class="option-row menu-row">
    <input class="menu-add-it" data-index="${index}" value="${escapeHtml(row.it ?? '')}" placeholder="Aggiunta (italiano)">
    <input class="menu-add-en" data-index="${index}" value="${escapeHtml(row.en ?? '')}" placeholder="English (facoltativo)">
    <input class="menu-add-price" data-index="${index}" value="${escapeHtml(row.price ?? '')}" inputmode="decimal" placeholder="Prezzo">
    <input class="menu-add-max" data-index="${index}" value="${escapeHtml(String(row.max ?? 1))}" inputmode="numeric" placeholder="Max">
    <button class="btn secondary menu-add-del" data-index="${index}">Togli</button>
  </div>`;
}

function menuEditor(draft, allergens) {
  return `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-label="Modifica menu">
    <div class="modal-head">
      <div><span class="eyebrow">${draft.id ? 'Modifica prodotto' : 'Nuovo prodotto'}</span><h2>${escapeHtml(draft.nameIt || 'Senza nome')}</h2></div>
      <button class="btn secondary" id="menu-close">Chiudi</button>
    </div>
    <div class="field"><label>Tipo<select id="menu-type">${Object.entries(TYPE_LABELS).map(([value, label]) => `<option value="${value}" ${draft.type === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label></div>
    <div class="field"><label>Nome in italiano<input id="menu-name-it" value="${escapeHtml(draft.nameIt)}"></label></div>
    <div class="field"><label>Nome in inglese (facoltativo)<input id="menu-name-en" value="${escapeHtml(draft.nameEn)}"></label></div>
    <div class="field"><label>Descrizione in italiano<input id="menu-desc-it" value="${escapeHtml(draft.descIt)}"></label></div>
    <div class="field"><label>Descrizione in inglese (facoltativa)<input id="menu-desc-en" value="${escapeHtml(draft.descEn)}"></label></div>
    <div class="field"><label>Prezzo in euro<input id="menu-price" value="${escapeHtml(draft.price)}" inputmode="decimal"></label></div>
    <div class="field"><label>Posizione nel menu<input id="menu-sort" value="${escapeHtml(String(draft.sortOrder))}" inputmode="numeric"></label></div>
    <label class="menu-check"><input type="checkbox" id="menu-available" ${draft.available ? 'checked' : ''}> disponibile</label>

    <h3>Ingredienti inclusi</h3>
    ${(draft.included ?? []).map(includedRow).join('') || '<p><small>Nessuno.</small></p>'}
    <button class="btn secondary" id="menu-inc-add">+ Aggiungi ingrediente</button>

    <h3>Aggiunte possibili</h3>
    ${(draft.additions ?? []).map(additionRow).join('') || '<p><small>Nessuna.</small></p>'}
    <button class="btn secondary" id="menu-add-add">+ Aggiungi extra</button>

    <h3>Allergeni dichiarati</h3>
    <div class="menu-allergens">${allergens.map(allergen => `<label class="menu-check"><input type="checkbox" class="menu-allergen" value="${escapeHtml(allergen.id)}" ${(draft.allergenIds ?? []).includes(allergen.id) ? 'checked' : ''}> ${escapeHtml(allergen.it)}</label>`).join('')}</div>
    <p class="editor-note">Gli allergeni li dichiari tu: l'app non li deduce dagli ingredienti.</p>

    <button class="btn primary" id="menu-save">Salva il prodotto</button>
  </section></div>`;
}
