// Quanto aspetta davvero chi ordina.
//
// Le pizze non escono a una a una: escono a infornate. Nel forno ce ne stanno
// sei e ogni infornata dura quattro minuti dalla stesura alla consegna, quindi
// circa novanta pizze all'ora. Un ordine e' pronto quando esce l'infornata che
// contiene la sua ultima pizza: e' questo che decide l'attesa, non una media
// oraria spalmata.
//
// Il margine finale copre il tempo che non sta nel forno: incartare, chiamare,
// consegnare al banco. Meglio dire dodici minuti e farne dieci che il contrario:
// l'orario promesso al cliente e' una promessa, non una speranza.

export const DEFAULT_OVEN = Object.freeze({ slots: 6, bakeMinutes: 4, bufferMinutes: 5 });

export function ovenThroughput({ slots = DEFAULT_OVEN.slots, bakeMinutes = DEFAULT_OVEN.bakeMinutes } = {}) {
  return Math.floor((60 / Math.max(1, bakeMinutes)) * Math.max(1, slots));
}

export function readyInMinutes({
  ahead = 0,
  pizzas = 0,
  slots = DEFAULT_OVEN.slots,
  bakeMinutes = DEFAULT_OVEN.bakeMinutes,
  bufferMinutes = DEFAULT_OVEN.bufferMinutes
} = {}) {
  const position = Math.max(0, Math.trunc(ahead)) + Math.max(0, Math.trunc(pizzas));
  const batches = Math.ceil(position / Math.max(1, slots));
  return batches * Math.max(1, bakeMinutes) + Math.max(0, bufferMinutes);
}
