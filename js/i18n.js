// Italiano e inglese per la vista cliente.
// L'italiano e' la lingua sorgente: se una traduzione inglese manca, si mostra
// l'italiano invece di lasciare un buco. Le etichette dei 14 allergeni UE non
// passano di qui: arrivano gia' tradotte dal database.

export const LOCALES = ['it', 'en'];

const DICTIONARY = {
  it: {
    'app.tagline': 'Pizza calda, senza attese inutili',
    'app.headline': 'Il tuo incontro con la pizza.',
    'app.subtitle': 'Ordina online e ritira a Milano, Piola.',
    'status.open': 'Ordini aperti',
    'status.closed': 'Ordini al momento chiusi',
    'status.wait': 'Attesa indicativa',
    'status.minutes': 'minuti',
    'tabs.pizzas': 'Pizze',
    'tabs.drinks': 'Bibite',
    'tabs.cart': 'Carrello',
    'product.customize': 'Personalizza e aggiungi',
    'product.closed': 'Ordini chiusi',
    'product.drink': 'Fresca e dissetante',
    'cart.title': 'Il tuo ordine',
    'cart.close': 'Chiudi',
    'cart.empty': 'Il carrello è vuoto.',
    'cart.total': 'Totale',
    'cart.name': 'Nome',
    'cart.phone': 'Telefono',
    'cart.email': 'Email (facoltativa)',
    'cart.without': 'Senza',
    'cart.noNote': 'Nessuna nota',
    'cart.remove': 'Rimuovi',
    'cart.payment': 'Pagamento dimostrativo',
    'cart.confirm': 'Conferma ordine demo',
    'recap.title': 'Ordine confermato',
    'recap.code': 'Il tuo numero',
    'recap.ready': 'Pronto tra circa',
    'recap.payment': 'Pagamento',
    'recap.total': 'Totale',
    'recap.allergens': 'Allergeni',
    'recap.note': 'Nota',
    'recap.contact': 'Se qualcosa non va, chiama la pizzeria.',
    'recap.sendSms': 'Invia il riepilogo via messaggio',
    'recap.sendEmail': 'Invia il riepilogo via email',
    'recap.sent': 'Invio dimostrativo: nella versione finale il riepilogo arriva davvero.',
    'recap.newOrder': 'Fai un altro ordine',
    'recap.demo': 'Ordine dimostrativo: nessun pagamento reale è stato eseguito.',
    'payment.cash': 'Paga in cassa',
    'payment.apple_pay': 'Apple Pay · demo',
    'payment.google_pay': 'Google Pay · demo',
    'custom.title': 'Personalizza la tua pizza',
    'custom.included': 'Ingredienti inclusi',
    'custom.additions': 'Aggiunte',
    'custom.removed': 'TOLTO',
    'custom.kept': 'INCLUSO',
    'custom.allergens': 'Allergeni',
    'custom.none': 'nessuno dichiarato',
    'custom.note': 'Note per questa pizza',
    'custom.notePlaceholder': 'Es. allergia alle noci, celiaco, ben cotta…',
    'custom.add': 'Aggiungi al carrello',
    'allergens.warning': 'In caso di allergie o intolleranze scrivilo nelle note e contatta il locale. Può verificarsi contaminazione crociata.'
  },
  en: {
    'app.tagline': 'Hot pizza, no pointless waiting',
    'app.headline': 'Your meeting with pizza.',
    'app.subtitle': 'Order online and pick up in Milan, Piola.',
    'status.open': 'Orders open',
    'status.closed': 'Orders currently closed',
    'status.wait': 'Estimated wait',
    'status.minutes': 'minutes',
    'tabs.pizzas': 'Pizzas',
    'tabs.drinks': 'Drinks',
    'tabs.cart': 'Cart',
    'product.customize': 'Customise and add',
    'product.closed': 'Orders closed',
    'product.drink': 'Cold and refreshing',
    'cart.title': 'Your order',
    'cart.close': 'Close',
    'cart.empty': 'Your cart is empty.',
    'cart.total': 'Total',
    'cart.name': 'Name',
    'cart.phone': 'Phone',
    'cart.email': 'Email (optional)',
    'cart.without': 'Without',
    'cart.noNote': 'No note',
    'cart.remove': 'Remove',
    'cart.payment': 'Demo payment',
    'cart.confirm': 'Confirm demo order',
    'recap.title': 'Order confirmed',
    'recap.code': 'Your number',
    'recap.ready': 'Ready in about',
    'recap.payment': 'Payment',
    'recap.total': 'Total',
    'recap.allergens': 'Allergens',
    'recap.note': 'Note',
    'recap.contact': 'If anything is wrong, call the pizzeria.',
    'recap.sendSms': 'Send the summary by message',
    'recap.sendEmail': 'Send the summary by email',
    'recap.sent': 'Demo send: in the final version the summary really arrives.',
    'recap.newOrder': 'Place another order',
    'recap.demo': 'Demo order: no real payment was taken.',
    'payment.cash': 'Pay at the counter',
    'payment.apple_pay': 'Apple Pay · demo',
    'payment.google_pay': 'Google Pay · demo',
    'custom.title': 'Customise your pizza',
    'custom.included': 'Included ingredients',
    'custom.additions': 'Extras',
    'custom.removed': 'REMOVED',
    'custom.kept': 'INCLUDED',
    'custom.allergens': 'Allergens',
    'custom.none': 'none declared',
    'custom.note': 'Note for this pizza',
    'custom.notePlaceholder': 'E.g. nut allergy, coeliac, well done…',
    'custom.add': 'Add to cart',
    'allergens.warning': 'If you have allergies or intolerances write it in the notes and contact the venue. Cross contamination may occur.'
  }
};

export function translate(key, locale = 'it') {
  return DICTIONARY[locale]?.[key] ?? DICTIONARY.it[key] ?? key;
}

export function translatePaymentMethod(methodId, locale = 'it') {
  if (!methodId) return '';
  const key = `payment.${methodId}`;
  const label = translate(key, locale);
  return label === key ? methodId : label;
}

export function translateProduct(names = {}, locale = 'it') {
  return names[locale] || names.it || '';
}
