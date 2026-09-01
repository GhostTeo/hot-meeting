# Hot Meeting

Web app per ordinazioni e gestione operativa della pizzeria Hot Meeting (Milano, Piola).

## Indirizzo pubblico

https://ghostteo.github.io/hot-meeting/

Il sito e' servito da GitHub Pages a partire dal branch `main`: ogni push su
`main` lo ripubblica, di solito entro qualche minuto.

## Aree

- Cliente: menu in italiano o inglese, personalizzazione pizza con ingredienti e aggiunte, allergeni, note, carrello, checkout e recap dell'ordine.
- Creator: calendario, apertura e chiusura turni, ordini presi al telefono, storico con modifica ordine, menu, forno e report.
- Cucina: solo la comanda. Numero grande, orario, minuti promessi, ritardo, e per ogni piatto quantita', cosa togliere, cosa aggiungere, la nota del cliente e gli allergeni. Ordinata per scadenza, con i due stati pronto e consegnato.

Creator e Cucina sono la stessa area riservata: le comande portano nome e
telefono di chi ordina, quindi la Cucina chiede l'accesso come il Creator.

## Attesa promessa al cliente

Le pizze escono a infornate, non a una a una: nel forno ce ne stanno sei e ogni
infornata dura quattro minuti dalla stesura alla consegna, cioe' circa novanta
pizze all'ora. Un ordine e' pronto quando esce l'infornata che contiene la sua
ultima pizza, piu un margine per incartare e consegnare.

Il conto lo fa il database, non il browser, e vale allo stesso modo per gli
ordini dal sito e per quelli presi al telefono: la coda del forno e' una sola.
Chi guarda il menu non puo' leggere gli ordini altrui, quindi il numero di pizze
in coda arriva da una vista pubblica che espone solo quel totale.

Le bibite non occupano il forno e non allungano l'attesa di nessuno; sulla
comanda ci sono lo stesso, in fondo e sotto la voce «al banco», perche' chi
consegna deve sapere cosa mettere nel sacchetto ma chi impasta non deve cercare
la pizza in mezzo alle lattine. I tre numeri
del forno si cambiano dal pannello Servizio; valgono per gli ordini successivi,
quelli gia' in coda tengono l'orario promesso.

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

## Sicurezza

Le prove sono state fatte contro il database vero, con la sola chiave pubblica.
Uno sconosciuto **non** puo': leggere ordini, telefoni, incassi, eventi, giornate
o calendario; cambiare un prezzo; creare o modificare prodotti; aprire o chiudere
un servizio; toccare lo stato di un ordine; registrare incassi; scrivere eventi.
Ogni tentativo viene respinto dalle policy RLS o dal controllo di ruolo dentro le
funzioni, e spesso da entrambi.

L'unica cosa che puo' fare e' quella per cui esiste il sito: creare un ordine.
Anche li' decide il server: il prezzo lo ricalcola dal listino (il totale
dichiarato dal client viene rifiutato come chiave sconosciuta), le quantita'
stanno fra 1 e 20, il payload non supera 32 KB, il metodo di pagamento deve
essere fra quelli previsti, e prodotto e servizio devono esistere ed essere
aperti.

Contro l'inondazione ci sono due tetti: cinque ordini ogni dieci minuti per
numero di telefono, e dieci ordini al minuto per servizio. Il secondo e' stato
aggiunto dopo aver verificato che cambiando numero a ogni ordine si riusciva a
riempire la cucina di comande finte.

Il testo di chi ordina non viene mai eseguito: un nome come
`<img src=x onerror=...>` compare come testo in ordini, cucina, scheda e storico.
In piu' il database ora rifiuta i nomi che non sono nomi.

Nel repository non ci sono segreti. La chiave nel codice e' quella pubblica, che
per progetto sta nel browser: la protezione sono le policy, non la chiave. La
pagina dichiara una Content Security Policy che impedisce l'esecuzione di script
estranei anche se qualcuno riuscisse a infilarli.

**Cosa resta scoperto, detto chiaro:** GitHub Pages non lascia impostare gli
header di sicurezza (c'e' solo HSTS, che mette lui). Non c'e' niente davanti al
sito che possa filtrare il traffico prima che arrivi al database. E l'accesso
Creator e' una sola coppia email/password senza secondo fattore: chi la ottiene
entra.

## Se qualcosa non va

Il guaio peggiore non e' internet che cade: quello si vede. E' il canale in
tempo reale che muore in silenzio mentre la pagina sembra viva, e la cucina
resta a guardare uno schermo fermo convinta che non arrivino ordini.

Contro questo ci sono tre cose. Il canale **si sorveglia e si riapre da solo**,
riprovando sempre piu' di rado e rileggendo tutto appena torna, cosi' quello
che e' successo nel frattempo non si perde. Ogni mezzo minuto c'e' un
**controllo di sicurezza** che rilegge comunque, anche se il canale tace: e' la
differenza fra accorgersi di un ordine con trenta secondi di ritardo e non
accorgersene mai. E quando il dispositivo si risveglia o la rete torna, i dati
si rileggono subito invece di aspettare.

In cima all'area riservata c'e' una **spia**: verde e discreta quando tutto va,
gialla o rossa quando no, con scritto in italiano cosa sta succedendo e un tasto
per riprovare. Serve perche' chi lavora se ne accorga da solo, senza dover
telefonare a qualcuno.

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

`docs/collegare-le-stampanti.md` e' la lista per la giornata di collegamento:
cosa portare, cosa serve sapere, cosa si fa e cosa non si puo' fare senza il
tecnico di cassa. Lo strumento `scripts/trova-stampanti.mjs` cerca le stampanti
sulla rete del locale e dice cosa ha trovato.

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

Il menu si modifica in qualsiasi momento dal pannello Creator, in una lingua
sola e in pochi campi: nome, prezzo, ingredienti scritti su una riga separati da
virgole, descrizione, foto, aggiunte a pagamento, allergeni fra i 14 dell'elenco
UE, tipo e disponibilita'. L'ordine in cui si scrivono gli ingredienti e' quello
in cui si leggono sul menu.

`supabase/seed-menu.mjs` carica una carta dimostrativa (dodici pizze e otto
bibite con foto segnaposto) passando dalle stesse funzioni del pannello.

Tutto passa da una sola operazione sul database, quindi non esiste un momento in
cui una pizza ha gia' i nuovi ingredienti ma ancora il vecchio prezzo. Un
prodotto mai venduto si elimina; uno gia' comparso in un ordine viene disattivato
invece di essere cancellato, perche' cancellarlo riscriverebbe ordini passati.

Un limite da conoscere: il prezzo di un'aggiunta appartiene all'ingrediente, non
alla singola pizza. Cambiare il prezzo delle olive come aggiunta lo cambia su
tutte le pizze che le offrono.

L'inglese degli ingredienti non si scrive a mano: lo mette un vocabolario di
cucina (`js/translate-menu.js`). Non e' un traduttore automatico ed e' voluto,
perche' un traduttore generico farebbe della Diavola una «Devil».

Una descrizione pero' e' una frase, non un elenco: il vocabolario la traduce solo
se la riconosce quasi tutta. Sotto quella soglia il menu inglese non mostra la
descrizione invece di mostrarne una mezza in italiano, e nell'editor c'e' un
campo per scriverla, gia' compilato quando la traduzione automatica regge.

`supabase/menu.json` contiene la carta: per caricarne una nuova si riscrive quel
file e si lancia `supabase/seed-menu.mjs`, che passa dalle stesse funzioni del
pannello Creator.

Ogni piatto puo' avere una **foto**, caricata dall'editor o indicata con un
indirizzo `https`. Le immagini stanno in un archivio pubblico in lettura e
scrivibile solo dal Creator. La foto segue una strada sua, separata dal resto
del prodotto: si aggiunge o si toglie senza toccare prezzo e ingredienti. Un
piatto senza foto compare con un riquadro decorato, mai con un'immagine rotta.

## Allergeni

Sono l'unica parte del menu che, sbagliata, manda qualcuno in ospedale, quindi
si vedono ovunque senza dover aprire niente: sulla scheda del piatto, nel
carrello, nella finestra di personalizzazione, nel riepilogo prima di
confermare, sulla ricevuta e sulla comanda in cucina.

Al cliente si mostra l'etichetta di legge per intero («Cereali contenenti
glutine»); in cucina la parola che si usa impastando («Glutine»), perche' li'
conta il colpo d'occhio. Un piatto senza allergeni lo dichiara lo stesso: il
silenzio non e' un'informazione.

Li dichiara il locale prodotto per prodotto: il programma non li deduce dagli
ingredienti.

## Avviso di un ordine nuovo

Quando entra un ordine, chi e' nel pannello Creator sente un trillo breve e il
telefono vibra. Il suono lo genera il browser, non e' un file da scaricare. I
browser non lasciano suonare una pagina finche' non e' stata toccata almeno una
volta: in cassa si tocca comunque, e prima di allora nessun ordine puo' essere
arrivato.

## Sala d'attesa

Dopo la conferma il cliente non resta con una ricevuta muta: vede a che punto e'
il suo ordine, e lo stato arriva dal server, non e' una barra che scorre da sola.
Se la cucina e' in ritardo, li' si vede; quando il tempo promesso scade ma la
pizza non e' ancora uscita, la barra si ferma appena prima della fine invece di
dire che e' pronta.

Il cliente non e' collegato e non puo' leggere gli ordini: legge solo il proprio,
mostrando il gettone ricevuto al momento dell'invio, e ne ricava soltanto stato e
minuti che restano.

## Chiusura di cassa

Da Report si stampa il riepilogo del pranzo, del serale o della giornata intera.
I contanti si contano a parte dall'elettronico, perche' nel cassetto c'e' solo il
primo, e i supplementi incassati dopo una modifica finiscono nel metodo con cui
sono stati presi. Entrano solo gli ordini chiusi: quello che e' ancora in forno
non e' incasso.

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

## Ordini e conferma

Prima di mandare in cucina il cliente vede un riepilogo: cosa ha ordinato con le
modifiche, gli allergeni, il totale, il pagamento, il nome, il numero e fra
quanto sara' pronto. Una pizza sbagliata scoperta li' costa un tocco, scoperta
dopo costa una pizza. Da li' si toglie una riga o si aggiunge quello che manca:
da bere per primo, perche' e' quello che manca davvero a chi ha ordinato una
pizza.

Un ordine appena arrivato porta un **pallino giallo** finche' il cameriere non lo
apre, e la voce Ordini mostra quanti ne restano da guardare: se ne arrivano tre
insieme, nessuno resta indietro. Le bibite sono in evidenza, su una riga a
parte: le prende lui al banco, non la cucina.

Nel pannello Creator la sezione Ordini tiene **solo quelli ancora da fare**:
segnato pronto, l'ordine sparisce dalla lista e resta nello Storico. Toccando un
ordine si apre la sua scheda con stato, orari, minuti promessi, pagamento,
totale, tutte le righe con modifiche e allergeni, e i contatti: il numero si
chiama con un tocco, l'email si scrive con un tocco.

## Storico e modifica ordine

Lo storico filtra per giornata operativa, turno, origine e stato, e cerca per
cliente, telefono, pagamento o numero ordine scrivendo `#3`. Un ordine non viene
mai cancellato: annullamenti e revisioni restano visibili.

Modificare un ordine vuol dire cambiarlo davvero: togliere un ingrediente da una
pizza, aggiungerne uno, cambiare le quantita' e mettere dentro un prodotto che
nell'ordine non c'era. Ci arriva solo il Creator, e il database lo verifica di
nuovo: la revisione passa da una funzione che rifiuta chiunque non abbia quel
ruolo. Si crea una nuova revisione e la versione precedente
resta nello storico. Il pagamento originale non viene mai alterato: la
differenza diventa un movimento separato, un supplemento da incassare o un
rimborso, che nasce in attesa e va poi registrato o annullato dal Creator. Nei
report entrano soltanto i movimenti registrati.

## Limiti dimostrativi

Apple Pay e Google Pay sono etichette dimostrative senza processore di
pagamento: nessun addebito, nessun rimborso reale. Non vengono inviati SMS ne'
email. L'ordine dal ristorante non e' ancora implementato.

Righe identiche si contano insieme: «2x Acqua» invece di due volte «1x Acqua»,
sia sulla comanda sia negli ordini.

La comanda esce da sola quando entra l'ordine, se in Cucina e' acceso
**«stampa la comanda appena arriva l'ordine»** (e' un'impostazione del singolo
dispositivo, va accesa su quello collegato alla stampante). Il browser apre
comunque la finestra di stampa: per farla uscire in silenzio, Chrome va avviato
con `--kiosk-printing` e una stampante predefinita. Ogni comanda esce una volta
sola, anche se la pagina si aggiorna. Il collegamento diretto alla stampante Epson e lo scontrino
fiscale non ci sono ancora: `docs/stampanti.md` spiega perche' e cosa serve.

**Nessun messaggio raggiunge il cliente.** Il tempo di attesa lo vede sulla
ricevuta subito dopo aver ordinato, ma sul telefono non arriva niente: mandare
un SMS o un messaggio WhatsApp senza che nessuno tocchi il telefono richiede un
operatore esterno a pagamento, con un account e una chiave. Finche' non c'e', in
app non ci sono nemmeno i bottoni: meglio un buco dichiarato che un bottone che
fa finta.

## Nome e telefono di chi ordina

Il nome serve per chiamare chi aspetta, il numero per avvisarlo se qualcosa non
va: un ordine intestato a «rifjodk» con dentro un numero inventato e' una pizza
che nessuno ritira.

Non si puo' verificare che un nome sia vero, si puo' solo scartare quello che un
nome non e'. Quindi si rifiuta cio' che e' palesemente battuto a caso (cifre,
sequenze di tastiera, lettere ripetute, parole senza vocali) e si **chiede
conferma** su cio' che sembra strano: rifiutare il nome vero di una persona e'
peggio che accettarne uno finto, e chi ha un cognome raro deve poter ordinare
la pizza. Nomi non latini, apostrofi e trattini passano senza domande.

Il numero vale per tutto il mondo, non solo per l'Italia: la pizzeria e' in una
citta' piena di turisti. Si conserva in formato internazionale, e chi scrive
senza prefisso si intende italiano. Numeri troppo corti, tutti uguali o in
sequenza vengono rifiutati, sul sito e di nuovo sul database.

Le informazioni sugli allergeni derivano dai dati inseriti dal locale, puo'
verificarsi contaminazione crociata e chi soffre di allergie gravi deve
contattare il personale prima dell'ordine.
