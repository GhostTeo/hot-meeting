// Ascolta Stripe e segna l'ordine pagato.
//
// Quando il cliente paga davvero, Stripe manda un messaggio qui. Prima di
// credergli si verifica la FIRMA del messaggio con il segreto del webhook:
// senza quella verifica, chiunque potrebbe far finta di essere Stripe e
// dichiarare pagato un ordine. Solo dopo la firma si segna «pagato», e solo se
// l'importo incassato e' esattamente il totale dell'ordine.
//
// Va pubblicata con `--no-verify-jwt`: Stripe non ha un gettone Supabase, la
// prova di identita' e' la firma.

import Stripe from 'https://esm.sh/stripe@16?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { esitoWebhook, importoCorrisponde, stripeConfigurato, totaleRighe } from '../_shared/stripe-logic.js';

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

    // L'importo incassato deve essere il totale dell'ordine di OGGI (ultima
    // revisione): se non torna, l'ordine non si segna pagato da solo e resta
    // da guardare a mano sul pannello di Stripe.
    const { data: ordine } = await admin
      .from('orders')
      .select('id, order_items(revision, total_price_cents)')
      .eq('id', esito.orderId ?? '')
      .maybeSingle();
    const totale = ordine ? totaleRighe(ordine.order_items ?? []) : null;
    if (totale !== null && !importoCorrisponde(esito.importo, totale)) {
      console.error('stripe-webhook: importo diverso dal totale', { order: esito.orderId, incassato: esito.importo, totale });
      return new Response('importo non corrispondente', { status: 200 });
    }

    // L'ordine si ritrova dalla sessione o, se quella e' stata sostituita nel
    // frattempo, dal suo id nei metadati. Se il database non risponde, a
    // Stripe si dice di riprovare (5xx): un pagamento vero non va perso.
    const { error } = await admin.rpc('mark_order_paid', { p_session_id: object.id, p_order_id: esito.orderId ?? null });
    if (error) {
      console.error('stripe-webhook: mark_order_paid', error);
      return new Response('riprova', { status: 500 });
    }
  }

  // A Stripe si risponde ok anche per i messaggi ignorati: se no li ripete
  // all'infinito.
  return new Response('ok', { status: 200 });
});
