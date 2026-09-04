# Pagamenti online con Stripe

Questa e' la parte che incassa davvero. E' scritta e provata nella sua logica, ma
resta **spenta** finche' non ci metti le tue chiavi di Stripe: senza, il sito si
comporta come adesso e si paga in cassa.

## Prima una cosa da capire

Stripe non e' come le altre parti del sito. Il denaro lo muove un pezzo che gira
**sul server**, non nel browser, perche' la chiave che autorizza gli incassi e'
segreta e nel browser non puo' stare (sarebbe come lasciare le chiavi del
cassetto sul bancone). Questo pezzo vive dentro Supabase come **Edge Function**.

Il flusso e' questo:

1. Il cliente conferma l'ordine sul sito.
2. Il sito chiede alla funzione `create-checkout` di aprire un pagamento.
3. La funzione legge il totale **dal database** (mai dal browser), apre una
   sessione su Stripe e rimanda il cliente alla pagina di pagamento di Stripe.
4. Il cliente paga con carta, Apple Pay o Google Pay: sono tutti dentro Stripe,
   non c'e' niente in piu' da collegare.
5. Stripe avvisa la funzione `stripe-webhook`, che verifica la firma del
   messaggio e **solo allora** segna l'ordine pagato. La comanda parte da li'.

## Passo zero: creare l'account Stripe

Se non hai ancora un account, si fa su [stripe.com](https://stripe.com), gratis,
in circa dieci minuti. Serve:

- Email e password.
- Dati della pizzeria: ragione sociale o partita IVA, indirizzo, settore
  (ristorazione / food & beverage).
- **IBAN** dove Stripe deve accreditare gli incassi.
- Un documento d'identita' per la verifica (Stripe lo chiede prima di farti
  incassare soldi veri; per fare prove con le chiavi di test non serve
  completare subito questa parte).

Appena l'account e' creato, **sei gia' in modalita' di prova** (in alto a
destra nel pannello Stripe c'e' un interruttore "Test mode" / "Modalita' di
prova", di solito acceso di default): con quella si fanno tutte le prove di
questa guida, senza IBAN verificato e senza muovere un euro vero. Si passa ai
soldi veri solo quando la verifica e' completa e si spegne il "Test mode".

## Cosa mi serve da te

Dal tuo pannello Stripe (Developers → API keys e Developers → Webhooks):

- La **chiave segreta** (`sk_live_...` o `sk_test_...` per le prove).
- Il **segreto del webhook** (`whsec_...`), che Stripe da' quando registri
  l'indirizzo del webhook.

Queste due **non vanno mai nel repository**: si mettono fra i segreti di
Supabase, che nessuno puo' leggere da fuori.

## I passi per accenderlo

Servono l'accesso a Supabase e la sua riga di comando (`supabase login`).

1. **Mettere le chiavi fra i segreti**, cosi' vivono sul server e non nel codice:

   ```bash
   supabase secrets set STRIPE_SECRET_KEY=sk_test_...
   supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
   supabase secrets set SITE_ORIGIN=https://ghostteo.github.io/hot-meeting
   ```

2. **Pubblicare le due funzioni:**

   ```bash
   supabase functions deploy create-checkout --no-verify-jwt
   supabase functions deploy stripe-webhook --no-verify-jwt
   ```

   `--no-verify-jwt` e' necessario: Stripe (e il cliente che paga, che non e'
   loggato) non hanno un gettone Supabase. La prova di identita' e' la firma
   del webhook da una parte, l'id dell'ordine col suo gettone dall'altra.

3. **Registrare il webhook su Stripe**: Developers → Webhooks → Add endpoint,
   l'indirizzo e' quello della funzione `stripe-webhook` che Supabase ti da'
   dopo il deploy, e l'evento da ascoltare e' `checkout.session.completed`.

4. **Accendere il pagamento nel sito**: in `js/config.js`, incollare l'indirizzo
   della funzione `create-checkout` in `stripeEndpoint`. Da quel momento gli
   ordini con Apple Pay / Google Pay passano da Stripe; il contante resta in
   cassa.

## Le prove, prima dei soldi veri

Stripe ha una modalita' di prova con carte finte (la classica
`4242 4242 4242 4242`). Si accende tutto con le chiavi `sk_test_` / `whsec_` di
prova, si fa un ordine, si paga con la carta finta e si controlla che l'ordine
compaia pagato nel pannello. Solo quando funziona si passa alle chiavi vere.

## Il nodo da sciogliere col commercialista

Incassare online e' una cosa; lo **scontrino fiscale** e' un'altra, e le due si
devono incontrare. Un pagamento con carta o wallet va comunque nei corrispettivi
del giorno e va documentato dal Registratore Telematico. Prima di accendere gli
incassi veri, chiedi al tecnico di cassa / commercialista come vuole che i
pagamenti online arrivino al Registratore: uno per uno, o come totale a fine
giornata. Da quella risposta dipende l'ultimo pezzo.

Finche' questo non e' chiaro, conviene tenere Stripe in **modalita' di prova**:
si vede che funziona senza incassare davvero e senza problemi fiscali.

## Cosa e' gia' fatto

- Le due funzioni (`supabase/functions/create-checkout`, `stripe-webhook`), con
  la logica testata (`test/stripe-logic.test.js`, `test/pagamento-online.test.js`).
- Il database tiene lo stato del pagamento (`payment_status`, `stripe_session_id`,
  `paid_at`) e solo il server puo' segnare «pagato»: provato che dal browser non
  si arriva.
- Il sito, quando `stripeEndpoint` e' vuoto, si comporta esattamente come adesso.
