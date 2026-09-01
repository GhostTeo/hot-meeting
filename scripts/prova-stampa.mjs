// Manda una comanda di prova a una stampante di rete.
//
//   node scripts/prova-stampa.mjs 192.168.1.50
//   node scripts/prova-stampa.mjs 192.168.1.50 58     (carta da 58 mm)
//
// E' la prima prova da fare in pizzeria, appena la stampante ha un indirizzo:
// se questa comanda esce, esce tutto. Se non esce, il problema e' nella rete o
// nell'indirizzo, non nel programma.

import net from 'node:net';

import { buildKitchenTicket } from '../js/print/kitchen-ticket.js';
import { escPos } from '../js/print/escpos.js';

const [ip, larghezzaCarta = '80'] = process.argv.slice(2);
if (!ip) {
  console.error('Serve l\'indirizzo della stampante: node scripts/prova-stampa.mjs 192.168.1.50');
  process.exit(1);
}

// Su carta da 80 mm ci stanno 42 caratteri per riga, su quella da 58 ne stanno
// 32: sono le due misure che si trovano in pizzeria.
const COLONNE = larghezzaCarta === '58' ? 32 : 42;

const ordineDiProva = {
  sequence: 99,
  source: 'WEB',
  customer: 'PROVA DI STAMPA',
  payment: 'Paga in cassa',
  createdAt: Date.now(),
  readyAt: Date.now() + 9 * 60000,
  items: [
    {
      quantity: 2, name: 'Margherita',
      removed: ['Basilico'],
      additions: [{ name: 'Olive', quantity: 1 }],
      allergens: [{ label_it: 'Cereali contenenti glutine' }, { label_it: 'Latte' }]
    },
    {
      quantity: 1, name: 'Diavola',
      note: 'Allergico alle noci',
      allergens: [{ label_it: 'Cereali contenenti glutine' }]
    },
    { quantity: 2, name: 'Coca-Cola' }
  ]
};

const righe = buildKitchenTicket(ordineDiProva, {
  isDrink: item => /cola|acqua|birra|fanta|sprite/i.test(item.name)
});
const byte = escPos(righe, COLONNE);

console.log(`Mando ${byte.length} byte a ${ip}:9100 (carta da ${larghezzaCarta} mm, ${COLONNE} colonne)...`);

const presa = new net.Socket();
presa.setTimeout(5000);

presa.on('timeout', () => {
  console.error('\nLa stampante non ha risposto entro cinque secondi.');
  console.error('Controlla che sia accesa, che l\'indirizzo sia giusto e che sia sulla stessa rete del portatile.');
  presa.destroy();
  process.exit(1);
});

presa.on('error', errore => {
  console.error(`\nNon si riesce a parlare con la stampante: ${errore.message}`);
  console.error('Se dice ECONNREFUSED, la porta 9100 e\' chiusa: la stampante potrebbe volere un\'altra strada.');
  process.exit(1);
});

presa.connect(9100, ip, () => {
  presa.write(byte, () => {
    presa.end();
    console.log('Inviata. Se la carta e\' uscita, la strada e\' aperta.');
    console.log('Guarda che il numero 99 sia grande, che «SENZA Basilico» si legga in negativo');
    console.log('e che le bibite stiano in fondo sotto «AL BANCO».');
  });
});
