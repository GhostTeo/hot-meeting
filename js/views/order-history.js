// Storico ordini filtrabile.
// Un ordine non viene mai cancellato: annullamenti e rettifiche restano
// visibili qui, cosi' la giornata e' ricostruibile a posteriori.

const SEARCHABLE = ['customer', 'phone', 'payment'];

function matchesQuery(order, query) {
  const needle = String(query).trim().toLowerCase();
  if (!needle) return true;
  // Il cancelletto cerca il numero della giornata, altrimenti '3' finirebbe
  // dentro qualunque numero di telefono.
  if (needle.startsWith('#')) {
    const wanted = Number(needle.slice(1).replace(/\D/g, ''));
    return Number.isFinite(wanted) && Number(order.sequence) === wanted;
  }
  return SEARCHABLE.some(field => String(order[field] ?? '').toLowerCase().includes(needle));
}

export function filterOrders(orders = [], filters = {}) {
  return orders
    .filter(order => (!filters.date || order.businessDate === filters.date))
    .filter(order => (!filters.shift || order.shift === filters.shift))
    .filter(order => (!filters.source || order.source === filters.source))
    .filter(order => (!filters.status || order.status === filters.status))
    .filter(order => matchesQuery(order, filters.query ?? ''))
    .sort((left, right) => Number(right.createdAt ?? 0) - Number(left.createdAt ?? 0));
}

export function historyDates(orders = []) {
  return [...new Set(orders.map(order => order.businessDate).filter(Boolean))].sort().reverse();
}

const STATUS_LABELS = {
  received: 'Ricevuto', preparing: 'In preparazione', ready: 'Pronto',
  collected: 'Ritirato', cancelled: 'Annullato'
};

const SHIFT_LABELS = { lunch: 'Pranzo', dinner: 'Serale' };

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
}

function option(value, label, selected) {
  return `<option value="${escapeHtml(value)}" ${value === selected ? 'selected' : ''}>${escapeHtml(label)}</option>`;
}

export function statusLabel(status) {
  return STATUS_LABELS[status] ?? status;
}

export function orderHistoryPanel(orders, filters = {}, adjustments = [], money = value => `${value}`) {
  const rows = filterOrders(orders, filters);
  const sources = [...new Set(orders.map(order => order.source).filter(Boolean))];
  const movementsByOrder = new Map();
  for (const movement of adjustments) {
    movementsByOrder.set(movement.orderId, [...(movementsByOrder.get(movement.orderId) ?? []), movement]);
  }
  return `<h1>Storico</h1>
    <div class="history-filters">
      <label>Giornata<select id="history-date">${option('', 'Tutte', filters.date ?? '')}${historyDates(orders).map(date => option(date, date, filters.date ?? '')).join('')}</select></label>
      <label>Turno<select id="history-shift">${option('', 'Tutti', filters.shift ?? '')}${Object.entries(SHIFT_LABELS).map(([value, label]) => option(value, label, filters.shift ?? '')).join('')}</select></label>
      <label>Origine<select id="history-source">${option('', 'Tutte', filters.source ?? '')}${sources.map(source => option(source, source, filters.source ?? '')).join('')}</select></label>
      <label>Stato<select id="history-status">${option('', 'Tutti', filters.status ?? '')}${Object.entries(STATUS_LABELS).map(([value, label]) => option(value, label, filters.status ?? '')).join('')}</select></label>
      <label>Cerca<input id="history-query" value="${escapeHtml(filters.query ?? '')}" placeholder="Cliente, telefono, pagamento o #numero"></label>
    </div>
    <p class="history-count">${rows.length} ordini</p>
    ${rows.length ? rows.map(order => historyRow(order, movementsByOrder.get(order.id) ?? [], money)).join('') : '<p>Nessun ordine con questi filtri.</p>'}`;
}

function historyRow(order, movements, money) {
  const revision = Number(order.revision ?? 1);
  return `<article class="card history-order">
    <div class="history-head">
      <span class="pill">#${String(order.sequence ?? 0).padStart(2, '0')} · ${escapeHtml(order.source ?? '')}</span>
      <span class="pill">${escapeHtml(statusLabel(order.status))}</span>
      ${revision > 1 ? `<span class="pill">Revisione ${revision}</span>` : ''}
    </div>
    <h3>${escapeHtml(order.customer ?? 'Cliente')}</h3>
    <p>${escapeHtml(order.businessDate ?? '')} · ${escapeHtml(SHIFT_LABELS[order.shift] ?? '')} · ${escapeHtml(order.phone ?? '')}</p>
    <p>${escapeHtml(order.payment ?? '')} · <b>${money(Number(order.total ?? 0))}</b></p>
    ${(order.items ?? []).map(item => `<p>${Number(item.quantity ?? 1)}× ${escapeHtml(item.name ?? '')}</p>`).join('')}
    ${movements.map(movement => `<p class="history-movement">${movement.type === 'supplement' ? 'Supplemento' : 'Rimborso'} ${money(Number(movement.amount ?? 0))} · ${escapeHtml(movement.status)}</p>`).join('')}
    ${['cancelled'].includes(order.status) ? '' : `<button class="btn secondary history-edit" data-id="${escapeHtml(order.id)}">Modifica ordine</button>`}
  </article>`;
}
