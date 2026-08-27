// La sala d'attesa: i dieci minuti fra «ordinato» e «pronta».
//
// Non serve intrattenere, serve rassicurare: chi aspetta guarda il telefono per
// sapere a che punto e' e quando uscire di casa. Lo stato arriva dal server,
// non e' una finzione che scorre da sola: se la cucina e' in ritardo, qui si
// vede.
//
// Quando il tempo promesso scade ma la pizza non e' ancora uscita, la barra si
// ferma appena prima della fine invece di dire che e' pronta: e' l'unico punto
// in cui una barra di avanzamento puo' mentire, e non deve.

const STAGES = {
  queued: { key: 'queued', it: 'Il tuo ordine \u00e8 in coda', en: 'Your order is in the queue', hint: { it: 'La cucina l\u2019ha ricevuto.', en: 'The kitchen has it.' } },
  working: { key: 'working', it: 'La tua pizza \u00e8 in lavorazione', en: 'Your pizza is being made', hint: { it: 'Stesa e infornata.', en: 'Stretched and in the oven.' } },
  almost: { key: 'almost', it: 'Sta per uscire dal forno', en: 'About to come out of the oven', hint: { it: 'Se non sei ancora uscito, \u00e8 il momento.', en: 'If you have not left yet, now is the time.' } },
  ready: { key: 'ready', it: '\u00c8 pronta', en: 'It is ready', hint: { it: 'Ti aspettiamo in pizzeria.', en: 'We are waiting for you.' } },
  collected: { key: 'collected', it: 'Ritirato', en: 'Collected', hint: { it: 'Buon appetito.', en: 'Enjoy your meal.' } }
};

export function waitingStage({ status = 'preparing', minutesLeft = null, promisedMinutes = null } = {}) {
  if (status === 'collected') return { ...STAGES.collected, progress: 100 };
  if (status === 'ready') return { ...STAGES.ready, progress: 100 };
  if (status === 'cancelled') return { ...STAGES.collected, progress: 0 };

  const promessi = Number(promisedMinutes ?? 0);
  const restano = Number(minutesLeft ?? promessi);
  const trascorso = promessi > 0 ? Math.min(1, Math.max(0, (promessi - restano) / promessi)) : 0;

  // Il tempo e' finito ma la pizza no: si resta appena sotto, senza promettere.
  if (restano <= 0) return { ...STAGES.almost, progress: 97 };
  if (restano <= 3) return { ...STAGES.almost, progress: Math.round(trascorso * 100) };
  if (trascorso <= 0) return { ...STAGES.queued, progress: 0 };
  return { ...STAGES.working, progress: Math.round(trascorso * 100) };
}
