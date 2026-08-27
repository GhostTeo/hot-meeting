import assert from 'node:assert/strict';
import test from 'node:test';

import { looksLikeName, nameCheck, normalizePhoneNumber, phoneProblem } from '../js/customer-identity.js';

// Non si puo' verificare che un nome sia vero: si puo' solo scartare quello che
// un nome non e'. E il numero deve valere anche per un turista, non solo per un
// italiano.

test('i nomi di tutto il mondo passano', () => {
  for (const nome of ['Marco', 'Anna Rossi', "O'Brien", 'Müller', 'Nguyen', 'Zhang Wei', 'Jean-Pierre', 'Björk', 'Álvarez', '李伟', 'Владимир']) {
    assert.equal(looksLikeName(nome), true, nome);
  }
});

test('quello che non e un nome viene rifiutato subito', () => {
  for (const finto of ['asdf', 'qwerty', 'aaaa', 'xxxxx', '123', 'a', '', '   ', 'ffff ggg', 'Marco123', 'bcdfg']) {
    assert.equal(nameCheck(finto), 'no', finto);
  }
});

test('quello che sembra strano si fa confermare invece di rifiutarlo', () => {
  // «dk» in fondo non lo pronuncia nessuno, ma se qualcuno si chiama davvero
  // cosi' deve poter ordinare: si chiede conferma, non si sbatte fuori.
  assert.equal(nameCheck('rifjodk'), 'ask');
  assert.equal(nameCheck('Marco'), 'ok');
});

test('il numero italiano resta italiano anche scritto come viene', () => {
  assert.equal(normalizePhoneNumber('333 123 4567'), '+393331234567');
  assert.equal(normalizePhoneNumber('+39 333 123 4567'), '+393331234567');
  assert.equal(normalizePhoneNumber('0039 333 1234567'), '+393331234567');
  assert.equal(normalizePhoneNumber('02 1234567'), '+39021234567');
});

test('il turista scrive il suo prefisso e va bene lo stesso', () => {
  assert.equal(normalizePhoneNumber('+44 7700 900123'), '+447700900123');
  assert.equal(normalizePhoneNumber('+1 (415) 555-0132'), '+14155550132');
  assert.equal(normalizePhoneNumber('+49 151 23456789'), '+4915123456789');
});

test('i numeri inventati non passano, e si dice perche', () => {
  // 12345 e' corto e in sequenza: la seconda cosa e' quella che conta dirgli.
  assert.equal(phoneProblem('12345'), 'Questo numero non esiste: scrivi quello vero.');
  assert.equal(phoneProblem('0000000000'), 'Questo numero non esiste: scrivi quello vero.');
  assert.equal(phoneProblem('1111111111'), 'Questo numero non esiste: scrivi quello vero.');
  assert.equal(phoneProblem('1234567890'), 'Questo numero non esiste: scrivi quello vero.');
  assert.equal(phoneProblem('+1 415 555 0132'), null);
  assert.equal(phoneProblem('333 123 4567'), null);
  assert.equal(phoneProblem('pizza'), 'Scrivi un numero di telefono.');
});

test('un numero italiano che non comincia come deve viene fermato', () => {
  assert.equal(phoneProblem('123 456 7891'), 'Se il numero non e italiano, scrivilo con il prefisso: +44, +33...');
});

test('un cognome cortissimo senza vocali si fa confermare, non si rifiuta', () => {
  // «Ng» e' un cognome vietnamita vero; «bcdfg» e' una manata sulla tastiera.
  assert.equal(nameCheck('Ng'), 'ask');
  assert.equal(nameCheck('bcdfg'), 'no');
});

test('un cellulare italiano a cui manca una cifra viene fermato', () => {
  // Il difetto era qui: aggiungendo +39 il numero arrivava a dieci cifre e
  // sembrava lungo abbastanza, ma il cellulare ne vuole dieci sue.
  assert.equal(phoneProblem('34670958'), 'Al numero mancano delle cifre: un cellulare italiano ne ha dieci.');
  assert.equal(phoneProblem('346709583'), 'Al numero mancano delle cifre: un cellulare italiano ne ha dieci.');
  assert.equal(phoneProblem('3467095833'), null);
  assert.equal(phoneProblem('+39 346 709 5833'), null);
  assert.equal(phoneProblem('34670958333'), 'Il numero ha una cifra di troppo: controllalo.');
});

test('il fisso italiano ha una lunghezza sua', () => {
  assert.equal(phoneProblem('02 1234567'), null);
  assert.equal(phoneProblem('0212'), 'Al numero mancano delle cifre.');
});

test('il numero straniero si giudica su quello che scrive il turista', () => {
  assert.equal(phoneProblem('+44 7700 900123'), null);
  assert.equal(phoneProblem('+44 77'), 'Al numero mancano delle cifre.');
});
