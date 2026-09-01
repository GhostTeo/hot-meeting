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

// Il numero della settimana ISO: serve a far ruotare la pizza della settimana
// una volta a settimana, sempre la stessa dentro la stessa settimana.
function weekNumber(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7) + d.getUTCFullYear() * 53;
}

// Se il Creator non ha contrassegnato nessuna pizza, ne scegliamo una noi a
// rotazione (una diversa ogni settimana), cosi' la sezione "Pizza della
// settimana" c'e' sempre. Se invece una e' gia' contrassegnata, non serve.
export function autoWeeklyPizza(menu = [], date = new Date()) {
  const disponibili = availablePizzas(menu);
  if (!disponibili.length) return null;
  if (disponibili.some(p => p.weekly === true)) return null;
  const ordinate = [...disponibili].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return ordinate[weekNumber(date) % ordinate.length];
}

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
// Deriva un catalogo di ingredienti dal menu (per la modalita' demo/locale,
// dove non c'e' la tabella ingredienti del database): raccoglie ingredienti
// inclusi e aggiunte da tutte le pizze, senza doppioni (per nome). Il prezzo e'
// quello dell'aggiunta se c'e', altrimenti 0; disponibili di default.
export function ingredientCatalog(menu = []) {
  const perNome = new Map();
  const aggiungi = (nome, price, isAddition) => {
    const chiave = String(nome ?? '').trim();
    if (!chiave) return;
    const k = chiave.toLowerCase();
    const esistente = perNome.get(k);
    if (!esistente) {
      perNome.set(k, { id: `local:${k}`, name: chiave, price: Number(price || 0), available: true });
    } else if (isAddition && Number(price || 0) > 0 && !esistente.price) {
      esistente.price = Number(price);
    }
  };
  for (const prodotto of menu || []) {
    if (prodotto.type !== 'pizza') continue;
    for (const nome of prodotto.ingredients ?? []) aggiungi(nome, 0, false);
    for (const add of prodotto.additions ?? []) aggiungi(add?.name, add?.price, true);
  }
  return [...perNome.values()].sort((a, b) => a.name.localeCompare(b.name));
}

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
