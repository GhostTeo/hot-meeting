// Il carrello raggruppato.
//
// Dentro, ogni pezzo e' una riga a se': serve, perche' due margherite possono
// avere modifiche diverse. Ma quattro cole identiche scritte quattro volte fanno
// sembrare lungo un ordine corto, e chi rilegge fatica a contarle.
//
// Qui si uniscono solo le righe davvero identiche: stesso prodotto, niente
// tolto, niente aggiunto, nessuna nota. Una pizza modificata resta separata,
// perche' non e' la stessa cosa.

function firma(item = {}) {
  const tolti = (item.removed ?? []).join('|');
  const aggiunte = (item.additions ?? [])
    .filter(addition => Number(addition.quantity ?? 0) > 0)
    .map(addition => `${addition.name}x${addition.quantity}`)
    .join('|');
  return [item.id, tolti, aggiunte, String(item.note ?? '').trim()].join('§');
}

export function isPlain(item = {}) {
  return !(item.removed ?? []).length
    && !(item.additions ?? []).some(addition => Number(addition.quantity ?? 0) > 0)
    && !String(item.note ?? '').trim();
}

export function groupCartLines(cart = []) {
  const righe = new Map();
  cart.forEach((item, index) => {
    const chiave = firma(item);
    const riga = righe.get(chiave) ?? { item, quantity: 0, total: 0, indexes: [] };
    riga.quantity += 1;
    riga.total += Number(item.price ?? 0);
    riga.indexes.push(index);
    righe.set(chiave, riga);
  });
  return [...righe.values()];
}

// Quante volte quel prodotto e' nel carrello cosi' com'e', senza modifiche:
// e' il numero da mostrare accanto al piu' e al meno di una proposta.
export function plainCartCount(cart = [], productId) {
  return cart.filter(item => String(item.id) === String(productId) && isPlain(item)).length;
}
