// Perche' l'accesso non e' andato.
//
// Prima qualunque intoppo diceva «Credenziali non corrette»: chi non entrava
// per colpa della rete cambiava la password venti volte senza motivo. Un
// messaggio sbagliato costa piu' di nessun messaggio.

export function loginProblem(error) {
  if (!error) return 'Accesso non riuscito.';
  const testo = `${error.code ?? ''} ${error.name ?? ''} ${error.message ?? ''}`.toLowerCase();
  const stato = Number(error.status ?? error.statusCode ?? 0);

  if (stato === 429 || testo.includes('rate limit') || testo.includes('rate_limit')) {
    return 'Troppi tentativi: aspetta un minuto e riprova.';
  }
  if (testo.includes('invalid login credentials') || testo.includes('invalid_credentials')) {
    return 'Email o password non corretti.';
  }
  if (testo.includes('email not confirmed') || testo.includes('email_not_confirmed')) {
    return 'Email non ancora confermata.';
  }
  if (testo.includes('failed to fetch') || testo.includes('networkerror') || testo.includes('network request failed')) {
    return 'Nessuna connessione: riprova fra un momento.';
  }
  if (testo.includes('localstorage') || testo.includes('securityerror') || testo.includes('access is denied')) {
    return 'Il browser blocca i dati del sito: esci dalla navigazione privata o consenti i cookie.';
  }
  return error.message ? `Accesso non riuscito: ${error.message}` : 'Accesso non riuscito.';
}
