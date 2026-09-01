// Come sta il collegamento col server.
//
// Il guaio peggiore non e' internet che cade: quello si vede. E' il canale che
// muore in silenzio, mentre la pagina sembra viva. La cucina resta li' a
// guardare uno schermo fermo, convinta che non arrivino ordini, e nessuno se ne
// accorge fino a quando un cliente non si presenta al banco.
//
// Per questo il collegamento si sorveglia da solo, si riapre da solo, e quando
// qualcosa non va lo dice in italiano invece di tacere.

const STATI_ROTTI = new Set(['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED']);

export function vaRiconnesso(stato) {
  return STATI_ROTTI.has(String(stato));
}

// Si riprova subito, poi sempre piu' di rado: se il server e' in difficolta',
// tempestarlo di richieste peggiora le cose. Mai oltre mezzo minuto, pero':
// quando torna, deve tornare in fretta.
export function attesaPrimaDiRiprovare(tentativo = 0) {
  return Math.min(30000, 1000 * 2 ** Math.max(0, tentativo));
}

// Due minuti senza una risposta sono troppi: un servizio ne fa passare al
// massimo uno fra un aggiornamento e l'altro.
const SILENZIO_SOSPETTO = 120000;

export function statoConnessione({ online = true, ultimoContatto = null, now = Date.now() } = {}) {
  if (!online) {
    return {
      chiave: 'senzaRete',
      testo: 'Questo dispositivo non ha rete. Gli ordini gia’ presi restano, i nuovi non arrivano finche’ non torna.'
    };
  }
  if (!ultimoContatto || now - ultimoContatto > SILENZIO_SOSPETTO) {
    return {
      chiave: 'nonRisponde',
      testo: 'Il server non risponde da qualche minuto. Sto riprovando da solo.'
    };
  }
  return { chiave: 'ok', testo: 'Collegato' };
}
