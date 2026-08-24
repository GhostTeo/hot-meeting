# Hot Meeting — design della prima build persistente

## Obiettivo

Creare una web app navigabile e versionata su GitHub che ricostruisca il prototipo concordato: Cliente, Creator e Cucina condividono menu, servizi, ordini e report mediante stato locale persistente.

## Architettura

La prima build è un'applicazione web statica senza dipendenze runtime. `js/domain.js` contiene le regole pure e testabili; `js/app.js` gestisce stato, navigazione e rendering; `styles.css` definisce l'interfaccia responsive. Lo stato viene salvato in `localStorage` e può essere sostituito in seguito da un database senza cambiare i concetti di dominio.

## Funzioni

- Cliente: catalogo pizze e bibite, personalizzazione, note e allergie, carrello, nome, telefono e pagamento demo.
- Creator: login dimostrativo, apertura/chiusura pranzo o serale, ordini web e ristorante, menu modificabile, report per turno e giornata.
- Cucina: dettaglio pizza per pizza, timer countdown, ritardo in upcounting rosso e unica azione `ORDINE PRONTO`.
- Gli ordini entrano automaticamente in preparazione e confluiscono nella stessa coda.
- Il riepilogo giornaliero diventa definitivo alla chiusura del servizio serale.

## Vincoli

- Nessuna credenziale reale nel frontend.
- Nessuna promessa di sicurezza alimentare derivata dalle note cliente.
- Nessun pagamento o invio WhatsApp reale nella prima build.
- Layout utilizzabile da telefono, tablet e desktop.

## Verifica

Test automatici per telefono, ETA, timer e aggregazioni; prova navigata dei flussi Cliente → Creator → Cucina.
