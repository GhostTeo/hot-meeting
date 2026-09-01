// Chi c'e' sulla rete della pizzeria.
//
// Sul posto non si ha tempo di indovinare: si collega il portatile alla stessa
// rete delle stampanti, si lancia la ricerca e si sa in un minuto quali
// apparecchi rispondono, a che indirizzo, e se sono stampanti da comande o
// registratori fiscali.
//
// Le porte dicono quasi tutto: la 9100 e' quella che tutte le stampanti da
// scontrini tengono aperta per ricevere il testo da stampare, la 80 e' la
// paginetta di configurazione. Le Epson fiscali italiane rispondono anche a un
// indirizzo speciale, fpmate.cgi, ed e' cosi' che si distinguono.

export function indirizziDellaRete(ip, maschera) {
  const numero = testo => testo.split('.').reduce((totale, parte) => (totale << 8) + Number(parte), 0) >>> 0;
  const testo = valore => [24, 16, 8, 0].map(spostamento => (valore >>> spostamento) & 255).join('.');
  const rete = numero(ip) & numero(maschera);
  const quanti = (~numero(maschera) >>> 0);
  const lista = [];
  // Si saltano il primo (la rete) e l'ultimo (il broadcast): non sono apparecchi.
  for (let i = 1; i < quanti; i += 1) lista.push(testo((rete + i) >>> 0));
  return lista;
}

export function riconosciStampante({ porte = [], fpmate = false } = {}) {
  const stampa = porte.includes(9100) || porte.includes(515) || porte.includes(631);
  if (fpmate) {
    return {
      tipo: 'fiscale',
      nota: 'Registratore fiscale Epson: emette il documento commerciale. E quello da collegare alla cassa.'
    };
  }
  if (stampa) {
    return {
      tipo: 'comande',
      nota: 'Stampante da comande: va bene per la cucina. Prende il testo sulla porta 9100.'
    };
  }
  return { tipo: 'sconosciuto', nota: 'Risponde ma non come stampante: apri la sua pagina nel browser per capire cos e.' };
}
