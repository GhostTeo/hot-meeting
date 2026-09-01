// Trova le stampanti sulla rete della pizzeria.
//
//   node scripts/trova-stampanti.mjs
//
// Va lanciato dal portatile collegato alla STESSA rete delle stampanti, con il
// cavo o col wifi del locale. Non installa niente e non tocca niente: bussa e
// basta.

import net from 'node:net';
import os from 'node:os';

import { indirizziDellaRete, riconosciStampante } from './rete.js';

const PORTE = [9100, 80, 631, 515];
const ATTESA = 500;
const INSIEME = 120;

function reteLocale() {
  for (const schede of Object.values(os.networkInterfaces())) {
    for (const scheda of schede ?? []) {
      if (scheda.family === 'IPv4' && !scheda.internal) return scheda;
    }
  }
  return null;
}

function bussa(ip, porta) {
  return new Promise(risolvi => {
    const presa = new net.Socket();
    const chiudi = esito => { presa.destroy(); risolvi(esito); };
    presa.setTimeout(ATTESA);
    presa.once('connect', () => chiudi(true));
    presa.once('timeout', () => chiudi(false));
    presa.once('error', () => chiudi(false));
    presa.connect(porta, ip);
  });
}

async function chiedi(url) {
  const stop = AbortSignal.timeout(1500);
  try {
    const risposta = await fetch(url, { signal: stop });
    return { ok: risposta.ok, stato: risposta.status, testo: (await risposta.text()).slice(0, 4000) };
  } catch {
    return null;
  }
}

async function esamina(ip) {
  const porte = [];
  for (const porta of PORTE) if (await bussa(ip, porta)) porte.push(porta);
  if (!porte.length) return null;

  let fpmate = false;
  let nome = '';
  if (porte.includes(80)) {
    // Le Epson fiscali italiane rispondono qui: e' il modo per riconoscerle.
    // Non basta che risponda: un router risponde a tutto con una pagina di
    // errore. Deve rispondere «bene» e parlare la lingua delle fiscali.
    const fiscale = await chiedi(`http://${ip}/cgi-bin/fpmate.cgi`);
    fpmate = Boolean(fiscale?.ok && /fiscal|printerFiscal|<\?xml|<response/i.test(fiscale.testo));
    const pagina = await chiedi(`http://${ip}/`);
    const titolo = pagina?.testo.match(/<title>([^<]{1,80})<\/title>/i)?.[1];
    const modello = pagina?.testo.match(/\b(TM-[A-Za-z0-9-]+|FP-[A-Za-z0-9-]+)\b/)?.[1];
    nome = [modello, titolo].filter(Boolean).join(' · ');
  }
  return { ip, porte, fpmate, nome, ...riconosciStampante({ porte, fpmate }) };
}

async function aGruppi(elenco, quanti, lavoro) {
  const risultati = [];
  for (let i = 0; i < elenco.length; i += quanti) {
    risultati.push(...await Promise.all(elenco.slice(i, i + quanti).map(lavoro)));
  }
  return risultati.filter(Boolean);
}

const scheda = reteLocale();
if (!scheda) {
  console.error('Nessuna rete trovata: collega il portatile al wifi o al cavo della pizzeria.');
  process.exit(1);
}

const indirizzi = indirizziDellaRete(scheda.address, scheda.netmask);
console.log(`Il portatile e' ${scheda.address} — cerco fra ${indirizzi.length} indirizzi della stessa rete.\n`);

const trovati = await aGruppi(indirizzi, INSIEME, esamina);

if (!trovati.length) {
  console.log('Nessun apparecchio ha risposto.');
  console.log('Controlla che le stampanti siano accese e sulla stessa rete del portatile.');
} else {
  for (const t of trovati) {
    console.log(`${t.ip}${t.nome ? `  (${t.nome})` : ''}`);
    console.log(`   porte aperte: ${t.porte.join(', ')}`);
    console.log(`   ${t.tipo.toUpperCase()}: ${t.nota}\n`);
  }
  const fiscali = trovati.filter(t => t.tipo === 'fiscale').length;
  const comande = trovati.filter(t => t.tipo === 'comande').length;
  console.log(`Trovate ${comande} stampanti da comande e ${fiscali} fiscali.`);
}
