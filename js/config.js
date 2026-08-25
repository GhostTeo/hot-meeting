// Configurazione pubblica del progetto Supabase di Hot Meeting.
// La chiave publishable e' pubblica per progettazione: la protezione reale
// sono le policy RLS, che negano all'anonimo ordini, telefoni, incassi ed
// eventi. Non inserire mai qui una chiave service-role o la password del
// database. Per un ambiente diverso, impostare globalThis.HOT_MEETING_CONFIG
// prima di caricare app.js.
export const appConfig = globalThis.HOT_MEETING_CONFIG ?? {
  mode: 'supabase',
  supabaseUrl: 'https://nzoqtfbvyhemclwmwyah.supabase.co',
  supabaseAnonKey: 'sb_publishable_jEkf-urcoWX9eozzebbrrw_OXnd4t45'
};
