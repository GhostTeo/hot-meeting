// La bozza di una revisione: cosa diventera' l'ordine.
//
// Modificare un ordine gia' preso non e' cambiare un numero: il cliente
// richiama e dice «togliete il pomodoro e portate anche due birre». Serve poter
// togliere un ingrediente, aggiungerne uno, cambiare le quantita' e mettere
// dentro un prodotto che nell'ordine non c'era.
//
// Il prezzo definitivo lo rifa' il database durante la revisione: quello che si
// calcola qui serve solo a dire in anticipo quanto cambia, e a decidere se ci
// sara' un supplemento o un rimborso.

let contatore = 0;

function nuovaChiave() {
  contatore += 1;
  return `riga-${contatore}`;
}

function productFor(line, menu = []) {
  return menu.find(product => String(product.databaseId ?? product.id) === String(line.productId));
}

export function draftFromOrder(order = {}, menu = []) {
  return {
    orderId: order.id,
    sequence: order.sequence,
    originalTotal: Number(order.total ?? 0),
    lines: (order.items ?? []).map(item => ({
      key: nuovaChiave(),
      productId: item.productId,
      name: item.name ?? '',
      quantity: Number(item.quantity ?? 1),
      removed: [...(item.removedIngredientIds ?? [])].filter(Boolean),
      additions: Object.fromEntries((item.additions ?? [])
        .filter(addition => addition.id && Number(addition.quantity ?? 0) > 0)
        .map(addition => [addition.id, Number(addition.quantity)])),
      note: item.note ?? ''
    }))
  };
}

function mapLine(draft, key, cambia) {
  return { ...draft, lines: draft.lines.map(line => (line.key === key ? cambia(line) : line)) };
}

export function stepQuantity(draft, key, delta) {
  return mapLine(draft, key, line => ({ ...line, quantity: Math.max(0, Math.min(20, line.quantity + delta)) }));
}

export function toggleRemoved(draft, key, ingredientId) {
  return mapLine(draft, key, line => ({
    ...line,
    removed: line.removed.includes(ingredientId)
      ? line.removed.filter(id => id !== ingredientId)
      : [...line.removed, ingredientId]
  }));
}

export function stepAddition(draft, key, ingredientId, delta, menu = []) {
  return mapLine(draft, key, line => {
    const product = productFor(line, menu);
    const massimo = product?.additions?.find(addition => addition.id === ingredientId)?.maxQuantity ?? 2;
    const quantita = Math.max(0, Math.min(Number(massimo), (line.additions[ingredientId] ?? 0) + delta));
    const additions = { ...line.additions };
    if (quantita > 0) additions[ingredientId] = quantita;
    else delete additions[ingredientId];
    return { ...line, additions };
  });
}

export function setNote(draft, key, note) {
  return mapLine(draft, key, line => ({ ...line, note: String(note ?? '') }));
}

export function addLine(draft, product) {
  if (!product) return draft;
  return {
    ...draft,
    lines: [...draft.lines, {
      key: nuovaChiave(),
      productId: product.databaseId ?? product.id,
      name: product.name ?? '',
      quantity: 1,
      removed: [],
      additions: {},
      note: ''
    }]
  };
}

export function draftItems(draft = {}) {
  return (draft.lines ?? [])
    .filter(line => line.quantity > 0)
    .map(line => ({
      product_id: line.productId,
      quantity: line.quantity,
      note: line.note ?? '',
      changes: [
        ...line.removed.map(id => ({ type: 'removed', ingredient_id: id, quantity: 1 })),
        ...Object.entries(line.additions).map(([id, quantity]) => ({
          type: 'addition', ingredient_id: id, quantity
        }))
      ]
    }));
}

export function draftIsValid(draft = {}) {
  return draftItems(draft).length > 0;
}

// In centesimi finche' si somma: sommare euro con la virgola mobile lascia
// differenze da mezzo centesimo che poi si vedono sul resto.
export function draftTotal(draft = {}, menu = []) {
  const centesimi = (draft.lines ?? [])
    .filter(line => line.quantity > 0)
    .reduce((somma, line) => {
      const product = productFor(line, menu);
      const base = Math.round(Number(product?.price ?? 0) * 100);
      const extra = Object.entries(line.additions).reduce((totale, [id, quantity]) => {
        const prezzo = product?.additions?.find(addition => addition.id === id)?.price ?? 0;
        return totale + Math.round(Number(prezzo) * 100) * quantity;
      }, 0);
      return somma + (base + extra) * line.quantity;
    }, 0);
  return centesimi / 100;
}
