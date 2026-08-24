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
- `orders` e `order_items`: dati cliente, origine, pagamento, tempi e stato.
- `order_item_changes`: ingredienti tolti, aggiunte, quantità e note.

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

## Vincoli

- Nessuna password o chiave di servizio privilegiata nel frontend; è ammessa la chiave pubblica anonima protetta da RLS.
- Nessuna promessa di sicurezza alimentare derivata dalle note cliente.
- Nessun pagamento o invio WhatsApp reale in questa fase.
- Layout utilizzabile da telefono, tablet e desktop.
- La modifica del menu deve essere persistente, visibile su dispositivi differenti e propagata in tempo reale.

## Verifica

Test automatici per telefono, ETA, timer, aggregazioni, calcolo personalizzazioni, fallback lingua e mapping allergeni. Test di integrazione per policy database e persistenza; prova navigata dei flussi Cliente → Creator → Cucina in italiano e inglese.
