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

Aprire `http://localhost:4173`. Accesso Creator dimostrativo: `creator` /
`pizza143`. Vale soltanto in modalita' locale: con Supabase attivo si usa
l'autenticazione reale.

## Persistenza

`js/config.js` imposta `mode: 'local'` e usa il salvataggio locale del browser,
quindi i dati non sono condivisi tra dispositivi. Per la persistenza reale
copiare `js/config.example.js` in `js/config.js`, impostare `mode: 'supabase'` e
inserire URL e chiave pubblica anon del progetto. Nel browser non deve mai
finire una chiave `service_role`. Lo schema, le policy RLS e le RPC sono in
`supabase/migrations/`; vedere `supabase/README.md` per i limiti di sicurezza da
configurare in produzione.

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
