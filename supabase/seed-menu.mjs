// Carica una carta intera nel menu, passando dalle stesse funzioni del pannello
// Creator: se funziona questo, funziona anche modificare a mano.
//
// La carta sta in `menu.json`, accanto a questo file: nome, prezzo, ingredienti
// separati da virgole, descrizione nelle due lingue, allergeni per nome e la
// foto. Per caricare un menu nuovo si riscrive quel file, non questo.
//
// Le foto sono segnaposto presi da Unsplash (licenza libera anche per uso
// commerciale) e vanno sostituite con le fotografie vere dei piatti: sono qui
// per far vedere come esce il menu, non per restare.
//
// Uso:
//   SUPABASE_EMAIL=... SUPABASE_PASSWORD=... node supabase/seed-menu.mjs
//
// La password non sta nel repository e non deve entrarci.

import { readFileSync } from 'node:fs';

import { translateToEnglish } from '../js/translate-menu.js';

const BASE = process.env.SUPABASE_URL ?? 'https://nzoqtfbvyhemclwmwyah.supabase.co';
const KEY = process.env.SUPABASE_ANON_KEY ?? 'sb_publishable_jEkf-urcoWX9eozzebbrrw_OXnd4t45';
const EMAIL = process.env.SUPABASE_EMAIL;
const PASSWORD = process.env.SUPABASE_PASSWORD;

const ALLERGENI = {
  glutine: 1, crostacei: 2, uova: 3, pesce: 4, arachidi: 5, soia: 6, latte: 7,
  'frutta a guscio': 8, sedano: 9, senape: 10, sesamo: 11, solfiti: 12,
  lupini: 13, molluschi: 14
};

function allergene(nome) {
  const numero = ALLERGENI[String(nome).toLowerCase()];
  if (!numero) throw new Error(`Allergene sconosciuto: ${nome}`);
  return `10000000-0000-4000-8000-${String(numero).padStart(12, '0')}`;
}

const foto = id => (String(id).startsWith('http')
  ? id
  : `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=800&q=62`);

const carta = JSON.parse(readFileSync(new URL('./menu.json', import.meta.url), 'utf8'));
const MENU = carta.pizze ?? [];
const BIBITE = carta.bibite ?? [];

async function api(path, { method = 'POST', body, token } = {}) {
  const response = await fetch(`${BASE}${path}`, {
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
        // Una frase intera il vocabolario non la sa tradurre: qui l'inglese e'
        // scritto a mano, come lo scriverebbe la pizzeria.
        description: product.descriptionEn ?? ''
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
    allergen_ids: (product.allergens ?? []).map(allergene)
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
      // La foto si mette solo se e' indicata: il menu vero resta senza foto
      // finte finche' non arrivano quelle vere dei piatti.
      if (product.photo) {
        await api('/rest/v1/rpc/set_product_photo', {
          token, body: { p_product_id: id, p_image_url: foto(product.photo) }
        });
      }
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
