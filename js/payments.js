// Differenze economiche di una revisione ordine.
// Il pagamento originale resta immutabile: una modifica non lo altera mai, ma
// crea un movimento separato che nasce in attesa e verra' registrato o
// annullato. Nessun addebito o rimborso reale avviene in modalita'
// dimostrativa.

import { DEMO_PAYMENT_METHODS } from './domain.js';

export const ADJUSTMENT_METHODS = DEMO_PAYMENT_METHODS;

function cents(value) {
  return Math.round(Number(value || 0) * 100);
}

export function calculateAdjustment(originalTotal, revisedTotal) {
  const difference = cents(revisedTotal) - cents(originalTotal);
  if (difference === 0) return { type: 'none', amount: 0, status: 'none' };
  return {
    type: difference > 0 ? 'supplement' : 'refund',
    amount: Math.abs(difference) / 100,
    status: 'pending'
  };
}
