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

// Quante pizze puo' davvero sfornare il forno in un quarto d'ora: la stessa
// formula che il server usa per rifiutare uno slot pieno (vedi la migrazione
// "prenotazioni sincronizzate"), cosi' il cliente non si vede mai proporre un
// orario che poi verrebbe rifiutato all'invio.
export function slotCapacity({ ovenSlots = 6, bakeMinutes = 4, step = BOOKING_SLOT_MINUTES } = {}) {
  const infornate = Math.floor(step / Math.max(1, bakeMinutes));
  return Math.max(1, infornate) * Math.max(1, ovenSlots);
}

// Gli orari prenotabili nel turno in corso: dal primo quarto d'ora utile
// (adesso piu' il tempo minimo di preparazione, arrotondato al quarto
// successivo) fino a dieci minuti prima della chiusura del turno, cosi'
// l'ultima prenotazione non nasce gia' in ritardo. Uno slot che non ha piu'
// posto per il forno (vedi `capacity`/`booked`) non compare nemmeno: non ha
// senso mostrare un orario pieno per poi rifiutarlo alla conferma.
export function bookableSlots({ shift, hours, nowMinutes, leadMinutes = BOOKING_LEAD_MINUTES, step = BOOKING_SLOT_MINUTES, capacity = Infinity, booked = {}, partySize = 0 } = {}) {
  const finestra = shift && hours ? hours[shift] : null;
  if (!finestra) return [];
  const [hC, mC] = String(finestra.close).split(':').map(Number);
  const chiusura = hC * 60 + mC;
  const primo = Math.ceil((Number(nowMinutes) + leadMinutes) / step) * step;
  const ultimo = chiusura - 10;
  const slots = [];
  // Anche senza sapere ancora quante pizze si vogliono prenotare, uno slot
  // gia' pieno non ha comunque posto per almeno una: non ha senso proporlo.
  const richieste = Math.max(1, partySize);
  for (let minute = primo; minute <= ultimo; minute += step) {
    const occupate = Number(booked[minute] || 0);
    if (Number.isFinite(capacity) && occupate + richieste > capacity) continue;
    slots.push({ minute, label: minutesToLabel(minute), remaining: Number.isFinite(capacity) ? Math.max(0, capacity - occupate) : null });
  }
  return slots;
}

// Da un minuto-del-giorno prenotato a un timestamp assoluto: si sposta `now`
// dello stesso numero di minuti reali passati fra `nowMinutes` e lo slot,
// senza ricostruire una data col fuso orario (un turno di pranzo o cena non
// attraversa mai la mezzanotte ne' un cambio d'ora legale). Si arrotonda poi
// al minuto esatto: "adesso" porta con se' i suoi secondi e millisecondi, che
// altrimenti resterebbero attaccati a un orario che deve cadere in punto
// (il server rifiuta un quarto d'ora che non e' un quarto d'ora preciso).
export function slotTimestamp(minute, now, nowMinutes) {
  const shifted = now + (Number(minute) - Number(nowMinutes)) * 60000;
  return shifted - (shifted % 60000);
}

export { minutesToLabel };
