// La lingua delle stampanti da scontrini.
//
// Tutte le Epson della serie TM parlano ESC/POS: si mandano dei byte sulla porta
// 9100 e la carta esce. Non e' un formato di stampa come un PDF, e' una sequenza
// di comandi: azzera, centra, ingrandisci, scrivi, taglia.
//
// Qui si traducono le righe della comanda (le stesse che finiscono sullo schermo
// della cucina) in quei byte. Il contenuto non cambia: cambia solo chi lo legge.

const ESC = 0x1b;
const GS = 0x1d;

const COMANDI = {
  azzera: [ESC, 0x40],
  sinistra: [ESC, 0x61, 0x00],
  centro: [ESC, 0x61, 0x01],
  normale: [GS, 0x21, 0x00],
  grande: [GS, 0x21, 0x11],
  altoLargo: [GS, 0x21, 0x01],
  grassettoSi: [ESC, 0x45, 0x01],
  grassettoNo: [ESC, 0x45, 0x00],
  negativoSi: [GS, 0x42, 0x01],
  negativoNo: [GS, 0x42, 0x00],
  taglia: [GS, 0x56, 0x42, 0x00]
};

// La carta termica non conosce tutte le lettere accentate, e quelle che non
// conosce diventano segni a caso. Meglio una «e» leggibile di una «è» storta:
// in cucina conta capire, non l'ortografia.
const ACCENTI = {
  à: 'a', á: 'a', â: 'a', ä: 'a', ã: 'a', å: 'a',
  è: 'e', é: 'e', ê: 'e', ë: 'e',
  ì: 'i', í: 'i', î: 'i', ï: 'i',
  ò: 'o', ó: 'o', ô: 'o', ö: 'o', õ: 'o',
  ù: 'u', ú: 'u', û: 'u', ü: 'u',
  ç: 'c', ñ: 'n', ß: 'ss', æ: 'ae', ø: 'o',
  '’': "'", '‘': "'", '«': '"', '»': '"', '·': '-', '—': '-', '–': '-'
};

export function testoPerStampante(testo = '') {
  return String(testo)
    .split('')
    .map(carattere => {
      const minuscolo = carattere.toLowerCase();
      const sostituto = ACCENTI[minuscolo];
      if (!sostituto) return carattere;
      return carattere === minuscolo ? sostituto : sostituto.toUpperCase();
    })
    .join('')
    // Tutto il resto che non sta nell'alfabeto della stampante sparisce invece
    // di diventare un geroglifico.
    .replace(/[^\x20-\x7e\n]/g, '');
}

function aCapo(testo, larghezza) {
  const righe = [];
  let corrente = '';
  for (const parola of String(testo).split(/\s+/).filter(Boolean)) {
    if (!corrente) corrente = parola;
    else if (`${corrente} ${parola}`.length <= larghezza) corrente = `${corrente} ${parola}`;
    else { righe.push(corrente); corrente = parola; }
  }
  if (corrente) righe.push(corrente);
  return righe.length ? righe : [''];
}

// Ogni tipo di riga ha il suo peso: il numero dell'ordine grande e centrato,
// cio' che va tolto in negativo perche' e' l'errore piu' caro, gli allergeni
// piccoli ma presenti.
const STILI = {
  number: { prima: [...COMANDI.centro, ...COMANDI.grande], dopo: [...COMANDI.normale, ...COMANDI.sinistra], righe: 1 },
  booking: { prima: [...COMANDI.centro, ...COMANDI.altoLargo, ...COMANDI.grassettoSi], dopo: [...COMANDI.grassettoNo, ...COMANDI.normale, ...COMANDI.sinistra], righe: 0 },
  meta: { prima: [], dopo: [], righe: 0 },
  section: { prima: [...COMANDI.grassettoSi], dopo: [...COMANDI.grassettoNo], righe: 0 },
  item: { prima: [...COMANDI.altoLargo, ...COMANDI.grassettoSi], dopo: [...COMANDI.grassettoNo, ...COMANDI.normale], righe: 0 },
  remove: { prima: [...COMANDI.negativoSi], dopo: [...COMANDI.negativoNo], righe: 0 },
  add: { prima: [...COMANDI.grassettoSi], dopo: [...COMANDI.grassettoNo], righe: 0 },
  note: { prima: [...COMANDI.grassettoSi], dopo: [...COMANDI.grassettoNo], righe: 0 },
  allergens: { prima: [], dopo: [], righe: 0 },
  footer: { prima: [...COMANDI.grassettoSi], dopo: [...COMANDI.grassettoNo], righe: 1 }
};

export function escPos(righe = [], larghezza = 42) {
  const pezzi = [Buffer.from(COMANDI.azzera)];
  const scrivi = testo => pezzi.push(Buffer.from(testo, 'latin1'));

  let precedente = null;
  for (const riga of righe) {
    if (riga.kind === 'separator') {
      scrivi(`${'-'.repeat(larghezza)}\n`);
      precedente = riga.kind;
      continue;
    }
    // Una riga vuota prima di ogni piatto e prima dello stacco del banco: senza,
    // i piatti si incollano l'uno all'altro e con le mani in pasta si sbaglia.
    if ((riga.kind === 'item' || riga.kind === 'section') && precedente && precedente !== 'separator') {
      scrivi('\n');
    }
    const stile = STILI[riga.kind] ?? STILI.meta;
    // Il numero e' corto e non va spezzato; il resto sta nella larghezza.
    const larga = riga.kind === 'number' ? Math.floor(larghezza / 2) : larghezza;
    pezzi.push(Buffer.from(stile.prima));
    scrivi(`${aCapo(testoPerStampante(riga.text), larga).join('\n')}\n`);
    pezzi.push(Buffer.from(stile.dopo));
    if (stile.righe) scrivi('\n'.repeat(stile.righe));
    precedente = riga.kind;
  }

  // Qualche riga vuota prima del taglio: se no la lama passa sull'ultima parola.
  scrivi('\n\n\n');
  pezzi.push(Buffer.from(COMANDI.taglia));
  return Buffer.concat(pezzi);
}
