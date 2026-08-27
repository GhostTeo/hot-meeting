// Nome e telefono di chi ordina.
//
// Servono davvero: il nome per chiamarlo quando la pizza esce, il numero per
// avvisarlo se qualcosa non va. Un ordine intestato a «rifjodk» con dentro un
// numero inventato e' una pizza che nessuno ritira.
//
// Detto questo, non si puo' verificare che un nome sia vero: si puo' solo
// scartare quello che un nome non e'. Meglio lasciar passare qualche nome
// strano che rifiutare quello di una persona vera, quindi qui si blocca solo
// cio' che e' palesemente battuto a caso.
//
// E vale per tutto il mondo: chi viene da fuori si chiama Nguyen, O'Brien,
// Müller o 李伟, e ha un numero che non comincia per 3.

const LETTERE = /^[\p{L}\p{M}][\p{L}\p{M}\s'’.\-]*$/u;
const VOCALI = /[aeiouyàáâäãåèéêëìíîïòóôöõùúûüæø]/i;
const NON_LATINO = /[^\p{Script=Latin}\p{M}\s'’.\-]/u;
const TRIPLA = /(.)\1\1/u;
const TASTIERA = /(qwert|asdf|zxcv|jkl|hjkl|wasd|1234|abcd)/i;

// Coppie di consonanti che nei nomi non esistono in nessuna lingua: «dk» in
// fondo a una parola non lo pronuncia nessuno. Si elencano quelle vietate e non
// quelle ammesse, perche' l'elenco di cio' che esiste nel mondo non lo conosce
// nessuno, e rifiutare il nome vero di una persona e' il danno peggiore.
const IMPOSSIBILI = new Set([
  'dk','dq','fk','fq','gk','gq','jd','jf','jg','jk','jm','jn','jp','jq','jr','jt','jv','jw',
  'jx','jz','kq','mq','pq','qb','qc','qd','qf','qg','qh','qj','qk','ql','qm','qn','qp','qq',
  'qr','qs','qt','qv','qw','qx','qz','vk','vq','wq','xk','xq','zq','zx','xz','vf','vg','vp',
  'fv','kx','gx','bx','px','tx','dx','hx','xj','xv','xw'
]);

// Tre esiti invece di due: quello che di sicuro non e' un nome si rifiuta,
// quello che sembra strano si fa confermare. Rifiutare il nome vero di una
// persona e' peggio che accettarne uno finto: chi ha davvero un cognome raro
// deve poter ordinare la pizza.
export function nameCheck(value = '') {
  const nome = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (nome.length < 2 || nome.length > 80) return 'no';
  if (!LETTERE.test(nome)) return 'no';
  if (TRIPLA.test(nome)) return 'no';
  if (TASTIERA.test(nome)) return 'no';
  // Un nome in caratteri latini ha delle vocali. Fuori dall'alfabeto latino la
  // regola non vale, e non deve essere un ostacolo per chi non lo usa.
  if (NON_LATINO.test(nome)) return 'ok';
  // Senza vocali di solito e' una manata sulla tastiera, ma «Ng» e' un cognome
  // vietnamita: se e' cortissimo si chiede, non si rifiuta.
  const parti = nome.split(' ');
  if (!parti.every(parte => VOCALI.test(parte))) {
    return parti.every(parte => parte.length <= 3) ? 'ask' : 'no';
  }

  // Via gli accenti prima di guardare le consonanti: altrimenti la dieresi di
  // «Björk» spezzerebbe la parola e farebbe sembrare strano un nome comune.
  const gruppi = nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z]/g, ' ')
    .split(/[aeiouy\s]+/).filter(gruppo => gruppo.length >= 2);
  const strano = gruppi.some(gruppo => {
    for (let i = 0; i + 1 < gruppo.length; i += 1) {
      if (IMPOSSIBILI.has(gruppo.slice(i, i + 2))) return true;
    }
    return false;
  });
  return strano ? 'ask' : 'ok';
}

export function looksLikeName(value) {
  return nameCheck(value) === 'ok';
}

// In formato internazionale, sempre: e' l'unico che funziona per chiamare e per
// mandare un messaggio, da qualsiasi paese arrivi chi ordina.
export function normalizePhoneNumber(value = '') {
  const scritto = String(value ?? '').trim();
  const cifre = scritto.replace(/\D/g, '');
  if (!cifre) return '';
  if (scritto.startsWith('+')) return `+${cifre}`;
  // «00» e' il prefisso internazionale, ma un fisso italiano comincia per 0 e
  // un numero inventato per 000: internazionale solo se dopo c'e' un paese.
  if (cifre.startsWith('00') && cifre[2] !== '0') return `+${cifre.slice(2)}`;
  // Senza prefisso si intende l'Italia: e' una pizzeria di Milano.
  return `+39${cifre}`;
}

function inventato(cifre) {
  if (/^(\d)\1+$/.test(cifre)) return true;
  const crescente = cifre.split('').every((c, i, tutte) =>
    i === 0 || Number(c) === (Number(tutte[i - 1]) + 1) % 10);
  return crescente;
}

export function phoneProblem(value = '') {
  const scritto = String(value ?? '').trim();
  if (!/\d/.test(scritto)) return 'Scrivi un numero di telefono.';

  const cifre = scritto.replace(/\D/g, '');
  const internazionale = scritto.startsWith('+') || (cifre.startsWith('00') && cifre[2] !== '0');
  const normalizzato = normalizePhoneNumber(scritto);
  const tutte = normalizzato.replace('+', '');
  // Il numero italiano si giudica sulle sue cifre, non su quelle col prefisso:
  // «34670958» col +39 davanti arriva a dieci e sembrava lungo abbastanza,
  // mentre a un cellulare italiano mancavano due cifre.
  const italiano = !internazionale || tutte.startsWith('39');
  const nazionale = italiano ? tutte.slice(2) : tutte;

  if (inventato(nazionale) || inventato(tutte)) return 'Questo numero non esiste: scrivi quello vero.';

  if (italiano) {
    if (/^3/.test(nazionale)) {
      if (nazionale.length < 10) return 'Al numero mancano delle cifre: un cellulare italiano ne ha dieci.';
      if (nazionale.length > 10) return 'Il numero ha una cifra di troppo: controllalo.';
      return null;
    }
    if (/^0/.test(nazionale)) {
      if (nazionale.length < 6) return 'Al numero mancano delle cifre.';
      if (nazionale.length > 11) return 'Il numero ha una cifra di troppo: controllalo.';
      return null;
    }
    // Un numero italiano comincia per 3 se e' un cellulare, per 0 se e' fisso.
    // Chi scrive altro quasi sempre ha dimenticato il proprio prefisso.
    return 'Se il numero non e italiano, scrivilo con il prefisso: +44, +33...';
  }

  // Fuori dall'Italia le lunghezze cambiano paese per paese: si controlla che
  // stia nei limiti internazionali, senza fingere di conoscerli tutti.
  if (tutte.length < 10) return 'Al numero mancano delle cifre.';
  if (tutte.length > 15) return 'Il numero ha una cifra di troppo: controllalo.';
  return null;
}
