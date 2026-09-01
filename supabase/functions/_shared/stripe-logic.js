// La logica di Stripe, staccata da Stripe stesso.
//
// Qui non si parla con nessun server: si decide solo cosa mandare e come
// leggere la risposta. Cosi' si puo' provare senza chiavi e senza soldi veri, e
// la regola d'oro resta intatta: il totale lo tiene il nostro database, non lo
// decide il cliente. Al pagamento Stripe incassa esattamente quel totale.

export function checkoutAmount(ordine = {}) {
  const totale = Number(ordine.total_cents ?? 0);
  if (!(totale > 0)) {
    throw new Error(`Ordine ${ordine.id ?? '?'} senza un totale da incassare`);
  }
  return totale;
}

// Ogni riga dell'ordine diventa una riga sul pagamento, col suo nome e prezzo:
// il cliente sulla schermata di Stripe rivede cosa sta pagando.
export function righeStripe(ordine = {}) {
  return (ordine.items ?? []).map(item => {
    const quantita = Number(item.quantity ?? 1);
    const totaleRiga = Number(item.total_price_cents ?? 0);
    return {
      quantity: quantita,
      price_data: {
        currency: 'eur',
        unit_amount: Math.round(totaleRiga / Math.max(1, quantita)),
        product_data: { name: item.product_name_snapshot ?? 'Prodotto' }
      }
    };
  });
}

// Dal fiume di messaggi che Stripe manda, uno solo conta: «pagato davvero».
// Tutti gli altri si lasciano passare senza toccare l'ordine.
export function esitoWebhook(evento = {}) {
  const sessione = evento?.data?.object ?? {};
  if (evento.type === 'checkout.session.completed' && sessione.payment_status === 'paid') {
    return { azione: 'segna-pagato', orderId: sessione.metadata?.order_id };
  }
  return { azione: 'ignora' };
}

// Finche' non ci sono le chiavi, Stripe e' spento: l'app deve saperlo e non
// fingere che il pagamento funzioni, come non finge con gli SMS.
export function stripeConfigurato(env = {}) {
  return Boolean(env.STRIPE_SECRET_KEY) && Boolean(env.STRIPE_WEBHOOK_SECRET);
}
