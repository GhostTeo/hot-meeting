// Le prenotazioni: una pizza pronta a un orario preciso invece che "appena
// possibile". Si prenota per il primo giorno utile: oggi se c'e' ancora un
// turno con posto, altrimenti il primo giorno in cui la pizzeria e' aperta
// (dopo il riposo settimanale o le ferie). Non serve che il turno sia gia'
// stato aperto dal locale: il servizio nasce da solo quando arriva la prima
// prenotazione, e il forno tiene il conto quarto d'ora per quarto d'ora.

export const BOOKING_SLOT_MINUTES = 15;
export const BOOKING_LEAD_MINUTES = 25;
export const BOOKING_HORIZON_DAYS = 14;
const ROME = 'Europe/Rome';

function minutesToLabel(minute) {
  const h = Math.floor(minute / 60), m = minute % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function toMinutes(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + m;
}

// Quante pizze puo' davvero sfornare il forno in un quarto d'ora: la stessa
// formula che il server usa per rifiutare uno slot pieno (vedi la migrazione
// "prenotazioni sincronizzate"), cosi' il cliente non si vede mai proporre un
// orario che poi verrebbe rifiutato all'invio.
export function slotCapacity({ ovenSlots = 6, bakeMinutes = 4, step = BOOKING_SLOT_MINUTES } = {}) {
  const infornate = Math.floor(step / Math.max(1, bakeMinutes));
  return Math.max(1, infornate) * Math.max(1, ovenSlots);
}

// Gli orari prenotabili in un turno: dal primo quarto d'ora utile (adesso piu'
// il tempo minimo di preparazione, arrotondato al quarto successivo, e comunque
// non prima dell'apertura del turno) fino a dieci minuti prima della chiusura,
// cosi' l'ultima prenotazione non nasce gia' in ritardo. Uno slot che non ha
// piu' posto per il forno (vedi `capacity`/`booked`) non compare nemmeno: non
// ha senso mostrare un orario pieno per poi rifiutarlo alla conferma.
// `nowMinutes` a null vuol dire "un giorno futuro": si parte dall'apertura.
export function bookableSlots({ shift, hours, nowMinutes, leadMinutes = BOOKING_LEAD_MINUTES, step = BOOKING_SLOT_MINUTES, capacity = Infinity, booked = {}, partySize = 0 } = {}) {
  const finestra = shift && hours ? hours[shift] : null;
  if (!finestra) return [];
  const apertura = toMinutes(finestra.open);
  const chiusura = toMinutes(finestra.close);
  const daOra = nowMinutes == null ? apertura : Math.ceil((Number(nowMinutes) + leadMinutes) / step) * step;
  const primo = Math.max(apertura, daOra);
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

function romeParts(ms) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ROME, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date(ms));
  const v = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return { date: `${v.year}-${v.month}-${v.day}`, minute: Number(v.hour) * 60 + Number(v.minute) };
}

// La data (AAAA-MM-GG) e il minuto del giorno a Roma di un istante qualsiasi.
export function romeDate(ms) {
  return romeParts(ms).date;
}

// Il giorno dopo, come stringa AAAA-MM-GG (calendario puro, senza fusi).
export function nextDate(date) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// L'istante assoluto di "quel giorno a quell'ora, a Roma". Roma sta sempre a
// un numero intero di ore da UTC: si parte dall'ipotesi UTC e si corregge con
// lo scarto che Roma mostra per quell'istante (due passate bastano anche a
// cavallo dell'ora legale).
function utcOf(date, minute) {
  const [y, mo, d] = String(date).split('-').map(Number);
  return Date.UTC(y, mo - 1, d, Math.floor(minute / 60), minute % 60);
}

export function romeTimestamp(date, minute) {
  const wanted = utcOf(date, minute);
  let guess = wanted;
  for (let i = 0; i < 2; i += 1) {
    const seen = romeParts(guess);
    const seenMs = utcOf(seen.date, seen.minute);
    if (seenMs === wanted) break;
    guess += wanted - seenMs;
  }
  return guess;
}

// Il primo giorno in cui si puo' prenotare, con tutti i suoi orari liberi.
//
// Oggi, se c'e' ancora almeno un quarto d'ora utile in un turno (pranzo o
// cena, anche quello non ancora iniziato); altrimenti il primo giorno aperto
// dopo oggi, saltando riposo settimanale e ferie (`isClosed(date)` lo dice
// il calendario). Le pizze gia' prenotate arrivano in `booked` come
// [{at, pizzas}] con `at` istante assoluto: qui si riportano al minuto del
// giorno di ciascun turno per confrontarle con la capienza del forno.
export function nextBookingDay({ now = Date.now(), hours, isClosed = () => false, capacity = Infinity, booked = [], partySize = 0, leadMinutes = BOOKING_LEAD_MINUTES, step = BOOKING_SLOT_MINUTES, horizonDays = BOOKING_HORIZON_DAYS } = {}) {
  if (!hours) return null;
  const oggi = romeParts(now);
  let date = oggi.date;
  for (let giorno = 0; giorno <= horizonDays; giorno += 1) {
    if (!isClosed(date)) {
      const perMinuto = {};
      for (const entry of booked) {
        if (!entry?.at) continue;
        const p = romeParts(Number(entry.at));
        if (p.date !== date) continue;
        perMinuto[p.minute] = (perMinuto[p.minute] || 0) + Number(entry.pizzas || 0);
      }
      const slots = [];
      for (const shift of Object.keys(hours)) {
        const nowMinutes = giorno === 0 ? oggi.minute : null;
        for (const slot of bookableSlots({ shift, hours, nowMinutes, leadMinutes, step, capacity, booked: perMinuto, partySize })) {
          slots.push({ ...slot, shift, date, at: romeTimestamp(date, slot.minute) });
        }
      }
      if (slots.length) return { date, today: giorno === 0, slots };
    }
    date = nextDate(date);
  }
  return null;
}

// Come dire al cliente per quando e' la pizza: solo l'ora se e' per oggi,
// altrimenti anche il giorno ("dom 6 set, 19:30").
export function bookingLabel(at, { now = Date.now(), locale = 'it' } = {}) {
  if (!at) return '';
  const quando = new Date(Number(at));
  const ora = quando.toLocaleTimeString(locale === 'en' ? 'en-GB' : 'it-IT', { hour: '2-digit', minute: '2-digit', timeZone: ROME });
  if (romeDate(at) === romeDate(now)) return ora;
  const giorno = quando.toLocaleDateString(locale === 'en' ? 'en-GB' : 'it-IT', { weekday: 'short', day: 'numeric', month: 'short', timeZone: ROME });
  return `${giorno}, ${ora}`;
}

export { minutesToLabel };
