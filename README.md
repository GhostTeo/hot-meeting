# Hot Meeting

Web app per ordinazioni e gestione operativa della pizzeria Hot Meeting (Milano, Piola).

## Aree

- Cliente: menu, personalizzazione pizza con ingredienti e aggiunte, allergeni, note, carrello e checkout.
- Creator: calendario, apertura e chiusura turni, ordini, menu e report.
- Cucina: comande operative con timer, ritardo in evidenza e stato pronto.

## Giornata operativa

Il fuso di riferimento e' `Europe/Rome`. Pranzo e serale appartengono alla stessa
giornata operativa, che resta associata alla data di apertura anche dopo la
mezzanotte finche' non viene chiusa. Ogni giornata ha un progressivo ordini che
riparte da `01`. Un servizio non puo' essere chiuso finche' esistono ordini
ricevuti o in preparazione.

Il calendario gestisce la chiusura settimanale (inizialmente il martedi',
modificabile), i periodi di ferie e le aperture straordinarie. Nei giorni chiusi
il cliente vede il motivo e gli ordini online sono bloccati.

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

Schema, policy e RPC sono in `supabase/migrations/`. Per applicarli a un nuovo
progetto servono `supabase/migrations/202608240001_core.sql` e poi
`supabase/seed.sql`. Vedere `supabase/README.md` per i limiti di sicurezza da
configurare in produzione, in particolare il rate limiting davanti a
`create_public_order`.

L'accesso Creator usa l'autenticazione Supabase con email e password. Il ruolo
viene letto da `app_metadata.role`, che deve valere `creator`.

## Test

```bash
npm test
```

I test di comportamento del database sono esclusi per impostazione predefinita.
Con Docker attivo e l'immagine `postgres:17-alpine` disponibile:

```bash
npm run test:db
```

## Limiti dimostrativi

Apple Pay e Google Pay sono etichette dimostrative senza processore di
pagamento: nessun addebito, nessun rimborso reale. Non vengono inviati SMS ne'
email. L'ordine dal ristorante e il menu bilingue IT/EN non sono ancora
implementati. Le foto dei prodotti sono emoji.

Le informazioni sugli allergeni derivano dai dati inseriti dal locale, puo'
verificarsi contaminazione crociata e chi soffre di allergie gravi deve
contattare il personale prima dell'ordine.
