function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
}

export function dialogMarkup(dialog, money) {
  if (!dialog) return '';
  if (dialog.kind === 'blocked') {
    return `<div class="modal-backdrop dialog-backdrop"><section class="modal dialog-card" role="alertdialog" aria-modal="true" aria-labelledby="dialog-title" aria-describedby="dialog-description"><span class="eyebrow">Chiusura bloccata</span><h2 id="dialog-title">Completa prima gli ordini attivi</h2><p id="dialog-description">Il servizio resta aperto finché la coda non è vuota.</p><ul class="blocking-orders">${dialog.blockingOrders.map(order => `<li><b>#${escapeHtml(order.sequence ?? order.id)}</b> · ${escapeHtml(order.customer || 'Cliente')} · ${order.status === 'received' ? 'ricevuto' : 'in preparazione'}</li>`).join('')}</ul><div class="dialog-actions"><button class="btn primary" data-dialog-action="dismiss">Torna agli ordini</button></div></section></div>`;
  }
  const summary = dialog.summary;
  return `<div class="modal-backdrop dialog-backdrop"><section class="modal dialog-card" role="dialog" aria-modal="true" aria-labelledby="dialog-title" aria-describedby="dialog-description"><span class="eyebrow">Conferma richiesta</span><h2 id="dialog-title">Chiudi il servizio ${escapeHtml(dialog.label)}</h2><p id="dialog-description">Controlla il riepilogo prima di confermare.</p><dl class="close-summary"><div><dt>Data operativa</dt><dd>${escapeHtml(dialog.businessDate)}</dd></div><div><dt>Ordini</dt><dd>${summary.orders}</dd></div><div><dt>Pizze</dt><dd>${summary.pizzas}</dd></div><div><dt>Lordo</dt><dd>${money(summary.gross)}</dd></div><div><dt>Netto</dt><dd>${money(summary.net)}</dd></div></dl>${dialog.closesBusinessDay ? '<label class="final-day"><input id="close-business-day" type="checkbox" checked> Chiudi definitivamente anche la giornata operativa</label>' : ''}<div class="dialog-actions"><button class="btn secondary" data-dialog-action="cancel">Annulla</button><button class="btn primary" data-dialog-action="confirm-close">Conferma chiusura</button></div></section></div>`;
}
