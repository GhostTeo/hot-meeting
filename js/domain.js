export function normalizePhone(value = '') {
  const raw = String(value).trim();
  const plus = raw.startsWith('+');
  const digits = raw.replace(/\D/g, '');
  return `${plus ? '+' : ''}${digits}`;
}

export function formatTimer(secondsRemaining) {
  const late = secondsRemaining < 0;
  const value = Math.abs(Math.trunc(secondsRemaining));
  const minutes = String(Math.floor(value / 60)).padStart(2, '0');
  const seconds = String(value % 60).padStart(2, '0');
  return { text: `${late ? '+' : '-'}${minutes}:${seconds}`, late };
}

export function calculateCustomizedPrice(basePrice, additions = []) {
  return additions.reduce(
    (total, addition) => total + Number(addition.price || 0) * Number(addition.quantity || 0),
    Number(basePrice || 0)
  );
}

export const DEMO_PAYMENT_METHODS = Object.freeze([
  { id: 'cash', label: 'Paga in cassa', feeRate: 0 },
  { id: 'apple_pay', label: 'Apple Pay · demo', feeRate: 0.02 },
  { id: 'google_pay', label: 'Google Pay · demo', feeRate: 0.02 }
]);

export function paymentLabel(methodId) {
  if (!methodId) return 'Pagamento non indicato';
  return DEMO_PAYMENT_METHODS.find(method => method.id === methodId)?.label ?? methodId;
}

export function mergeMenuDefaults(savedMenu = [], defaultMenu = []) {
  const defaultsById = new Map(defaultMenu.map(product => [product.id, product]));
  const merged = savedMenu.map(product => ({ ...(defaultsById.get(product.id) || {}), ...product }));
  const savedIds = new Set(savedMenu.map(product => product.id));
  return [...merged, ...defaultMenu.filter(product => !savedIds.has(product.id))];
}

export function customizationLines(item = {}) {
  const lines = [];
  if (item.removed?.length) lines.push(`SENZA: ${item.removed.join(', ')}`);
  const additions = (item.additions || []).filter(addition => addition.quantity > 0);
  if (additions.length) lines.push(`AGGIUNTE: ${additions.map(addition => `${addition.quantity}× ${addition.name}`).join(', ')}`);
  return lines;
}
