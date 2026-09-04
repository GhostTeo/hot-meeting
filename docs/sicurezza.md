# Sicurezza e anti-bot: cosa c'e' e cosa va acceso a mano

Il sito e' una pagina statica su GitHub Pages; i dati stanno su Supabase. La
chiave in `js/config.js` e' pubblica per progettazione: la protezione vera sono
le regole del database (RLS), che negano all'anonimo ordini, telefoni, incassi
ed eventi, e le funzioni che controllano ogni ordine prima di scriverlo.

## Cosa fa gia' il database, da solo

Ogni ordine passa da `create_public_order`, che:

- accetta solo le chiavi previste e al massimo 32 KB; i prezzi li calcola da
  se' (un prezzo mandato dal browser viene rifiutato);
- vuole un nome che sembri un nome e un telefono vero (anche estero, in
  formato internazionale), e rifiuta email malformate;
- ferma le alluvioni: 5 ordini in 10 minuti e 8 al giorno per numero, 10 al
  minuto per servizio, 15 al minuto e 400 al giorno in tutto; 60 prenotazioni
  al giorno e 3 aperte per numero; una prenotazione deve avere almeno una
  pizza e non puo' superare la capienza del forno nel suo quarto d'ora;
- ripete la stessa risposta se lo stesso ordine arriva due volte (gettone di
  idempotenza), senza crearne un altro.

Le viste pubbliche mostrano solo numeri aggregati (pizze in coda, slot
occupati, orari): mai un nome o un telefono. Le funzioni riservate al Creator
non sono chiamabili dall'anonimo. Le query anonime hanno un tempo massimo di
3 secondi (`statement_timeout`), cosi' una raffica non tiene occupato il
database. Il ruolo `creator` sta in `app_metadata`, che un utente non puo'
scriversi da solo.

## La porta blindata (captcha + limiti per indirizzo)

Dal database non si vede l'indirizzo IP di chi ordina: per fermare un
programma che cambia numero di telefono a ogni ordine serve un passaggio in
piu', la Edge Function `place-order`, che:

1. conta gli ordini per indirizzo IP (10 al minuto, 120 al giorno: larghi
   apposta, perche' sulle reti mobili tanti clienti diversi condividono lo
   stesso indirizzo) con `rate_limit_hit` sulla tabella `rate_buckets`;
2. verifica il captcha di **Cloudflare Turnstile** (gratuito, invisibile per
   quasi tutti gli utenti veri);
3. solo allora chiama `create_public_order`.

Per accenderla:

1. Su <https://dash.cloudflare.com> → Turnstile → *Add site*: dominio
   `ghostteo.github.io` (o il dominio del sito), modalita' *Managed*. Prendi
   la **Site Key** (pubblica) e la **Secret Key**.
2. Pubblicare la funzione. Senza CLI, dal pannello Supabase: **Edge
   Functions → Deploy a new function → Via Editor**, nome `place-order`,
   incollare il contenuto di `supabase/functions/place-order/index.ts`,
   *Deploy*. Poi nei dettagli della funzione spegnere **Verify JWT** (il
   cliente non e' loggato: la funzione si protegge da sola con captcha e
   contatori). In **Edge Functions → Secrets** aggiungere `TURNSTILE_SECRET`
   (la Secret Key) e `SITE_ORIGIN` = `https://ghostteo.github.io`.

   Con la CLI, equivalente:

   ```bash
   supabase secrets set TURNSTILE_SECRET=0x4AAA... SITE_ORIGIN=https://ghostteo.github.io
   supabase functions deploy place-order --no-verify-jwt
   ```
3. In `js/config.js`:

   ```js
   orderEndpoint: 'https://<progetto>.supabase.co/functions/v1/place-order',
   turnstileSiteKey: '0x4AAA...'   // la Site Key, quella pubblica
   ```

   Nel riepilogo prima dell'invio compare la casella del captcha.
4. Quando tutto funziona, chiudi la strada diretta al database (SQL Editor):

   ```sql
   revoke execute on function public.create_public_order(jsonb) from anon, authenticated;
   ```

   Da quel momento gli ordini passano SOLO dalla porta blindata. (Per
   riaprirla: `grant execute on function public.create_public_order(jsonb) to anon, authenticated;`.)

## Da fare una volta nel pannello Supabase

- **Authentication → Providers → Email**: spegnere *Enable email signups*.
  L'unico account e' quello del locale; nessuno deve potersi registrare.
- **Authentication → Attack protection**: accendere il captcha (Turnstile)
  sul login e lasciare i limiti di richieste ai valori di default o piu'
  stretti.
- **SQL Editor**, se la migrazione lo ha segnalato con un avviso:

  ```sql
  alter role anon set statement_timeout = '3s';
  alter role authenticated set statement_timeout = '8s';
  ```

- Sul dispositivo del locale, usare **Esci** nel pannello Creator quando lo si
  presta a qualcuno: chiude la sessione e cancella gli ordini salvati.

## Stripe

- `create-checkout` incassa solo le righe dell'ultima revisione dell'ordine e
  chiude una sessione di pagamento precedente ancora aperta.
- `stripe-webhook` verifica la firma, confronta l'importo incassato con il
  totale dell'ordine, ritrova l'ordine anche dal suo id e chiede a Stripe di
  riprovare se il database non risponde. Va pubblicata con
  `--no-verify-jwt` (vedi `docs/pagamenti-stripe.md`).

## Cosa NON si puo' fare su GitHub Pages + Supabase

- Non si possono impostare header HTTP: la Content-Security-Policy sta nel
  `<meta>` di `index.html` (script solo dal sito e da
  `cdn.jsdelivr.net/npm/@supabase/supabase-js@2`, iframe solo di Cloudflare
  per il captcha).
- Non c'e' un limite di richieste per IP sul database stesso: e' il motivo
  per cui esiste la porta blindata. Con un dominio proprio davanti a
  Cloudflare si puo' aggiungere anche un limite a livello di rete.
