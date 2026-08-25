# Stampanti: comanda in cucina e scontrino in cassa

Due cose diverse, che vanno tenute separate perche' hanno regole diverse.

- **La comanda** e' un foglio di lavoro interno. Nessuna legge la governa: puo'
  uscire da qualsiasi stampante, anche subito.
- **Lo scontrino** e' un documento fiscale. Deve uscire da un apparecchio
  certificato, e l'apparecchio deve trasmettere i corrispettivi all'Agenzia
  delle Entrate. Nessun programma puo' sostituirlo.

## Cosa serve sapere delle vostre due stampanti

Quando siete in pizzeria, guardate l'etichetta sul retro o sotto ogni
stampante e mandatemi, per ognuna:

1. **Il modello esatto** (per esempio `TM-T20III`, `TM-m30`, `FP-81II RT`,
   `FP-90III RT`). E' scritto sull'etichetta insieme al numero di serie.
2. **Com'e' collegata**: cavo di rete (RJ45, come quello del router), USB al
   computer della cassa, oppure wi-fi.
3. **Se ha un indirizzo IP**, quale. Molte Epson lo stampano da sole tenendo
   premuto il tasto di alimentazione carta all'accensione.
4. **Cosa stampa oggi la stampante della cassa**: se in cima al foglio c'e'
   scritto `DOCUMENTO COMMERCIALE`, allora e' gia' un Registratore Telematico
   e siamo a meta' strada. Se stampa solo un promemoria non fiscale, no.

Una foto dell'etichetta e una foto di uno scontrino gia' stampato bastano.

## Perche' non basta collegarle e via

Il sito viaggia in `https`. Una pagina `https` non puo' parlare con un
apparecchio in `http` sulla rete locale: il browser blocca la richiesta e non
spiega nemmeno il perche'. Non e' un limite aggirabile con una impostazione, e'
una regola di sicurezza dei browser.

Restano tre strade, in ordine di preferenza.

**A. La stampante viene a prendersi il lavoro (Server Direct Print).**
Le Epson di rete sanno interrogare da sole un indirizzo internet a intervalli
regolari e stampare quello che trovano. Si ribalta il verso: non e' il sito che
chiama la stampante, e' la stampante che chiama il sito. Funziona anche se la
cassa e' su una rete diversa, non richiede nessun programma installato, e regge
bene se la connessione cade per qualche minuto. Serve una tabella con la coda di
stampa e un indirizzo che la stampante possa interrogare.

**B. Un programmino sulla cassa fa da ponte.**
Gira sul computer della cassa, riceve gli ordini e li manda alla stampante sulla
rete locale. Funziona con qualsiasi modello, anche vecchio, ma va installato e
tenuto acceso: se quel computer e' spento, non stampa niente.

**C. Il dialogo di stampa del browser.**
Gia' attivo: in Cucina ogni ordine ha il bottone **Stampa comanda**. Se la
Epson e' installata come stampante normale sul computer della cassa, la comanda
esce da li' senza altro lavoro. E' il modo piu' semplice, chiede pero' un clic e
una conferma ogni volta.

La C funziona da oggi. La A e' dove vogliamo arrivare per la cucina.

## Lo scontrino fiscale

Dal 2020 i corrispettivi sono telematici. Il documento commerciale deve uscire
da un **Registratore Telematico** certificato, che a fine giornata trasmette da
solo i totali all'Agenzia delle Entrate. La web app non puo' emetterlo per conto
suo, e non cambia nulla se il cliente paga in contanti, con Apple Pay o con
Google Pay: lo scontrino serve in tutti i casi, cambia soltanto se l'importo
finisce nella riga «contanti» o «elettronico».

Quello che l'app puo' fare, e che faremo, e' **pilotare il Registratore**:
mandargli le righe dell'ordine e il modo di pagamento, e lasciare che sia lui a
emettere e trasmettere. Le Epson fiscali italiane parlano un protocollo XML su
HTTP (`fpmate.cgi`, con l'elemento `printerFiscalReceipt`), quindi l'aggancio e'
fattibile: serve sapere il modello e serve che la stampante sia raggiungibile.

Se la stampante della cassa non e' un RT, l'alternativa e' aggiungerne uno. Le
Epson `FP-81II RT` e `FP-90III RT` sono i modelli correnti per l'Italia, e
alcune `FP-81II` / `FP-90III` non fiscali diventano RT con un kit di
aggiornamento. Vale la pena chiedere al vostro tecnico di cassa se quella che
avete e' aggiornabile prima di comprarne una nuova.

Va poi verificato con il commercialista come sono registrati oggi i
corrispettivi della pizzeria: l'app deve inserirsi in quel modo di lavorare, non
crearne uno parallelo.

## Cosa c'e' gia' pronto nel programma

`js/print/kitchen-ticket.js` costruisce la comanda in modo indipendente dalla
stampante: numero dell'ordine, provenienza, orari, piatti con quantita', cosa
togliere, cosa aggiungere, note del cliente con le **allergie evidenziate**, e
come si paga. Restituisce righe con un'etichetta di importanza (`number`,
`item`, `change`, `note`, `footer`).

Chi stampa traduce quelle righe: oggi le traduce il browser, domani un
convertitore in ESC/POS o in ePOS-Print XML. Il contenuto della comanda non
cambiera' cambiando stampante, ed e' gia' coperto dai test — si puo' correggere
cosa c'e' scritto senza avere una stampante davanti.

Quando arrivano i modelli, il lavoro che resta e': la tabella con la coda di
stampa, il convertitore per il modello giusto, e le prove sul posto.
