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

// Due terzine identiche a mezzo secondo di distanza: una si perde nel rumore,
// due no. Il volume e' alto ma le note sono corte, quindi non da' fastidio.
const MOTIVO = [
  { hz: 1047, quando: 0, durata: 0.18, volume: 0.55 },
  { hz: 1319, quando: 0.15, durata: 0.18, volume: 0.55 },
  { hz: 1568, quando: 0.30, durata: 0.42, volume: 0.6 }
];

export function chime() {
  if (!unlockChime() || !audio) return false;
  try {
    const adesso = audio.currentTime + 0.01;
    for (const ripetizione of [0, 0.62]) {
      for (const nota of MOTIVO) {
        note(nota.hz, adesso + ripetizione + nota.quando, nota.durata, nota.volume);
      }
    }
    return true;
  } catch {
    return false;
  }
}

export function buzz() {
  try {
    return Boolean(navigator.vibrate?.([120, 80, 120, 80, 220]));
  } catch {
    return false;
  }
}

export function announceOrders(orders = []) {
  if (!orders.length) return null;
  chime();
  buzz();
  return orders.length === 1
    ? `Nuovo ordine #${String(orders[0].sequence ?? 0).padStart(2, '0')}`
    : `${orders.length} nuovi ordini`;
}
