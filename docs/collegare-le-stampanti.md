# Collegare le stampanti: cosa portare e cosa faremo

Questa e' la lista per la giornata in pizzeria. Le prime due parti servono a te,
la terza dice cosa succede una volta li'.

## Come vanno i cavi

Ogni apparecchio va collegato **al router**, non uno all'altro:

```
              [ROUTER]
             /    |    \
            /     |     \
      portatile  stampante  iPad
                  cucina   (wifi)
```

Il cavo dal portatile **non** va nella stampante. Il router e' il punto in cui
tutti si incontrano: e' quello che permette al telefono in sala, all'iPad in
cucina e alla stampante di vedersi fra loro. Se colleghi il portatile
direttamente alla stampante, quei due si parlano ma il portatile perde internet e
nessun altro apparecchio vede la stampante.

Il wifi va bene quanto il cavo, purche' sia **lo stesso router**. In pratica: la
stampante conviene col cavo (non perde il segnale dietro il forno), il portatile
e i telefoni possono stare sul wifi.

## 1. Cosa portare

**Sempre, qualunque sia il modello:**

- Un **cavo di rete** (RJ45) per ogni stampante, piu' uno per il portatile.
  Da tre a cinque metri: devono arrivare al router senza tirare.
- Un **adattatore USB-C verso rete** per il portatile, se non ha la presa
  quadrata. I portatili recenti non ce l'hanno quasi mai.
- Uno **switch di rete** da cinque porte, se il router non ha abbastanza prese
  libere. Costa una ventina di euro e serve solo se le prese sono finite.
- **Rotoli di carta termica**: 80 mm per la comanda, e 57 o 80 per la cassa a
  seconda dell'apparecchio. Portane almeno due per stampante: durante le prove
  se ne consuma.
- Una **ciabatta elettrica** vicino al forno e una vicino alla cassa. Le
  stampanti hanno l'alimentatore separato e occupano una presa ciascuna.

**Se invece le stampanti sono collegate al computer con il cavo USB:**

- Il **cavo USB da stampante** (quello con il connettore quadrato) gia' in uso.
- In questo caso serve che quel computer resti acceso durante il servizio: e'
  lui che parla con la stampante.

**Da non dimenticare:**

- La **password del wifi** del locale, o l'accesso al router.
- Il **numero del tecnico di cassa**: per la parte fiscale serve lui, e se e'
  raggiungibile al telefono si chiude tutto in giornata.

## 2. Cosa mi serve sapere

Quattro cose. Si raccolgono in cinque minuti e cambiano tutto il resto.

1. **Il modello esatto di ogni stampante.** E' sull'etichetta dietro o sotto:
   qualcosa come `TM-T20III`, `TM-m30`, `FP-81II RT`, `FP-90III`. Una foto
   dell'etichetta basta.
2. **Uno scontrino gia' stampato dalla cassa.** Se in cima c'e' scritto
   `DOCUMENTO COMMERCIALE`, quella e' gia' un Registratore Telematico e siamo a
   meta' strada. Se stampa solo un promemoria, no.
3. **Come sono collegate adesso**: cavo di rete, cavo USB a un computer, o
   niente perche' sono nuove nella scatola.
4. **Se c'e' un computer che resta acceso** durante il servizio, e quale
   (Windows, Mac, il registratore stesso).

## 3. Cosa faremo, in ordine

**Primo: guardare chi c'e' sulla rete.**

```bash
node scripts/trova-stampanti.mjs
```

Si lancia dal portatile collegato alla stessa rete delle stampanti. In un minuto
dice quali apparecchi rispondono, a che indirizzo, e se sono stampanti da
comande o registratori fiscali. Non installa e non tocca niente: bussa e basta.

**Secondo: dare un indirizzo fisso a ogni stampante.** Se l'indirizzo cambia da
solo, un giorno la comanda smette di uscire senza motivo apparente. Si fissa dal
router (riservazione) o dalla stampante stessa.

**Terzo: la prova di stampa.**

```bash
node scripts/prova-stampa.mjs 192.168.1.50        # carta da 80 mm
node scripts/prova-stampa.mjs 192.168.1.50 58     # carta da 58 mm
```

Manda una comanda finta con dentro tutto quello che serve controllare: il numero
grande, un ingrediente da togliere in negativo, un'aggiunta, una nota di
allergia, gli allergeni e due bibite sotto «AL BANCO». Se esce questa, esce
tutto. Se non esce, il problema e' nella rete o nell'indirizzo, non nel
programma.

**Quarto: scegliere come far uscire la comanda da sola.** Le strade sono tre e
si decide sul posto, in base a cosa abbiamo trovato:

- **Un programma sul computer della pizzeria** che riceve gli ordini e li manda
  alla stampante. E' la strada piu' solida e la piu' veloce da mettere in piedi,
  ma serve un computer acceso durante il servizio.
- **Chrome avviato con `--kiosk-printing`** sul computer della cassa: la comanda
  esce dal browser senza la finestra di stampa. Si fa in due minuti, ma quel
  computer deve restare aperto sulla pagina della cucina.
- **La stampante che va a prendersi il lavoro da sola** (Server Direct Print):
  non serve nessun computer acceso, ma va configurata sulla stampante e
  funziona solo su alcuni modelli di rete.

## 4. Cosa non si puo' fare oggi

**Lo scontrino fiscale non si attiva da qui.** Un Registratore Telematico va
*fiscalizzato*: e' un'operazione che fa un tecnico abilitato, con le credenziali
dell'Agenzia delle Entrate e la matricola dell'apparecchio. Nessun programma
puo' sostituirla, e nemmeno accelerarla.

Quello che possiamo fare oggi e' preparare tutto il resto, cosi' quando il
tecnico arriva trova la strada pronta: stampante in rete, indirizzo fisso,
comanda che esce, e il collegamento all'app gia' scritto.

**Se il tecnico e' raggiungibile al telefono**, chiedigli due cose: se
l'apparecchio che avete e' gia' un RT o va aggiornato, e come vuole che i
pagamenti elettronici arrivino ai corrispettivi (uno per uno o un totale a fine
giornata). Da quella risposta dipende come colleghiamo la cassa.
