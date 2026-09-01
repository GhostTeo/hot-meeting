// Gli orari della pizzeria, decisi una volta e validi da soli.
//
// Il socio non deve aprire e chiudere il servizio a mano ogni giorno: l'app sa
// che a pranzo si ordina dalle 12:00 alle 14:15 e la sera dalle 19:00 alle
// 22:15 (ora di Roma). Fuori da queste due finestre il cliente vede "chiuso,
// chiama il ristorante" e non puo' inviare ordini.
//
// La chiusura si esclude apposta: alle 14:15 in punto il pranzo e' gia' finito,
// cosi' nessun ordine entra quando la cucina sta chiudendo.

export const SERVICE_HOURS = {
  lunch: { open: '12:00', close: '14:15' },
  dinner: { open: '19:00', close: '22:15' }
};

const SHIFT_LABELS = { lunch: 'pranzo', dinner: 'sera' };

function toMinutes(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + m;
}

// I minuti dopo la mezzanotte nel fuso indicato, senza dipendere dal fuso del
// dispositivo: il telefono di un turista puo' essere su un'altra ora, la
// pizzeria no.
export function zonedMinutes(now = Date.now(), timeZone = 'Europe/Rome') {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date(now));
  const hour = Number(parts.find(p => p.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find(p => p.type === 'minute')?.value ?? 0);
  return hour * 60 + minute;
}

// Lo stato del momento: aperti o no, per quale turno, e qual e' il prossimo
// turno utile per dirlo al cliente ("torna a pranzo", "torna stasera").
export function openingStatus(now = Date.now(), { timeZone = 'Europe/Rome', hours = SERVICE_HOURS } = {}) {
  const minute = zonedMinutes(now, timeZone);
  const windows = ['lunch', 'dinner'].map(shift => ({
    shift,
    from: toMinutes(hours[shift].open),
    to: toMinutes(hours[shift].close)
  }));

  const openNow = windows.find(w => minute >= w.from && minute < w.to);
  if (openNow) {
    return { open: true, shift: openNow.shift, shiftLabel: SHIFT_LABELS[openNow.shift], nextShift: null, closesAt: hours[openNow.shift].close };
  }

  const upcoming = windows.find(w => minute < w.from) || null;
  return {
    open: false,
    shift: null,
    shiftLabel: null,
    nextShift: upcoming?.shift ?? null,
    nextOpensAt: upcoming ? hours[upcoming.shift].open : null,
    nextShiftLabel: upcoming ? SHIFT_LABELS[upcoming.shift] : null
  };
}
