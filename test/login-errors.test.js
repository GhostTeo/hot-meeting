import assert from 'node:assert/strict';
import test from 'node:test';

import { loginProblem } from '../js/login-errors.js';

// «Credenziali non corrette» a ogni intoppo manda a cercare nel posto sbagliato:
// chi non entra per colpa della rete cambia la password venti volte.

test('dice password sbagliata solo quando lo e davvero', () => {
  assert.equal(loginProblem({ message: 'Invalid login credentials' }), 'Email o password non corretti.');
  assert.equal(loginProblem({ code: 'invalid_credentials' }), 'Email o password non corretti.');
});

test('distingue la rete dalla password', () => {
  assert.equal(loginProblem({ message: 'Failed to fetch' }), 'Nessuna connessione: riprova fra un momento.');
  assert.equal(loginProblem({ name: 'TypeError', message: 'NetworkError when attempting to fetch resource' }), 'Nessuna connessione: riprova fra un momento.');
});

test('riconosce il blocco per troppi tentativi', () => {
  assert.equal(loginProblem({ status: 429 }), 'Troppi tentativi: aspetta un minuto e riprova.');
  assert.equal(loginProblem({ message: 'over_request_rate_limit' }), 'Troppi tentativi: aspetta un minuto e riprova.');
});

test('riconosce il browser che blocca i dati del sito', () => {
  assert.equal(
    loginProblem({ name: 'SecurityError', message: 'The operation is insecure. localStorage' }),
    'Il browser blocca i dati del sito: esci dalla navigazione privata o consenti i cookie.'
  );
});

test('quando non sa, lo dice invece di inventare una causa', () => {
  assert.equal(loginProblem({ message: 'boom' }), 'Accesso non riuscito: boom');
  assert.equal(loginProblem(), 'Accesso non riuscito.');
});
