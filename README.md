# Hot Meeting

Web app per ordinazioni e gestione operativa della pizzeria Hot Meeting (Milano, Piola).

## Indirizzo pubblico

https://ghostteo.github.io/hot-meeting/

Il sito e' servito da GitHub Pages a partire dal branch `main`: ogni push su
`main` lo ripubblica, di solito entro qualche minuto.

## Aree

- Cliente: menu in italiano o inglese, personalizzazione pizza con ingredienti e aggiunte, allergeni, note, carrello, checkout e recap dell'ordine.
- Creator: calendario, apertura e chiusura turni, ordini, storico con modifica ordine, menu e report.
- Cucina: comande operative con timer, ritardo in evidenza e stato pronto.

## Giornata operativa

Il fuso di riferimento e' `Europe/Rome`. Pranzo e serale appartengono alla stessa
giornata operativa, che resta associata alla data di apertura anche dopo la
mezzanotte finche' non viene chiusa. Ogni giornata ha un progressivo ordini che
riparte da `01`. Un servizio non puo' essere chiuso finche' esistono ordini
ricevuti o in preparazione.

Il calendario gestisce la chiusura settimanale (inizialmente il martedi',
modificabile), i periodi di ferie e le aperture straordinarie. Nei giorni chiusi
il cliente vede il motivo e gli ordini online sono bloccati. Il calendario e'
condiviso: vive nella tabella `closures`, il cliente lo legge dalla vista
pubblica `public_closure_calendar` e una modifica raggiunge gli altri
dispositivi in tempo reale.

## Avvio locale

```bash
python3 -m http.server 4173
```

Aprire `http://localhost:4173`. L'accesso Creator usa l'utente Supabase
configurato. Le credenziali dimostrative `creator` / `pizza143` valgono
soltanto quando `js/config.js` e' in `mode: 'local'`.

## Persistenza

L'app e' collegata a un progetto Supabase reale: menu, giornate operative,
turni, ordini ed eventi vivono sul database, quindi cassa, cucina e cliente
vedono gli stessi dati da dispositivi diversi.

La configurazione e' in `js/config.js` e contiene soltanto URL del progetto e
chiave publishable. Quella chiave e' pubblica per progettazione: la protezione
reale sono le policy RLS, che negano all'anonimo ordini, telefoni, incassi ed
eventi. Nel repository e nel browser non devono mai finire la chiave
`service_role` ne' la password del database. Per puntare a un altro ambiente,
impostare `globalThis.HOT_MEETING_CONFIG` prima di caricare `app.js`, oppure
usare `mode: 'local'` per tornare al salvataggio nel browser.

Sul database vivono menu, calendario, giornate operative, turni, ordini, righe,
modifiche, movimenti di pagamento ed eventi. Restano nel browser soltanto i dati
che non hanno senso condividere: carrello, schermata corrente e sessione.

Schema, policy e RPC sono in `supabase/migrations/`. Per applicarli a un nuovo
progetto vanno eseguite in ordine tutte le migrazioni della cartella e poi
`supabase/seed.sql`. Vedere `supabase/README.md` per i limiti di sicurezza da
configurare in produzione, in particolare il rate limiting davanti a
`create_public_order`.

L'accesso Creator usa l'autenticazione Supabase con email e password. Il ruolo
viene letto da `app_metadata.role`, che deve valere `creator`.

## Guida operativa

`docs/operations.md` spiega l'uso quotidiano in pizzeria: giornata operativa,
apertura e chiusura dei turni, calendario e ferie, cucina, storico, modifica di
un ordine, report e limiti dimostrativi.

`docs/stampanti.md` riguarda le stampanti: comanda in cucina, scontrino fiscale,
cosa serve sapere dei due apparecchi in pizzeria e perche' una pagina `https` non
puo' parlare da sola con una stampante sulla rete locale.

## Test

```bash
npm test
```

I test di comportamento del database sono esclusi per impostazione predefinita.
Con Docker attivo e l'immagine `postgres:17-alpine` disponibile:

```bash
npm run test:db
```

## Menu

Il menu si modifica in qualsiasi momento dal pannello Creator: creare un
prodotto, rinominarlo in italiano e inglese, cambiarne descrizione, prezzo,
tipo, posizione e disponibilita', definire gli ingredienti inclusi, le aggiunte
con prezzo e quantita' massima, e dichiarare gli allergeni fra i 14 dell'elenco
UE.

Tutto passa da una sola operazione sul database, quindi non esiste un momento in
cui una pizza ha gia' i nuovi ingredienti ma ancora il vecchio prezzo. Un
prodotto mai venduto si elimina; uno gia' comparso in un ordine viene disattivato
invece di essere cancellato, perche' cancellarlo riscriverebbe ordini passati.

Un limite da conoscere: il prezzo di un'aggiunta appartiene all'ingrediente, non
alla singola pizza. Cambiare il prezzo delle olive come aggiunta lo cambia su
tutte le pizze che le offrono.

Ogni piatto puo' avere una **foto**, caricata dall'editor o indicata con un
indirizzo `https`. Le immagini stanno in un archivio pubblico in lettura e
scrivibile solo dal Creator. La foto segue una strada sua, separata dal resto
del prodotto: si aggiunge o si toglie senza toccare prezzo e ingredienti. Un
piatto senza foto compare con un riquadro decorato, mai con un'immagine rotta.

## Lingua e recap cliente

Il cliente sceglie fra italiano e inglese. L'italiano e' la lingua sorgente: se
una traduzione inglese manca, si mostra l'italiano invece di lasciare un buco.
Le etichette dei 14 allergeni UE arrivano gia' tradotte dal database.

Dopo la conferma compare un recap con il numero pubblico della giornata (per
esempio `25-08 · #03`), i prodotti con le personalizzazioni, gli allergeni
dichiarati, le note, il totale, il pagamento e il tempo di attesa. Il recap
resta anche ricaricando la pagina. Il telefono e' obbligatorio, l'email
facoltativa; l'invio del riepilogo via messaggio o email e' dimostrativo.

Il numero di telefono della pizzeria si imposta in `js/config.js` con
`pizzeriaPhone`. Finche' resta `null` il recap invita a contattare il locale
senza mostrare un numero inventato: va compilato prima di aprire al pubblico.

## Storico e modifica ordine

Lo storico filtra per giornata operativa, turno, origine e stato, e cerca per
cliente, telefono, pagamento o numero ordine scrivendo `#3`. Un ordine non viene
mai cancellato: annullamenti e revisioni restano visibili.

Modificando un ordine si crea una nuova revisione e la versione precedente
resta nello storico. Il pagamento originale non viene mai alterato: la
differenza diventa un movimento separato, un supplemento da incassare o un
rimborso, che nasce in attesa e va poi registrato o annullato dal Creator. Nei
report entrano soltanto i movimenti registrati.

## Limiti dimostrativi

Apple Pay e Google Pay sono etichette dimostrative senza processore di
pagamento: nessun addebito, nessun rimborso reale. Non vengono inviati SMS ne'
email. L'ordine dal ristorante non e' ancora implementato.

La comanda di cucina si stampa dal dialogo di stampa del browser (Cucina →
**Stampa comanda**). Il collegamento diretto alla stampante Epson e lo scontrino
fiscale non ci sono ancora: `docs/stampanti.md` spiega perche' e cosa serve.

Le informazioni sugli allergeni derivano dai dati inseriti dal locale, puo'
verificarsi contaminazione crociata e chi soffre di allergie gravi deve
contattare il personale prima dell'ordine.
