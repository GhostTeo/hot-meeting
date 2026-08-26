// L'avviso quando entra un ordine.
//
// Chi sta in cassa non guarda lo schermo tutto il tempo: se un ordine arriva in
// silenzio, si scopre quando il cliente e' gia' sulla porta. Serve un trillo
// breve e una vibrazione, non una sirena: in pizzeria c'e' gia' abbastanza
// rumore.
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

export function chime() {
  if (!unlockChime() || !audio) return false;
  try {
    const adesso = audio.currentTime + 0.01;
    note(988, adesso, 0.16, 0.12);
    note(1319, adesso + 0.13, 0.26, 0.10);
    return true;
  } catch {
    return false;
  }
}

export function buzz() {
  try {
    return Boolean(navigator.vibrate?.([70, 60, 70]));
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
