// L'inglese del menu, senza doverlo scrivere.
//
// Non e' un traduttore automatico ed e' voluto: un traduttore generico
// trasformerebbe la Diavola in «Devil» e la Capricciosa in «Capricious». Su un
// menu i nomi delle pizze non si traducono, gli ingredienti si': quindi qui c'e'
// un vocabolario di cucina, e cio' che non conosce lo lascia in italiano invece
// di inventarlo. Sbagliare in silenzio, su un menu, e' peggio che non tradurre.
//
// Chi scrive puo' sempre correggere a mano: l'inglese proposto e' un punto di
// partenza, non una decisione presa al posto suo.

const GLOSSARY = new Map(Object.entries({
  // Basi
  'pomodoro': 'tomato',
  'pomodorini': 'cherry tomatoes',
  'pomodorini gialli': 'yellow cherry tomatoes',
  'salsa di pomodoro': 'tomato sauce',
  'pomodoro san marzano': 'San Marzano tomato',
  'mozzarella': 'mozzarella',
  'fiordilatte': 'fiordilatte mozzarella',
  'mozzarella di bufala': 'buffalo mozzarella',
  'bufala': 'buffalo mozzarella',
  'burrata': 'burrata',
  'stracciatella': 'stracciatella',
  'ricotta': 'ricotta',
  'mascarpone': 'mascarpone',
  'provola': 'smoked provola',
  'provola affumicata': 'smoked provola',
  'scamorza': 'scamorza',
  'gorgonzola': 'gorgonzola',
  'taleggio': 'taleggio',
  'parmigiano': 'parmesan',
  'grana': 'grana padano',
  'pecorino': 'pecorino',
  'formaggio': 'cheese',
  'quattro formaggi': 'four cheeses',

  // Salumi e carne
  'prosciutto': 'ham',
  'prosciutto cotto': 'cooked ham',
  'prosciutto crudo': 'parma ham',
  'speck': 'speck',
  'bresaola': 'bresaola',
  'salame': 'salami',
  'salame piccante': 'spicy salami',
  'salamino': 'spicy salami',
  'nduja': 'nduja',
  'salsiccia': 'sausage',
  'pancetta': 'pancetta',
  'guanciale': 'guanciale',
  'mortadella': 'mortadella',
  'pollo': 'chicken',
  'wurstel': 'frankfurters',

  // Pesce
  'acciughe': 'anchovies',
  'alici': 'anchovies',
  'tonno': 'tuna',
  'gamberi': 'prawns',
  'frutti di mare': 'seafood',

  // Verdure
  'basilico': 'basil',
  'origano': 'oregano',
  'rucola': 'rocket',
  'funghi': 'mushrooms',
  'funghi porcini': 'porcini mushrooms',
  'champignon': 'button mushrooms',
  'carciofi': 'artichokes',
  'olive': 'olives',
  'olive nere': 'black olives',
  'olive taggiasche': 'taggiasca olives',
  'capperi': 'capers',
  'cipolla': 'onion',
  'cipolla di tropea': 'tropea onion',
  'cipolle': 'onions',
  'peperoni': 'peppers',
  'peperoncino': 'chilli',
  'melanzane': 'aubergines',
  'zucchine': 'courgettes',
  'fiori di zucca': 'courgette flowers',
  'patate': 'potatoes',
  'spinaci': 'spinach',
  'radicchio': 'radicchio',
  'mais': 'sweetcorn',
  'aglio': 'garlic',
  'friarielli': 'friarielli greens',
  'crema di zucca': 'pumpkin cream',
  'pesto': 'pesto',
  'noci': 'walnuts',
  'pistacchi': 'pistachios',
  'uovo': 'egg',
  'olio evo': 'extra virgin olive oil',
  'olio extravergine': 'extra virgin olive oil',
  'sale': 'salt',
  'pepe': 'pepper',

  // Bibite
  'acqua naturale': 'still water',
  'acqua frizzante': 'sparkling water',
  'acqua': 'water',
  'birra': 'beer',
  'birra artigianale': 'craft beer',
  'birra chiara': 'lager',
  'birra rossa': 'amber ale',
  'vino': 'wine',
  'vino rosso': 'red wine',
  'vino bianco': 'white wine',
  'aranciata': 'orangeade',
  'limonata': 'lemonade',
  'chinotto': 'chinotto',
  'cola': 'cola',
  'te freddo': 'iced tea',
  'succo': 'juice',
  'caffe': 'coffee',

  // Parole di servizio
  'senza': 'without',
  'con': 'with',
  'doppia': 'double',
  'doppio': 'double',
  'extra': 'extra',
  'fresco': 'fresh',
  'fresca': 'fresh',
  'a crudo': 'added raw',
  'in uscita': 'added after baking',
  'piccante': 'spicy',
  'affumicato': 'smoked',
  'affumicata': 'smoked',
  'classica': 'classic',
  'bianca': 'white base',
  'impasto': 'dough',
  'cotta': 'cooked',
  'crudo': 'raw'
}));

const CONNECTIVES = new Map(Object.entries({ e: 'and', ed: 'and', o: 'or', con: 'with', di: 'of', al: 'with', alla: 'with', ai: 'with', la: 'the', il: 'the' }));

function fold(value) {
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

function matchLongest(words) {
  // Prima le espressioni lunghe: «mozzarella di bufala» non e' «mozzarella» piu
  // «bufala», e tradotta a pezzi direbbe un'altra cosa.
  for (let length = Math.min(4, words.length); length >= 1; length -= 1) {
    const attempt = fold(words.slice(0, length).join(' '));
    if (GLOSSARY.has(attempt)) return { english: GLOSSARY.get(attempt), used: length };
  }
  return null;
}

function translateSegment(segment) {
  const words = segment.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return { text: '', known: 0, total: 0, matches: 0 };
  const output = [];
  let index = 0;
  let known = 0;
  let matches = 0;
  while (index < words.length) {
    const match = matchLongest(words.slice(index));
    if (match) {
      output.push(match.english);
      known += match.used;
      matches += 1;
      index += match.used;
      continue;
    }
    const connective = CONNECTIVES.get(fold(words[index]));
    if (connective) {
      // La congiunzione e' tradotta bene, ma da sola non e' una traduzione:
      // conta per la copertura, non per decidere se vale la pena tradurre.
      output.push(connective);
      known += 1;
      index += 1;
      continue;
    }
    output.push(words[index]);
    index += 1;
  }
  // Se non si e' riconosciuto nessun ingrediente, si lascia l'italiano intatto.
  const text = matches === 0 ? segment.trim() : output.join(' ');
  return { text, known, total: words.length, matches };
}

function translateParts(source) {
  return source.split(/([,;])/).map(part =>
    ([',', ';'].includes(part) ? { text: part, known: 0, total: 0, matches: 0 } : translateSegment(part)));
}

// Quanto della frase il vocabolario ha davvero riconosciuto, fra 0 e 1. Serve a
// non pubblicare mezze traduzioni: «White base, with sausage sbriciolata a
// mano» non e' inglese, e' un errore visibile sul menu.
export function translationCoverage(text = '') {
  const parts = translateParts(String(text ?? '').trim());
  const total = parts.reduce((sum, part) => sum + part.total, 0);
  if (!total) return 0;
  return parts.reduce((sum, part) => sum + part.known, 0) / total;
}

export function translateToEnglish(text = '') {
  const source = String(text ?? '').trim();
  if (!source) return '';
  const translated = translateParts(source)
    .map(part => part.text)
    .join('')
    .replace(/,(?=\S)/g, ', ')
    .trim();
  if (!translated) return source;
  // La maiuscola iniziale segue quella dell'italiano.
  const capitalize = /^[A-ZÀ-Þ]/.test(source);
  return capitalize
    ? translated.charAt(0).toUpperCase() + translated.slice(1)
    : translated.charAt(0).toLowerCase() + translated.slice(1);
}
