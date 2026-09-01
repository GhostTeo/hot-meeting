// L'avviso quando entra un ordine.
//
// Chi sta in cassa non guarda lo schermo tutto il tempo: se un ordine arriva in
// silenzio, si scopre quando il cliente e' gia' sulla porta. Il trillo deve
// passare sopra il forno, le voci e la cappa: tre note ripetute due volte, non
// un rintocco educato che nessuno sente.
//
// Il suono e' generato dal browser, non e' un file da scaricare: non pesa
// niente e non c'e' niente da caricare la prima volta.
//
// I browser non lasciano suonare una pagina finche' l'utente non l'ha toccata
// almeno una volta. Va bene cosi': in cassa si tocca comunque, e prima di
// allora nessun ordine puo' essere arrivato.

export function arrivedOrders(previous, current = []) {
  // Al primo caricamento non e' arrivato niente adesso: c'era gia' tutto.
  if (!Array.isArray(previous)) return [];
  const conosciuti = new Set(previous.map(order => String(order.id)));
  return current.filter(order =>
    !conosciuti.has(String(order.id)) && ['received', 'preparing'].includes(order.status));
}

let audio = null;

export function unlockChime() {
  try {
    const Context = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!Context) return false;
    audio = audio ?? new Context();
    if (audio.state === 'suspended') void audio.resume();
    return true;
  } catch {
    return false;
  }
}

function note(frequency, start, duration, volume) {
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.value = frequency;
  // Attacco corto e coda che si spegne: un trillo, non un fischio.
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain).connect(audio.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

// Tre terzine invece di due, e a volume pieno: piu' lunga e piu' forte, cosi'
// passa sopra il forno e la cappa. Le note restano corte, quindi e' un allarme
// deciso, non un fischio continuo.
const MOTIVO = [
  { hz: 1047, quando: 0, durata: 0.2, volume: 0.85 },
  { hz: 1319, quando: 0.16, durata: 0.2, volume: 0.85 },
  { hz: 1568, quando: 0.32, durata: 0.5, volume: 0.95 }
];

export function chime() {
  if (!unlockChime() || !audio) return false;
  try {
    const adesso = audio.currentTime + 0.01;
    for (const ripetizione of [0, 0.6, 1.2]) {
      for (const nota of MOTIVO) {
        note(nota.hz, adesso + ripetizione + nota.quando, nota.durata, nota.volume);
      }
    }
    return true;
  } catch {
    return false;
  }
}

// Vibrazione lunga e insistente: su molti telefoni si sente anche in silenzioso.
export function buzz() {
  try {
    return Boolean(navigator.vibrate?.([300, 120, 300, 120, 300, 120, 500]));
  } catch {
    return false;
  }
}

// L'allarme che NON si spegne da solo.
//
// Un trillo singolo si perde: se il cameriere e' di la', l'ordine resta li'. Qui
// l'avviso suona e vibra, e continua a ripetersi ogni paio di secondi finche'
// qualcuno non lo tocca (stopAlarm). Cosi' un ordine non passa mai inosservato.
//
// Onesto sul silenzioso: su iPhone l'interruttore fisico del silenzioso zittisce
// l'audio di qualsiasi pagina web, e nessun sito puo' forzarlo. La vibrazione e
// il ripetersi aiutano; il suono garantito col telefono in silenzioso lo dara'
// solo l'app nativa. Su Android il web di solito suona lo stesso.
let alarmTimer = null;

export function alarmActive() {
  return alarmTimer !== null;
}

export function startAlarm(options = {}) {
  if (alarmTimer !== null) return false;
  const play = options.play ?? (() => { chime(); buzz(); });
  const schedule = options.setInterval ?? globalThis.setInterval;
  const intervalMs = options.intervalMs ?? 1900;
  play();
  alarmTimer = schedule(play, intervalMs);
  return true;
}

export function stopAlarm(options = {}) {
  if (alarmTimer === null) return false;
  const cancel = options.clearInterval ?? globalThis.clearInterval;
  cancel(alarmTimer);
  alarmTimer = null;
  try { navigator.vibrate?.(0); } catch { /* niente vibrazione, pazienza */ }
  return true;
}

export function announceOrders(orders = []) {
  if (!orders.length) return null;
  // Non un trillo solo: parte l'allarme che continua finche' non lo fermano.
  startAlarm();
  return orders.length === 1
    ? `Nuovo ordine #${String(orders[0].sequence ?? 0).padStart(2, '0')}`
    : `${orders.length} nuovi ordini`;
}
