// Ascolta Stripe e segna l'ordine pagato.
//
// Quando il cliente paga davvero, Stripe manda un messaggio qui. Prima di
// credergli si verifica la FIRMA del messaggio con il segreto del webhook:
// senza quella verifica, chiunque potrebbe far finta di essere Stripe e
// dichiarare pagato un ordine. Solo dopo la firma si segna «pagato».

import Stripe from 'https://esm.sh/stripe@16?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { esitoWebhook, stripeConfigurato } from '../_shared/stripe-logic.js';

const env = Deno.env.toObject();

Deno.serve(async (req) => {
  if (!stripeConfigurato(env)) return new Response('Pagamenti non attivi', { status: 503 });

  const firma = req.headers.get('stripe-signature') ?? '';
  const corpo = await req.text();
  const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });

  let evento;
  try {
    evento = await stripe.webhooks.constructEventAsync(corpo, firma, env.STRIPE_WEBHOOK_SECRET);
  } catch {
    // Firma sbagliata: non e' Stripe. Si chiude senza toccare niente.
    return new Response('Firma non valida', { status: 400 });
  }

  const esito = esitoWebhook(evento);
  if (esito.azione === 'segna-pagato') {
    const object = evento.data.object;
    const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
    await admin.rpc('mark_order_paid', { p_session_id: object.id });
  }

  // A Stripe si risponde sempre ok, anche per i messaggi ignorati: se no li
  // ripete all'infinito.
  return new Response('ok', { status: 200 });
});
