// Il ponte fra il sito e Stripe.
//
// Non tocca soldi e non conosce chiavi segrete: chiede alla funzione sul server
// di aprire un pagamento e riceve l'indirizzo a cui mandare il cliente. Finche'
// quella funzione non e' configurata, il pagamento online resta spento e l'app
// se ne accorge da sola, senza fingere.

const WALLET = new Set(['apple_pay', 'google_pay', 'card']);

export function pagaOnline(scelta = {}, config = {}) {
  return Boolean(config.stripeEndpoint) && WALLET.has(scelta.paymentId);
}

export async function urlCheckout(order, config = {}, fetchImpl = fetch) {
  const risposta = await fetchImpl(config.stripeEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // La chiave pubblica identifica il progetto: la funzione la richiede come
      // qualsiasi altra chiamata a Supabase.
      apikey: config.supabaseAnonKey,
      Authorization: `Bearer ${config.supabaseAnonKey}`
    },
    body: JSON.stringify({ order_id: order.id, request_token: order.requestToken })
  });
  const dati = await risposta.json();
  if (!risposta.ok || !dati.url) {
    throw new Error(dati.error ?? 'Pagamento non avviato.');
  }
  return dati.url;
}
