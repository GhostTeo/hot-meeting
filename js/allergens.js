// Gli allergeni, in un posto solo.
//
// E' l'unica parte del menu che, sbagliata, manda qualcuno in ospedale: deve
// leggersi allo stesso modo sulla scheda del piatto, nel carrello, nella
// conferma, sulla ricevuta e sulla comanda in cucina. Per questo la traduzione
// e l'abbreviazione stanno qui e non ripetute in cinque file.
//
// Arrivano in tre forme diverse a seconda di dove passano: oggetto con le
// etichette di legge dal database, oggetto con le due lingue dal menu, semplice
// testo dai dati locali. Vanno lette tutte.

// La formula di legge e' giusta sull'etichetta, ma «Cereali contenenti glutine»
// dentro una riga di menu la rende illeggibile: qui la parola che si usa
// parlando, senza cambiarne il significato.
const BREVI = {
  it: {
    'cereali contenenti glutine': 'Glutine',
    'anidride solforosa e solfiti': 'Solfiti',
    'semi di sesamo': 'Sesamo'
  },
  en: {
    'cereals containing gluten': 'Gluten',
    'sulphur dioxide and sulphites': 'Sulphites',
    'sesame seeds': 'Sesame'
  }
};

function rawLabel(allergen, locale) {
  if (typeof allergen === 'string') return allergen.trim();
  if (!allergen || typeof allergen !== 'object') return '';
  const inglese = allergen.label_en ?? allergen.en ?? '';
  const italiano = allergen.label_it ?? allergen.it ?? '';
  return String((locale === 'en' ? inglese || italiano : italiano || inglese) ?? '').trim();
}

export function shortAllergen(allergen, locale = 'it') {
  const label = rawLabel(allergen, locale);
  if (!label) return '';
  return BREVI[locale === 'en' ? 'en' : 'it'][label.toLowerCase()] ?? label;
}

function dedup(allergens, locale, leggi) {
  const viste = new Set();
  const lista = [];
  for (const allergen of allergens) {
    const nome = leggi(allergen, locale);
    if (!nome || viste.has(nome.toLowerCase())) continue;
    viste.add(nome.toLowerCase());
    lista.push(nome);
  }
  return lista;
}

// Al cliente si mostra l'etichetta di legge per intero: «Cereali contenenti
// glutine» dice qualcosa in piu' di «Glutine», e su un menu quella precisione
// e' dovuta.
export function allergenNames(allergens = [], locale = 'it') {
  return dedup(allergens, locale, rawLabel);
}

// In cucina invece conta il colpo d'occhio: la parola che si usa impastando.
export function allergenShortNames(allergens = [], locale = 'it') {
  return dedup(allergens, locale, shortAllergen);
}

// Il silenzio non e' un'informazione: se un piatto non dichiara allergeni lo
// deve dire, altrimenti chi legge non sa se e' sicuro o se manca il dato.
export function allergenSentence(allergens = [], locale = 'it') {
  const lista = Array.isArray(allergens) && typeof allergens[0] === 'string'
    ? allergens.filter(Boolean)
    : allergenNames(allergens, locale);
  if (!lista.length) return locale === 'en' ? 'No declared allergens' : 'Nessun allergene dichiarato';
  return `${locale === 'en' ? 'Allergens' : 'Allergeni'}: ${lista.join(', ')}`;
}
