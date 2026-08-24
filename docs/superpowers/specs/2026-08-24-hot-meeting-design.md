# Hot Meeting — design della web app persistente e bilingue

## Obiettivo

Creare una web app navigabile e versionata su GitHub che ricostruisca il prototipo concordato: Cliente, Creator e Cucina condividono menu, servizi, ordini e report mediante un database online persistente. Il cliente può usare italiano o inglese e personalizzare ogni pizza prima del carrello.

## Architettura

Il frontend rimane una web app responsive distribuita dal repository GitHub. `js/domain.js` contiene regole pure e testabili; moduli separati gestiscono Cliente, Creator, Cucina, traduzioni e accesso dati. Supabase fornisce Postgres, autenticazione Creator, Storage per le foto e aggiornamenti Realtime. Una cache locale permette una lettura resiliente, ma Supabase è l'unica fonte autorevole.

Le tabelle principali sono:

- `products`: tipo, prezzo, foto, disponibilità e ordinamento.
- `product_translations`: nome e descrizione per `it` e `en`.
- `ingredients`: ingrediente, traduzioni, prezzo aggiunta e disponibilità.
- `product_ingredients`: ingredienti inclusi, removibilità e possibilità di aggiunta.
- `allergens`: i 14 allergeni UE con etichette italiane e inglesi predefinite.
- `product_allergens`: associazioni confermate manualmente dal Creator.
- `services`: turno pranzo/serale, apertura, chiusura e capacità.
- `business_days`: data operativa, stato, progressivo ordine e chiusura definitiva.
- `service_sessions`: ogni apertura/riapertura di pranzo o cena associata alla giornata operativa.
- `closures`: chiusura settimanale, ferie, aperture straordinarie e messaggio pubblico.
- `orders` e `order_items`: dati cliente, origine, pagamento, tempi e stato.
- `order_item_changes`: ingredienti tolti, aggiunte, quantità e note.
- `order_revisions`: versioni originali e successive delle comande modificate.
- `payment_adjustments`: supplementi, rimborsi e relativo stato.
- `events`: registro append-only delle azioni operative rilevanti.

Le policy Row Level Security consentono lettura pubblica del menu disponibile; soltanto il Creator autenticato può modificarlo. Gli ordini possono essere creati dal flusso pubblico usando un'operazione server controllata, mentre dati personali, ordini completi e report restano accessibili soltanto al Creator.

## Funzioni

- Cliente: catalogo fotografico di pizze e bibite, selettore `IT / EN`, personalizzazione, note, allergeni, carrello, nome, telefono e pagamento demo.
- Creator: autenticazione reale, apertura/chiusura pranzo o serale, ordini web e ristorante, menu modificabile, report per turno e giornata.
- Cucina: dettaglio pizza per pizza, timer countdown, ritardo in upcounting rosso e unica azione `ORDINE PRONTO`.
- Gli ordini entrano automaticamente in preparazione e confluiscono nella stessa coda.
- Il riepilogo giornaliero diventa definitivo alla chiusura del servizio serale.

## Menu e traduzione

Il Creator può creare, riordinare, modificare, disattivare ed eliminare pizze e bibite. Può cambiare foto, prezzo, ingredienti inclusi, ingredienti removibili, aggiunte, quantità massima e allergeni.

L'italiano è la lingua sorgente. Al salvataggio di un testo italiano, una funzione server genera una bozza inglese soltanto se il campo inglese è vuoto o se il Creator chiede esplicitamente di rigenerarla. Il Creator può correggere la bozza; la versione corretta viene salvata e non viene sovrascritta automaticamente. Le etichette dei 14 allergeni sono predefinite e non vengono tradotte liberamente.

## Personalizzazione e allergeni

La pagina di personalizzazione mostra foto grande, ingredienti inclusi con controlli `− / +`, aggiunte con quantità, prezzo aggiornato e un campo note per la singola pizza. Il carrello conserva una configurazione indipendente per ogni pizza.

Gli allergeni del prodotto vengono mostrati sempre vicino agli ingredienti, sia nella scheda sia nella personalizzazione. La nota cliente viene evidenziata in Cucina se contiene termini relativi ad allergie, celiachia o intolleranze, ma non modifica né sostituisce gli allergeni ufficiali dichiarati dal Creator.

La didascalia cliente specifica che le informazioni derivano dai dati forniti dal locale, che possono verificarsi contaminazioni crociate e che chi soffre di allergie gravi deve contattare il personale prima dell'ordine. Il testo finale sarà verificato dal responsabile del locale prima della pubblicazione.

## Fotografie

Le immagini dimostrative iniziali sono fotografie con licenza utilizzabile. Il Creator può sostituirle caricando file in Supabase Storage. Il database conserva il riferimento dell'immagine, non il file nel record del prodotto.

## Calendario e giornata operativa

Il calendario è interno alla web app e usa il fuso `Europe/Rome`. Il martedì è la chiusura settimanale iniziale, modificabile dal Creator. Il Creator può inserire periodi di ferie con data iniziale, data finale e messaggio pubblico; nei giorni chiusi il cliente vede il motivo e gli ordini online sono bloccati. Un'apertura straordinaria può sovrascrivere la chiusura ricorrente per una data specifica.

La giornata operativa viene assegnata all'apertura del primo servizio. Se il servizio serale supera la mezzanotte, ordini, incassi e progressivi restano associati alla data di apertura finché il servizio serale non viene chiuso definitivamente. Soltanto a quel punto la giornata diventa chiusa e la successiva apertura crea una nuova giornata.

## Servizi, chiusura e riapertura

Pranzo e cena possono essere aperti, chiusi e riaperti nella stessa giornata. La riapertura continua lo stesso report e la stessa sequenza ordini; ogni intervallo di apertura viene comunque conservato in `service_sessions`.

La chiusura è impedita quando esistono ordini ricevuti o in preparazione. Con coda vuota, un dialogo riepiloga turno, data operativa, ordini, pizze, lordo e netto e richiede conferma esplicita. La chiusura del serale propone anche la chiusura definitiva della giornata. Ogni apertura, tentativo bloccato, chiusura, riapertura e conferma viene registrato negli eventi.

## Numerazione e storico ordini

Ogni giornata operativa ha un progressivo indipendente che parte da `01`. Il numero pubblico usa data operativa e progressivo, per esempio `23-08 · #01`, così due ordini di giorni diversi non sono confondibili. L'identificatore interno rimane globale e immutabile.

Lo storico conserva filtri per data, servizio, origine, stato, numero, cliente, telefono e pagamento. Un ordine non viene cancellato fisicamente: annullamento e rettifiche sono eventi registrati e mantengono la traccia precedente.

## Report

I report considerano ordini completati e attribuiscono ogni movimento alla relativa giornata operativa:

- pranzo e cena per singolo turno;
- totale giornaliero;
- mensile per mese solare;
- semestrale fisso gennaio–giugno o luglio–dicembre;
- annuale per anno solare.

Ogni report mostra ordini, pizze, lordo, trattenute, supplementi, rimborsi e netto. I pannelli giornalieri si svuotano all'apertura di una nuova giornata, ma i dati non vengono eliminati: restano consultabili nello storico e alimentano i report aggregati.

## Recap e contatti cliente

Il telefono è obbligatorio e l'email è facoltativa. Dopo la conferma viene mostrato un recap persistente e viene predisposto l'invio dimostrativo via messaggio; se presente, anche via email. Il recap contiene codice pubblico, prodotti e personalizzazioni, allergeni e note, totale, pagamento, ETA, numero telefonico della pizzeria e invito a contattarla in caso di problemi. Provider SMS/email reali verranno scelti in una fase separata e non sono inclusi nel primo collegamento Supabase.

## Modifica ordine e differenze di pagamento

Il Creator può modificare un ordine ricevuto conservando la versione originale e creando una nuova revisione. Se il totale aumenta, viene creato un supplemento con scelta dimostrativa tra Apple Pay, Google Pay e pagamento in cassa. Se diminuisce, viene registrato un rimborso dimostrativo. Stato dell'ordine e stato del movimento economico rimangono separati.

In produzione, Apple Pay e Google Pay verranno forniti tramite un processore di pagamento e ogni supplemento richiederà una nuova autorizzazione del cliente; non verranno eseguiti addebiti nascosti.

## Registro eventi e costi

Il registro eventi è append-only e salva attore, azione, entità, data/ora, giornata operativa e metadati minimi necessari. Viene usato per audit e ricostruzione, mentre i report leggono tabelle transazionali indicizzate per non dipendere da scansioni costose.

La prima distribuzione usa Supabase Free e non abilita upgrade o addebiti automatici. Il Creator mostra un indicatore di utilizzo e avvisa al 70% delle quote note. Le immagini vengono compresse prima del caricamento; i dati storici non vengono cancellati automaticamente.

## Vincoli

- Nessuna password o chiave di servizio privilegiata nel frontend; è ammessa la chiave pubblica anonima protetta da RLS.
- Nessuna promessa di sicurezza alimentare derivata dalle note cliente.
- Nessun pagamento o invio WhatsApp reale in questa fase.
- Layout utilizzabile da telefono, tablet e desktop.
- La modifica del menu deve essere persistente, visibile su dispositivi differenti e propagata in tempo reale.
- Nessun servizio può chiudere con ordini attivi.
- Nessun evento storico può essere sovrascritto o eliminato dall'interfaccia ordinaria.
- Nessun pagamento reale, rimborso reale o messaggio esterno viene inviato nella modalità dimostrativa.

## Verifica

Test automatici per telefono, ETA, timer, aggregazioni, calcolo personalizzazioni, fallback lingua, mapping allergeni, giornata operativa oltre mezzanotte, progressivo giornaliero, chiusura bloccata, riapertura, report periodici e differenze di pagamento. Test di integrazione per policy database, persistenza ed eventi; prova navigata dei flussi Cliente → Creator → Cucina in italiano e inglese.
