// Apre un pagamento Stripe per un ordine gia' esistente.
//
// Il cliente conferma l'ordine sul sito, il sito chiama questa funzione con
// l'id dell'ordine e il suo gettone, la funzione legge dal database il totale
// GIA' calcolato (non si fida di nessun numero che arriva dal browser), apre una
// sessione di pagamento su Stripe e restituisce l'indirizzo a cui mandare il
// cliente. La chiave segreta di Stripe vive qui, come segreto della funzione, e
// non tocca mai il browser.

import Stripe from 'https://esm.sh/stripe@16?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkoutAmount, righeStripe, righeCorrenti, totaleRighe, stripeConfigurato } from '../_shared/stripe-logic.js';

const env = Deno.env.toObject();

const cors = {
  'Access-Control-Allow-Origin': env.SITE_ORIGIN ?? '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function risposta(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  // Finche' non ci sono le chiavi (e l'indirizzo del sito, che serve per
  // tornare indietro dopo il pagamento), si risponde onestamente invece di fingere.
  if (!stripeConfigurato(env) || !env.SITE_ORIGIN) {
    return risposta({ error: 'Pagamento online non ancora attivo.' }, 503);
  }

  try {
    const { order_id, request_token } = await req.json();
    if (typeof order_id !== 'string' || typeof request_token !== 'string') {
      return risposta({ error: 'Ordine non trovato.' }, 404);
    }
    const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    // Si rilegge l'ordine dal database, e solo con il suo gettone: e' la prova
    // di essere chi l'ha appena fatto. Il totale e' quello che ha deciso il
    // server, non quello che dice il browser: la somma delle righe dell'ULTIMA
    // revisione (un ordine corretto dal locale non si paga due volte).
    const { data: ordine } = await admin
      .from('orders')
      .select('id, sequence, payment_status, stripe_session_id, order_items(revision, product_name_snapshot, quantity, total_price_cents)')
      .eq('id', order_id)
      .eq('client_request_token', request_token)
      .single();

    if (!ordine) return risposta({ error: 'Ordine non trovato.' }, 404);
    if (ordine.payment_status === 'paid') return risposta({ error: 'Ordine gia pagato.' }, 409);

    const righe = righeCorrenti(ordine.order_items ?? []);
    const dati = { id: ordine.id, items: righe, total_cents: totaleRighe(righe) };
    checkoutAmount(dati); // rifiuta un ordine senza totale prima di aprire nulla

    const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });

    // Una sessione sola per volta: se il cliente aveva gia' aperto il
    // pagamento e non l'ha concluso, quella vecchia si chiude, cosi' non puo'
    // pagare su una scheda che il database non collega piu' all'ordine.
    if (ordine.stripe_session_id) {
      try {
        const precedente = await stripe.checkout.sessions.retrieve(ordine.stripe_session_id);
        if (precedente?.status === 'open') await stripe.checkout.sessions.expire(ordine.stripe_session_id);
      } catch {
        // Una sessione vecchia che non si trova piu' non blocca quella nuova.
      }
    }

    const sessione = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: righeStripe(dati),
      metadata: { order_id: ordine.id },
      success_url: `${env.SITE_ORIGIN}/?pagato=${ordine.id}`,
      cancel_url: `${env.SITE_ORIGIN}/?annullato=${ordine.id}`
    });

    const { error } = await admin.rpc('attach_checkout_session', { p_order_id: ordine.id, p_session_id: sessione.id });
    if (error) {
      try { await stripe.checkout.sessions.expire(sessione.id); } catch { /* si e' gia' chiusa */ }
      return risposta({ error: 'Pagamento non avviato.' }, 500);
    }

    return risposta({ url: sessione.url });
  } catch (errore) {
    // Il motivo vero resta nei log della funzione: al browser una frase sola.
    console.error('create-checkout', errore);
    return risposta({ error: 'Pagamento non avviato.' }, 500);
  }
});
