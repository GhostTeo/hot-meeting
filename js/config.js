// Configurazione pubblica del progetto Supabase di Hot Meeting.
// La chiave publishable e' pubblica per progettazione: la protezione reale
// sono le policy RLS, che negano all'anonimo ordini, telefoni, incassi ed
// eventi. Non inserire mai qui una chiave service-role o la password del
// database. Per un ambiente diverso, impostare globalThis.HOT_MEETING_CONFIG
// prima di caricare app.js.
// pizzeriaPhone compare nel recap del cliente. Va impostato col numero vero
// della pizzeria prima di aprire al pubblico: finche' resta null, il recap
// invita a contattare il locale senza mostrare un numero inventato.
export const appConfig = globalThis.HOT_MEETING_CONFIG ?? {
  mode: 'supabase',
  pizzeriaPhone: '0270600072',
  supabaseUrl: 'https://nzoqtfbvyhemclwmwyah.supabase.co',
  supabaseAnonKey: 'sb_publishable_jEkf-urcoWX9eozzebbrrw_OXnd4t45',
  // Indirizzo della funzione che apre il pagamento su Stripe. Finche' resta
  // vuoto, il pagamento online e' spento e si paga in cassa: si accende
  // incollando qui l'indirizzo della funzione, dopo aver messo le chiavi di
  // Stripe fra i segreti su Supabase (vedi docs/pagamenti-stripe.md).
  stripeEndpoint: '',
  // La porta blindata per gli ordini (vedi docs/sicurezza.md): l'indirizzo
  // della Edge Function «place-order» e la chiave PUBBLICA del sito di
  // Cloudflare Turnstile. Finche' restano vuoti, l'ordine va dritto al
  // database come sempre; con tutti e due, passa dal captcha e dai limiti per
  // indirizzo.
  orderEndpoint: '',
  turnstileSiteKey: ''
};
