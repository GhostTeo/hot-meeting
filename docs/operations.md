# Guida operativa Hot Meeting

Per chi usa l'app in pizzeria. Il fuso di riferimento e' sempre `Europe/Rome`.

## Le tre aree

**Cliente** e' la parte pubblica: menu, personalizzazione, carrello, ordine e
recap. **Creator** e' l'area riservata di chi gestisce. **Cucina** mostra solo le
comande da preparare, con il timer.

Si passa da una all'altra con i tre pulsanti in alto.

## Accesso Creator

Serve l'utente Supabase configurato per la pizzeria, con email e password. Il
ruolo `creator` va assegnato all'utente: senza, l'app mostra il menu ma non
lascia aprire servizi ne' leggere ordini.

## La giornata operativa

Una giornata comincia quando apri il primo servizio e resta legata a quella data
anche dopo la mezzanotte, finche' non la chiudi. Un ordine preso all'una di notte
appartiene ancora alla serata precedente: gli incassi non si spezzano a meta'.

Ogni giornata ha una numerazione che riparte da `01`. Il numero che vede il
cliente unisce data e progressivo, per esempio `25-08 · #03`, cosi' due ordini di
giorni diversi non si confondono.

Pranzo e serale appartengono alla stessa giornata e condividono la numerazione:
il primo ordine della cena continua dopo l'ultimo del pranzo.

## Aprire, chiudere, riaprire

**Aprire** un servizio lo rende visibile al cliente e fa partire gli ordini
online.

**Chiudere** e' possibile solo con la coda vuota. Se restano ordini ricevuti o in
preparazione l'app rifiuta la chiusura e ti mostra quali sono. Con la coda vuota
compare un riepilogo con data operativa, ordini, pizze, lordo e netto, e ti
chiede conferma.

**Riaprire** lo stesso servizio continua la stessa giornata e la stessa
numerazione. La riapertura torna sempre ad accettare ordini online: se vuoi
sospenderli lo fai dalla sezione Ordini, e la sospensione vale finche' il
servizio resta aperto.

Chiudendo il serale puoi chiudere anche la giornata. Da quel momento la giornata
e' conclusa; se devi riaprire, usa "Riapri servizio" sul turno gia' esistente,
che riapre anche la giornata.

## Calendario

Il martedi' e' la chiusura settimanale iniziale e si puo' cambiare. Puoi
aggiungere periodi di ferie con data iniziale, data finale e un messaggio che
vede il cliente, e aperture straordinarie per una data specifica.

Un'apertura straordinaria vince su un periodo di ferie che la contiene: se sei
chiuso dal 10 al 20 ma apri il 15, il 15 e' aperto.

Nei giorni chiusi il cliente legge il motivo e non puo' ordinare.

Il calendario e' condiviso: una modifica fatta in cassa arriva subito sugli altri
dispositivi.

## Ordini e cucina

Gli ordini entrano automaticamente in preparazione e finiscono nella stessa coda,
sia quelli dal sito sia quelli presi in pizzeria.

In Cucina ogni comanda mostra il conto alla rovescia; quando il tempo e' scaduto
il timer diventa rosso e conta in avanti. Le note del cliente che parlano di
allergie o intolleranze sono evidenziate. `ORDINE PRONTO` chiude la comanda.

Gli allergeni stampati sulla comanda sono quelli dichiarati sul prodotto,
congelati al momento dell'ordine: cambiare il menu dopo non altera gli ordini
gia' presi.

## Storico e modifica di un ordine

Lo storico filtra per giornata, turno, origine e stato, e cerca per cliente,
telefono o pagamento. Per cercare un numero si scrive `#3`.

Modificando un ordine si crea una nuova revisione e la versione precedente resta
consultabile. Un ordine non viene mai cancellato.

Il pagamento originale non viene toccato. La differenza diventa un movimento a
parte: un supplemento da incassare o un rimborso. Nasce in attesa e va poi
segnato come incassato o rimborsato, oppure annullato. Nei report entrano solo i
movimenti registrati, perche' finche' sono in attesa il denaro non si e' mosso.

## Report

I report mostrano ordini, pizze, lordo, trattenute, supplementi, rimborsi e
netto, divisi per pranzo, serale e giornata. Contano solo gli ordini completati.

I dati storici non vengono cancellati: restano nello storico e alimentano i
totali.

## Cosa e' ancora dimostrativo

Apple Pay e Google Pay sono etichette senza un processore di pagamento: nessun
addebito e nessun rimborso reale. Non partono SMS ne' email; l'invio del recap e'
simulato. L'ordine preso direttamente in pizzeria non ha ancora una schermata
dedicata. Le foto dei prodotti sono emoji.

## Prima di aprire al pubblico

Impostare `pizzeriaPhone` in `js/config.js` col numero vero, altrimenti il recap
del cliente non mostra alcun numero da chiamare.

Configurare un limite di richieste davanti alla funzione che crea gli ordini: il
database limita gia' a cinque ordini per numero di telefono ogni dieci minuti, ma
non basta come unica difesa. I dettagli sono in `supabase/README.md`.

Verificare con il responsabile il testo sugli allergeni mostrato al cliente.
