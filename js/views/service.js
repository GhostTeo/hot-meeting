const ACTIVE_STATUSES = new Set(['received', 'preparing']);

const SHIFT_LABELS = {
  lunch: 'Pranzo',
  dinner: 'Serale'
};

export function reopenService(service, openedAt = Date.now()) {
  return {
    ...service,
    status: 'open',
    sessions: [...(service.sessions || []), { openedAt, closedAt: null }]
  };
}

export function closeService(service, closedAt = Date.now()) {
  const sessions = [...(service.sessions || [])];
  const current = sessions.at(-1);
  if (current && current.closedAt == null) sessions[sessions.length - 1] = { ...current, closedAt };
  return { ...service, status: 'closed', sessions };
}

export function buildCloseDialog(service, orders, summary) {
  const blockingOrders = (orders || []).filter(order => (
    order.serviceId === service.id && ACTIVE_STATUSES.has(order.status)
  ));
  if (blockingOrders.length) return { kind: 'blocked', blockingOrders };
  return {
    kind: 'confirm',
    shift: service.shift,
    businessDate: service.businessDate,
    summary,
    closesBusinessDay: service.shift === 'dinner'
  };
}

export function servicePanel(services = {}, businessDate) {
  return `<h1>Servizio</h1><div class="grid service-grid">${['lunch', 'dinner'].map(shift => {
    const service = services[shift];
    const isOpen = service?.status === 'open';
    const canReopen = service && service.businessDate === businessDate;
    const action = isOpen ? 'close' : (canReopen ? 'reopen' : 'open');
    const label = isOpen ? 'Chiudi servizio' : (canReopen ? 'Riapri servizio' : 'Apri servizio');
    return `<article class="card"><span class="eyebrow">${shift === 'lunch' ? '☀️ Pranzo' : '🌙 Serale'}</span><h2>${isOpen ? 'APERTO' : 'Chiuso'}</h2>${service ? `<p>Giornata operativa <b>${service.businessDate}</b></p>` : '<p>Nessuna sessione per la giornata.</p>'}<button class="btn ${isOpen ? 'secondary' : 'primary'} service-action" data-service-action="${action}" data-shift="${shift}">${label}</button></article>`;
  }).join('')}</div>`;
}

export function shiftLabel(shift) {
  return SHIFT_LABELS[shift] || shift;
}
