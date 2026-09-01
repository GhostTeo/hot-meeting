// Come si sceglie cosa mostrare nel menu del cliente.
//
// La "pizza della settimana" e' un contrassegno su una pizza normale: non e' un
// prodotto nuovo, e' una pizza gia' in menu messa in cima in una sezione a
// parte. Il Creator la accende quando vuole, senza ricreare niente.

function availablePizzas(menu = []) {
  return (menu || []).filter(product => product.type === 'pizza' && product.available);
}

// Le pizze della settimana: contrassegnate e disponibili. Vanno in evidenza,
// in cima al menu.
export function weeklyPizzas(menu = []) {
  return availablePizzas(menu).filter(product => product.weekly === true);
}

// Le pizze normali: tutte le altre, cosi' quelle della settimana non compaiono
// due volte.
export function regularPizzas(menu = []) {
  return availablePizzas(menu).filter(product => product.weekly !== true);
}

const TIPO_PAROLE = { pizza: ['pizza', 'pizze'], drink: ['bibita', 'bibite', 'drink', 'bevanda', 'bevande'] };

// Le aggiunte che ogni pizza offre sempre: la doppia mozzarella e il doppio
// pomodoro. Il prezzo e' il valore di partenza; quando queste aggiunte vengono
// messe nel menu vero, il prezzo scritto li' vince (vedi withDefaultAdditions).
export const DEFAULT_PIZZA_ADDITIONS = [
  { name: 'Doppia mozzarella', price: 2 },
  { name: 'Doppio pomodoro', price: 1 }
];

// Restituisce le aggiunte di una pizza con SEMPRE dentro doppia mozzarella e
// doppio pomodoro. Se il menu ne ha gia' una (magari con un prezzo diverso), si
// tiene quella e non si duplica. Le bibite non ne ricevono.
export function withDefaultAdditions(product = {}) {
  const additions = [...(product.additions ?? [])];
  if (product.type !== 'pizza') return additions;
  const presenti = new Set(additions.map(add => String(add?.name ?? '').trim().toLowerCase()));
  for (const predefinita of DEFAULT_PIZZA_ADDITIONS) {
    if (!presenti.has(predefinita.name.toLowerCase())) additions.push({ ...predefinita });
  }
  return additions;
}

// La ricerca del menu: si scrive qualsiasi cosa (nome, ingrediente, aggiunta, o
// "pizza"/"bibita") e restano i prodotti che la contengono. Serve al Creator per
// arrivare subito a quello da modificare senza scorrere tutto.
export function filterMenu(menu = [], query = '') {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return [...(menu || [])];
  return (menu || []).filter(product => {
    const pezzi = [
      product.name,
      product.names?.it, product.names?.en,
      ...(product.ingredients ?? []),
      ...((product.additions ?? []).map(add => add?.name)),
      ...(TIPO_PAROLE[product.type] ?? [])
    ];
    return pezzi.filter(Boolean).some(pezzo => String(pezzo).toLowerCase().includes(q));
  });
}
