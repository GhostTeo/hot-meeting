// L'ordine passa dalla porta blindata, quando c'e'.
//
// Di norma il sito chiama direttamente la funzione del database. Se in
// config.js c'e' `orderEndpoint`, l'ordine passa invece dalla Edge Function
// «place-order», che prima di inoltrarlo al database controlla il captcha
// (Turnstile) e conta quanti ordini arrivano dallo stesso indirizzo: un
// programma che spara ordini finti si ferma li', prima di toccare la cucina.
// Gli errori tornano con le stesse parole del database, cosi' l'app li
// traduce come sempre.

export function ordineProtetto(config = {}, fetchImpl = fetch) {
  if (!config.orderEndpoint) return null;
  return async (payload, order = {}) => {
    const risposta = await fetchImpl(config.orderEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: config.supabaseAnonKey,
        Authorization: `Bearer ${config.supabaseAnonKey}`
      },
      body: JSON.stringify({ payload, turnstile_token: order.turnstileToken ?? null })
    });
    const dati = await risposta.json().catch(() => ({}));
    if (!risposta.ok) throw new Error(dati.error ?? 'Ordine non inviato.');
    return dati;
  };
}

export function captchaAttivo(config = {}) {
  return Boolean(config.orderEndpoint) && Boolean(config.turnstileSiteKey);
}
