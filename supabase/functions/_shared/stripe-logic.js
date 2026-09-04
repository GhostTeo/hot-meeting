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

// Le righe dell'ordine vivono a revisioni: se il locale ha corretto l'ordine,
// la storia tiene sia le righe vecchie sia quelle nuove. Si incassa SOLO
// l'ultima revisione: sommarle tutte farebbe pagare due volte.
export function righeCorrenti(items = []) {
  const righe = Array.isArray(items) ? items : [];
  const ultima = righe.reduce((massimo, item) => Math.max(massimo, Number(item.revision ?? 1)), 1);
  return righe.filter(item => Number(item.revision ?? 1) === ultima);
}

export function totaleRighe(items = []) {
  return righeCorrenti(items).reduce((somma, item) => somma + Number(item.total_price_cents ?? 0), 0);
}

// Ogni riga dell'ordine diventa una riga sul pagamento, col suo nome e prezzo:
// il cliente sulla schermata di Stripe rivede cosa sta pagando.
export function righeStripe(ordine = {}) {
  return righeCorrenti(ordine.items ?? []).map(item => {
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
    return {
      azione: 'segna-pagato',
      orderId: sessione.metadata?.order_id,
      importo: Number(sessione.amount_total ?? 0)
    };
  }
  return { azione: 'ignora' };
}

// Prima di segnare «pagato» si confronta quanto Stripe ha incassato con il
// totale dell'ordine oggi: se non tornano (un ordine corretto dopo aver aperto
// il pagamento, una sessione vecchia) l'ordine resta da controllare a mano.
export function importoCorrisponde(importoIncassato, totaleOrdine) {
  return Number(importoIncassato) > 0 && Number(importoIncassato) === Number(totaleOrdine);
}

// Finche' non ci sono le chiavi, Stripe e' spento: l'app deve saperlo e non
// fingere che il pagamento funzioni, come non finge con gli SMS.
export function stripeConfigurato(env = {}) {
  return Boolean(env.STRIPE_SECRET_KEY) && Boolean(env.STRIPE_WEBHOOK_SECRET);
}
