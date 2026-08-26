// Cosa proporre prima di chiudere l'ordine.
//
// Chi ordina una pizza e niente da bere quasi sempre se ne accorge alla cassa:
// proporglielo qui gli fa comodo e fa bene all'incasso. Da bere per primo,
// perche' e' quello che manca davvero; poi un'altra pizza.
//
// Non si propone mai qualcosa che il locale non ha, e non si ripropone quello
// che e' gia' nel carrello: un suggerimento sbagliato e' rumore.

const MASSIMO = 3;

export function orderSuggestions(cart = [], menu = [], max = MASSIMO) {
  if (!cart.length) return [];
  const gia = new Set(cart.map(item => String(item.id)));
  const disponibili = menu.filter(product => product.available !== false && !gia.has(String(product.id)));
  const bevande = disponibili.filter(product => product.type === 'drink');
  const piatti = disponibili.filter(product => product.type !== 'drink');
  return [...bevande, ...piatti].slice(0, max);
}
