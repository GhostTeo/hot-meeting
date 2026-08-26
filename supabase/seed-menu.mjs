// Menu dimostrativo: una carta da pizzeria vera, per vedere l'app come la
// vedrebbe un cliente. Passa dalle stesse funzioni del pannello Creator, quindi
// se funziona questo funziona anche modificare a mano.
//
// Le foto sono segnaposto presi da Unsplash (licenza libera anche per uso
// commerciale) e vanno sostituite con le fotografie vere dei piatti: sono qui
// per far vedere come esce il menu, non per restare.
//
// Uso:
//   SUPABASE_EMAIL=... SUPABASE_PASSWORD=... node supabase/seed-menu.mjs
//
// La password non sta nel repository e non deve entrarci.

import { translateToEnglish } from '../js/translate-menu.js';

const URL = process.env.SUPABASE_URL ?? 'https://nzoqtfbvyhemclwmwyah.supabase.co';
const KEY = process.env.SUPABASE_ANON_KEY ?? 'sb_publishable_jEkf-urcoWX9eozzebbrrw_OXnd4t45';
const EMAIL = process.env.SUPABASE_EMAIL;
const PASSWORD = process.env.SUPABASE_PASSWORD;

const allergene = numero => `10000000-0000-4000-8000-${String(numero).padStart(12, '0')}`;
const GLUTINE = allergene(1);
const LATTE = allergene(7);
const PESCE = allergene(4);
const UOVA = allergene(3);
const SOLFITI = allergene(12);
const foto = id => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=900&q=70`;

const AGGIUNTE_CLASSICHE = [
  { name: 'Mozzarella di bufala', price: '2' },
  { name: 'Prosciutto cotto', price: '2' },
  { name: 'Funghi', price: '1.5' },
  { name: 'Olive', price: '1' }
];

const MENU = [
  {
    name: 'Marinara', price: '6.50', ingredients: 'Pomodoro, aglio, origano, olio evo',
    description: 'La piu semplice e la piu difficile: senza mozzarella, solo pomodoro e origano.',
    allergens: [GLUTINE], photo: '1571997478779-2adcbbe9ab2f',
    additions: [{ name: 'Fiordilatte', price: '1.5' }, ...AGGIUNTE_CLASSICHE.slice(2)]
  },
  {
    name: 'Margherita', price: '8.00', ingredients: 'Pomodoro, fiordilatte, basilico',
    description: 'Quella di sempre, con basilico fresco messo in uscita dal forno.',
    allergens: [GLUTINE, LATTE], photo: '1574071318508-1cdbab80d002',
    additions: AGGIUNTE_CLASSICHE
  },
  {
    name: 'Bufala', price: '11.00', ingredients: 'Pomodoro, mozzarella di bufala, basilico',
    description: 'Bufala campana aggiunta a crudo, cosi resta morbida.',
    allergens: [GLUTINE, LATTE], photo: '1571066811602-716837d681de',
    additions: [{ name: 'Prosciutto crudo', price: '2.5' }, { name: 'Rucola', price: '1' }]
  },
  {
    name: 'Diavola', price: '10.00', ingredients: 'Pomodoro, fiordilatte, salame piccante',
    description: 'Salame piccante di Calabria, per chi vuole sentire il fuoco.',
    allergens: [GLUTINE, LATTE], photo: '1534308983496-4fabb1a015ee',
    additions: [{ name: 'Nduja', price: '2.5' }, { name: 'Cipolla', price: '1' }, ...AGGIUNTE_CLASSICHE.slice(3)]
  },
  {
    name: 'Capricciosa', price: '12.00', ingredients: 'Pomodoro, fiordilatte, prosciutto cotto, funghi, carciofi, olive',
    description: 'Tutto quello che ci sta, messo bene.',
    allergens: [GLUTINE, LATTE], photo: '1604382354936-07c5d9983bd3',
    additions: [{ name: 'Uovo', price: '1.5' }]
  },
  {
    name: 'Quattro Formaggi', price: '12.00', ingredients: 'Fiordilatte, gorgonzola, taleggio, parmigiano',
    description: 'Quattro formaggi veri, niente crema pronta.',
    allergens: [GLUTINE, LATTE], photo: '1593504049359-74330189a345',
    additions: [{ name: 'Noci', price: '1.5' }, { name: 'Pere', price: '1.5' }]
  },
  {
    name: 'Napoli', price: '10.50', ingredients: 'Pomodoro, fiordilatte, acciughe, capperi, origano',
    description: 'Acciughe del Cantabrico e capperi di Pantelleria.',
    allergens: [GLUTINE, LATTE, PESCE], photo: '1594007654729-407eedc4be65',
    additions: [{ name: 'Olive taggiasche', price: '1.5' }]
  },
  {
    name: 'Ortolana', price: '11.00', ingredients: 'Pomodoro, fiordilatte, melanzane, zucchine, peperoni',
    description: 'Verdure grigliate al momento, mai sott olio.',
    allergens: [GLUTINE, LATTE], photo: '1565299624946-b28f40a0ae38',
    additions: [{ name: 'Fiori di zucca', price: '2' }]
  },
  {
    name: 'Boscaiola', price: '12.50', ingredients: 'Fiordilatte, salsiccia, funghi porcini',
    description: 'Bianca, con salsiccia sbriciolata a mano e porcini.',
    allergens: [GLUTINE, LATTE], photo: '1613564834361-9436948817d1',
    additions: [{ name: 'Provola affumicata', price: '2' }]
  },
  {
    name: 'Crudo e Burrata', price: '14.00', ingredients: 'Pomodorini, burrata, prosciutto crudo, rucola',
    description: 'Fuori dal forno si aggiunge tutto a crudo: burrata, crudo e rucola.',
    allergens: [GLUTINE, LATTE], photo: '1593560708920-61dd98c46a4e',
    additions: [{ name: 'Pistacchi', price: '2' }]
  },
  {
    name: 'Tonno e Cipolla', price: '11.50', ingredients: 'Pomodoro, fiordilatte, tonno, cipolla di Tropea',
    description: 'Cipolla rossa dolce, tonno a pezzi interi.',
    allergens: [GLUTINE, LATTE, PESCE], photo: '1513104890138-7c749659a591',
    additions: [{ name: 'Olive nere', price: '1' }]
  },
  {
    name: 'Vegetariana', price: '11.00', ingredients: 'Pomodorini, spinaci, ricotta, olio evo',
    description: 'Senza carne e senza pesce, con ricotta fresca.',
    allergens: [GLUTINE, LATTE], photo: '1555072956-7758afb20e8f',
    additions: [{ name: 'Pomodorini gialli', price: '1.5' }]
  }
];

const BIBITE = [
  { name: 'Acqua naturale', price: '2.00', description: 'Bottiglia da mezzo litro.', ingredients: '', allergens: [], photo: '1638688569176-5b6db19f9d2a' },
  { name: 'Acqua frizzante', price: '2.00', description: 'Bottiglia da mezzo litro.', ingredients: '', allergens: [], photo: '1638688569176-5b6db19f9d2a' },
  { name: 'Coca-Cola', price: '3.00', description: 'Bottiglia di vetro da 33 cl.', ingredients: '', allergens: [], photo: '1667450673236-62126ce038a8' },
  { name: 'Coca-Cola Zero', price: '3.00', description: 'Bottiglia di vetro da 33 cl.', ingredients: '', allergens: [], photo: '1534260164206-2a3a4a72891d' },
  { name: 'Fanta', price: '3.00', description: 'Bottiglia di vetro da 33 cl.', ingredients: '', allergens: [], photo: '1606411324897-1cfa6b9336e7' },
  { name: 'Sprite', price: '3.00', description: 'Bottiglia di vetro da 33 cl.', ingredients: '', allergens: [], photo: '1597906336500-757b42d34427' },
  { name: 'Birra chiara', price: '5.00', description: 'Spina da 0,4 litri.', ingredients: '', allergens: [GLUTINE, SOLFITI], photo: '1601912414323-0debc2271e40' },
  { name: 'Birra artigianale IPA', price: '6.00', description: 'Bottiglia da 33 cl, birrificio di Milano.', ingredients: '', allergens: [GLUTINE, SOLFITI], photo: '1558642891-54be180ea339' }
];

async function api(path, { method = 'POST', body, token } = {}) {
  const response = await fetch(`${URL}${path}`, {
    method,
    headers: {
      apikey: KEY,
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${path} → ${response.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

function payload(product, tipo, posizione, esistenti) {
  return {
    ...(esistenti.get(product.name.toLowerCase()) ? { product_id: esistenti.get(product.name.toLowerCase()) } : {}),
    product_type: tipo,
    price_cents: Math.round(Number(product.price) * 100),
    available: true,
    sort_order: posizione,
    // L'inglese lo mette lo stesso vocabolario del pannello Creator.
    translations: {
      it: { name: product.name, description: product.description ?? '' },
      en: {
        // Il nome di una pizza e' un nome proprio e resta com'e'; quello di una
        // bibita si traduce.
        name: tipo === 'drink' ? translateToEnglish(product.name) : product.name,
        description: translateToEnglish(product.description ?? '')
      }
    },
    ingredients: [
      ...String(product.ingredients ?? '').split(',').map(part => part.trim()).filter(Boolean)
        .map(name => ({ name_it: name, name_en: translateToEnglish(name), included: true, removable: true })),
      ...(product.additions ?? []).map(addition => ({
        name_it: addition.name, name_en: translateToEnglish(addition.name), can_add: true,
        addition_price_cents: Math.round(Number(addition.price) * 100), max_quantity: 2
      }))
    ].map((row, index) => ({ ...row, sort_order: index })),
    allergen_ids: product.allergens ?? []
  };
}

async function main() {
  if (!EMAIL || !PASSWORD) throw new Error('Servono SUPABASE_EMAIL e SUPABASE_PASSWORD');
  const auth = await api('/auth/v1/token?grant_type=password', { body: { email: EMAIL, password: PASSWORD } });
  const token = auth.access_token;

  const products = await api('/rest/v1/products?select=id,slug,product_translations(locale,name)', { method: 'GET', token });
  const esistenti = new Map(products.map(row => [
    (row.product_translations?.find(entry => entry.locale === 'it')?.name ?? row.slug).toLowerCase(),
    row.id
  ]));

  let posizione = 10;
  for (const [lista, tipo] of [[MENU, 'pizza'], [BIBITE, 'drink']]) {
    for (const product of lista) {
      const id = await api('/rest/v1/rpc/upsert_menu_product', {
        token, body: { payload: payload(product, tipo, posizione, esistenti) }
      });
      await api('/rest/v1/rpc/set_product_photo', {
        token, body: { p_product_id: id, p_image_url: foto(product.photo) }
      });
      console.log(`${product.name} → ${id}`);
      posizione += 10;
    }
  }

  // Cio' che c'era prima e non e' piu' in carta esce dal menu senza sparire
  // dallo storico degli ordini.
  const nomi = new Set([...MENU, ...BIBITE].map(product => product.name.toLowerCase()));
  for (const [nome, id] of esistenti) {
    if (nomi.has(nome)) continue;
    await api('/rest/v1/rpc/delete_menu_product', { token, body: { p_product_id: id } });
    console.log(`${nome} → tolto dalla carta`);
  }
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
