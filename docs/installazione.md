# Installare Hot Meeting su un progetto Supabase nuovo

Questa guida mette in piedi il database da zero. Serve quando si parte con un
progetto Supabase nuovo: installa la struttura, non i dati. Il locale resta
vuoto, pronto per il menu vero, e si prova tutto quando l'hardware e' collegato.

## Cosa serve

- Un progetto Supabase (anche il piano gratuito va bene per iniziare).
- Docker acceso sul computer (serve solo per lanciare l'installazione, non resta
  in funzione).

## 1. Installare la struttura

Da Supabase: **Project Settings → Database → Connection string**, scegli la voce
**URI** con il **pooler** (finisce con `pooler.supabase.com:5432`), e copiala.

```bash
DB_URL="postgresql://postgres.xxxx:LA_PASSWORD@aws-1-eu-west-1.pooler.supabase.com:5432/postgres" \
bash scripts/installa-supabase.sh
```

Mette tabelle, funzioni, regole di sicurezza e i 14 allergeni dell'elenco UE.
**Non carica pizze ne' ordini.** Si puo' rilanciare senza danni: ogni pezzo e'
idempotente.

## 2. Creare l'utente Creator

L'accesso all'area riservata e' un utente Supabase con un ruolo speciale.

- Su Supabase: **Authentication → Users → Add user**. Metti l'email vera del
  locale e una **password lunga e solo vostra** (non una parola comune, non una
  gia' usata altrove).
- Poi si assegna il ruolo. Da **SQL Editor**:

```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"creator"}'::jsonb
where email = 'EMAIL-DEL-LOCALE';
```

Solo un utente con `role: creator` puo' aprire servizi, vedere ordini, toccare il
menu o gli incassi. Chi si registrasse per conto suo vedrebbe soltanto il menu
pubblico, esattamente come uno sconosciuto. Meglio comunque che nessuno possa
registrarsi: in Authentication → Providers → Email spegnere *Enable email
signups* (vedi `docs/sicurezza.md`).

## 3. Collegare l'app al database

In `js/config.js` vanno due valori, tutti e due pubblici per progetto:

- `supabaseUrl`: da **Project Settings → API → Project URL**.
- `supabaseAnonKey`: da **Project Settings → API**, la chiave **publishable**
  (comincia con `sb_publishable_`). NON la `service_role`: quella non deve mai
  uscire dal pannello Supabase.

```js
export const appConfig = {
  mode: 'supabase',
  pizzeriaPhone: '0200000000',
  supabaseUrl: 'https://LAVOSTRA.supabase.co',
  supabaseAnonKey: 'sb_publishable_...'
};
```

La chiave publishable sta nel browser per progetto: a proteggere i dati sono le
regole del database, non la chiave. Il repository non deve mai contenere la
`service_role` ne' la password del database.

## 4. Il menu

Quando il menu vero e' pronto si carica in due modi, a scelta:

- **Dall'app**, area riservata → Il menu → Nuovo prodotto. E' il modo di tutti i
  giorni.
- **In blocco**, scrivendo la carta in `supabase/menu.json` e lanciando
  `SUPABASE_EMAIL=... SUPABASE_PASSWORD=... node supabase/seed-menu.mjs`. Utile
  per caricare venti pizze in una volta.

## 5. La prova finale

Con menu caricato, stampanti collegate (vedi `docs/collegare-le-stampanti.md`) e
servizio aperto dall'area riservata: si fa un ordine di prova dal sito e si
guarda che la comanda esca in cucina e l'ordine compaia nel pannello.

## Cosa NON fa questa installazione

Non attiva lo scontrino fiscale: la fiscalizzazione del Registratore la fa un
tecnico abilitato. E non installa niente sul computer del locale: il computer con
Docker serve solo per questi comandi, poi si spegne.
