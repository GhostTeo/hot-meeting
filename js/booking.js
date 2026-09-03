// Le prenotazioni: una pizza pronta a un orario preciso invece che "appena
// possibile". Restano dentro al turno gia' aperto (pranzo o cena): non si
// prenota a cavallo di un turno chiuso, cambia solo QUANDO deve essere
// pronta, non SE l'ordine puo' partire.

export const BOOKING_SLOT_MINUTES = 15;
export const BOOKING_LEAD_MINUTES = 25;

function minutesToLabel(minute) {
  const h = Math.floor(minute / 60), m = minute % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Gli orari prenotabili nel turno in corso: dal primo quarto d'ora utile
// (adesso piu' il tempo minimo di preparazione, arrotondato al quarto
// successivo) fino a dieci minuti prima della chiusura del turno, cosi'
// l'ultima prenotazione non nasce gia' in ritardo.
export function bookableSlots({ shift, hours, nowMinutes, leadMinutes = BOOKING_LEAD_MINUTES, step = BOOKING_SLOT_MINUTES } = {}) {
  const finestra = shift && hours ? hours[shift] : null;
  if (!finestra) return [];
  const [hC, mC] = String(finestra.close).split(':').map(Number);
  const chiusura = hC * 60 + mC;
  const primo = Math.ceil((Number(nowMinutes) + leadMinutes) / step) * step;
  const ultimo = chiusura - 10;
  const slots = [];
  for (let minute = primo; minute <= ultimo; minute += step) {
    slots.push({ minute, label: minutesToLabel(minute) });
  }
  return slots;
}

// Da un minuto-del-giorno prenotato a un timestamp assoluto: si sposta `now`
// dello stesso numero di minuti reali passati fra `nowMinutes` e lo slot,
// senza ricostruire una data col fuso orario (un turno di pranzo o cena non
// attraversa mai la mezzanotte ne' un cambio d'ora legale).
export function slotTimestamp(minute, now, nowMinutes) {
  return now + (Number(minute) - Number(nowMinutes)) * 60000;
}

export { minutesToLabel };
