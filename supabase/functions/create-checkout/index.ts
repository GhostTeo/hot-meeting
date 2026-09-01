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
import { checkoutAmount, righeStripe, stripeConfigurato } from '../_shared/stripe-logic.js';

const env = Deno.env.toObject();

const cors = {
  'Access-Control-Allow-Origin': env.SITE_ORIGIN ?? '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  // Finche' non ci sono le chiavi, si risponde onestamente invece di fingere.
  if (!stripeConfigurato(env)) {
    return new Response(JSON.stringify({ error: 'Pagamento online non ancora attivo.' }), {
      status: 503, headers: { ...cors, 'Content-Type': 'application/json' }
    });
  }

  try {
    const { order_id, request_token } = await req.json();
    const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    // Si rilegge l'ordine dal database, e solo con il suo gettone: e' la prova
    // di essere chi l'ha appena fatto. Il totale e' quello che ha deciso il
    // server, non quello che dice il browser.
    const { data: ordine } = await admin
      .from('orders')
      .select('id, sequence, total_cents, payment_status, order_items(product_name_snapshot, quantity, total_price_cents)')
      .eq('id', order_id)
      .eq('client_request_token', request_token)
      .single();

    if (!ordine) {
      return new Response(JSON.stringify({ error: 'Ordine non trovato.' }), {
        status: 404, headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }
    if (ordine.payment_status === 'paid') {
      return new Response(JSON.stringify({ error: 'Ordine gia pagato.' }), {
        status: 409, headers: { ...cors, 'Content-Type': 'application/json' }
      });
    }

    const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });
    const dati = { ...ordine, items: ordine.order_items };
    checkoutAmount(dati); // rifiuta un ordine senza totale prima di aprire nulla

    const sessione = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: righeStripe(dati),
      metadata: { order_id: ordine.id },
      success_url: `${env.SITE_ORIGIN}/?pagato=${ordine.id}`,
      cancel_url: `${env.SITE_ORIGIN}/?annullato=${ordine.id}`
    });

    await admin.rpc('attach_checkout_session', { p_order_id: ordine.id, p_session_id: sessione.id });

    return new Response(JSON.stringify({ url: sessione.url }), {
      headers: { ...cors, 'Content-Type': 'application/json' }
    });
  } catch (errore) {
    return new Response(JSON.stringify({ error: String(errore?.message ?? errore) }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' }
    });
  }
});
