# Hot Meeting Operational Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trasformare il prototipo in una web app persistente con calendario operativo, turni, storico, report, menu bilingue, personalizzazioni e flussi dimostrativi di pagamento.

**Architecture:** Il dominio rimane composto da funzioni pure testabili. Un repository dati astratto permette alla UI di usare prima un adapter locale e poi Supabase Postgres, Auth, Storage e Realtime; un registro append-only conserva le azioni operative senza diventare la sorgente primaria dei report.

**Tech Stack:** HTML, CSS, JavaScript ES modules, Node test runner, Supabase Postgres/Auth/Storage/Realtime

**Spec:** `docs/superpowers/specs/2026-08-24-hot-meeting-design.md`

## Stato di avanzamento

Aggiornato il 2026-08-25, branch `feature/operational-platform`.

- Task 1-8: completati. Giornata operativa, report periodici, calendario e
  turni, schema Supabase con RLS e repository persistente con Realtime sono
  implementati e coperti da test, insieme a storico ordini, revisioni e
  differenze di pagamento, recap cliente, interfaccia bilingue IT/EN e verifica
  integrata sul progetto Supabase reale.

Resta fuori dal piano: pubblicare l'app su un hosting, perche' finora gira solo
in locale, e la schermata dedicata all'ordine preso in pizzeria.

Il branch non e' ancora unito in `main`, che contiene soltanto il prototipo
iniziale.

## Global Constraints

- Fuso orario operativo: `Europe/Rome`.
- Martedì è la chiusura settimanale iniziale, modificabile dal Creator.
- La giornata resta associata alla data di apertura finché il serale non viene chiuso.
- Nessun servizio può chiudere con ordini attivi.
- Telefono obbligatorio; email facoltativa.
- Nessuna transazione, rimborso, email o SMS reale nella modalità demo.
- Supabase Free senza upgrade o addebiti automatici.

---

### Task 1: Dominio della giornata operativa

**Files:**
- Create: `js/operations.js`
- Test: `test/operations.test.js`

**Interfaces:**
- Produces: `resolveBusinessDate(now, activeDay)`, `nextDailySequence(orders, businessDate)`, `canCloseService(orders, serviceId)`, `resolveClosure(date, schedule, exceptions)`.

- [x] **Step 1: Scrivere test fallenti**

```js
test('mantiene il 23 agosto dopo mezzanotte finché la giornata è aperta', () => {
  assert.equal(resolveBusinessDate('2026-08-24T00:30:00+02:00', { date: '2026-08-23', status: 'open' }), '2026-08-23');
});
test('riparte da 01 in una nuova giornata', () => {
  assert.equal(nextDailySequence([{ businessDate: '2026-08-23', sequence: 18 }], '2026-08-24'), 1);
});
test('blocca la chiusura con un ordine in preparazione', () => {
  assert.equal(canCloseService([{ serviceId: 'dinner-1', status: 'preparing' }], 'dinner-1'), false);
});
```

- [x] **Step 2: Eseguire il test e verificare il fallimento**

Run: `node --test test/operations.test.js`
Expected: FAIL per export mancanti.

- [x] **Step 3: Implementare le funzioni pure minime**

La chiusura ricorrente usa numeri ISO `1–7`; le eccezioni per data prevalgono sulla regola settimanale.

- [x] **Step 4: Eseguire tutti i test**

Run: `npm test`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add js/operations.js test/operations.test.js
git commit -m "feat: add operational day rules"
```

### Task 2: Report e movimenti economici

**Files:**
- Create: `js/reports.js`
- Test: `test/reports.test.js`

**Interfaces:**
- Consumes: ordini completati con `businessDate`, `shift`, `gross`, `fees`, `adjustments`.
- Produces: `dailyReport`, `monthlyReport`, `semesterReport`, `annualReport`.

- [x] **Step 1: Scrivere test fallenti per periodi e totali**

```js
test('calcola il primo semestre fisso', () => {
  const report = semesterReport(sampleOrders, 2026, 1);
  assert.deepEqual(report.period, { from: '2026-01-01', to: '2026-06-30' });
  assert.equal(report.net, report.gross + report.supplements - report.fees - report.refunds);
});
```

- [x] **Step 2: Verificare RED**

Run: `node --test test/reports.test.js`
Expected: FAIL per `semesterReport` mancante.

- [x] **Step 3: Implementare aggregazione unica e filtri periodo**

Tutti i report restituiscono `{ orders, pizzas, gross, fees, supplements, refunds, net }`.

- [x] **Step 4: Verificare GREEN**

Run: `npm test`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add js/reports.js test/reports.test.js
git commit -m "feat: add periodic reporting engine"
```

### Task 3: Calendario, turni e conferme nella UI locale

**Files:**
- Create: `js/views/calendar.js`
- Create: `js/views/service.js`
- Create: `js/ui/dialog.js`
- Modify: `js/app.js`
- Modify: `styles.css`
- Test: `test/service-flow.test.js`

**Interfaces:**
- Consumes: funzioni di `js/operations.js`.
- Produces: impostazioni chiusura, ferie, aperture straordinarie, conferma chiusura e riapertura turno.

- [x] **Step 1: Testare il modello delle azioni UI**

```js
test('una riapertura mantiene giornata e progressivo', () => {
  const reopened = reopenService(closedDinner);
  assert.equal(reopened.businessDate, closedDinner.businessDate);
  assert.equal(reopened.sequenceBase, closedDinner.sequenceBase);
});
```

- [x] **Step 2: Verificare RED**

Run: `node --test test/service-flow.test.js`
Expected: FAIL per `reopenService` mancante.

- [x] **Step 3: Implementare pannello calendario e dialoghi accessibili**

Il Creator può cambiare il giorno settimanale, aggiungere ferie e creare un'apertura straordinaria. La chiusura usa un dialogo con riepilogo e conferma; se la coda non è vuota mostra gli ordini bloccanti.

- [x] **Step 4: Verificare test e navigazione locale**

Run: `npm test`
Expected: PASS; nessun `prompt()` o `confirm()` nel codice.

- [x] **Step 5: Commit**

```bash
git add js/views js/ui js/app.js styles.css test/service-flow.test.js
git commit -m "feat: add business calendar and service controls"
```

### Task 4: Schema Supabase, policy e registro eventi

**Files:**
- Create: `supabase/migrations/202608240001_core.sql`
- Create: `supabase/seed.sql`
- Create: `test/schema.test.js`

**Interfaces:**
- Produces: tabelle e policy descritte nella specifica, funzione SQL `next_order_sequence(p_business_day uuid)` e RPC controllata `create_public_order(payload jsonb)`.

- [x] **Step 1: Scrivere controlli strutturali fallenti**

```js
test('la migrazione abilita RLS su ordini ed eventi', () => {
  assert.match(sql, /alter table public\.orders enable row level security/i);
  assert.match(sql, /alter table public\.events enable row level security/i);
});
```

- [x] **Step 2: Verificare RED**

Run: `node --test test/schema.test.js`
Expected: FAIL perché la migrazione non esiste.

- [x] **Step 3: Creare schema, indici, vincoli e policy**

Lettura pubblica soltanto per menu disponibile e stato apertura; ordini, telefono, email, report ed eventi richiedono ruolo Creator. La RPC pubblica valida prodotti, prezzi server-side e servizio aperto.

- [x] **Step 4: Verificare migrazione in un progetto locale o remoto di sviluppo**

Run: `npm test`
Expected: PASS; applicazione SQL senza errori.

- [x] **Step 5: Commit**

```bash
git add supabase test/schema.test.js
git commit -m "feat: add secure Supabase schema"
```

### Task 5: Repository dati e Realtime

**Files:**
- Create: `js/data/repository.js`
- Create: `js/data/local-repository.js`
- Create: `js/data/supabase-repository.js`
- Create: `js/config.example.js`
- Modify: `js/app.js`
- Test: `test/repository-contract.test.js`

**Interfaces:**
- Produces: `getMenu`, `saveProduct`, `openService`, `closeService`, `createOrder`, `reviseOrder`, `subscribe`.

- [x] **Step 1: Scrivere contract test condivisi**

```js
export function repositoryContract(createRepository) {
  test('salva e rilegge una modifica menu', async () => {
    const repo = await createRepository();
    await repo.saveProduct({ id: 'margherita', price: 9 });
    assert.equal((await repo.getMenu()).find(p => p.id === 'margherita').price, 9);
  });
}
```

- [x] **Step 2: Verificare RED sul repository locale**

Run: `node --test test/repository-contract.test.js`
Expected: FAIL per adapter mancante.

- [x] **Step 3: Implementare adapter locale e Supabase**

L'adapter Supabase sottoscrive menu, servizi e ordini; la cache locale è fallback di lettura e non sovrascrive dati remoti.

- [x] **Step 4: Verificare contract e test completi**

Run: `npm test`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add js/data js/config.example.js js/app.js test/repository-contract.test.js
git commit -m "feat: add persistent realtime repository"
```

### Task 6: Storico, modifica ordini e differenze pagamento

**Files:**
- Create: `js/views/order-history.js`
- Create: `js/views/order-editor.js`
- Create: `js/payments.js`
- Modify: `js/app.js`
- Test: `test/order-revisions.test.js`

**Interfaces:**
- Produces: `reviseOrder(original, changes)`, `calculateAdjustment(originalTotal, revisedTotal)`.

- [x] **Step 1: Scrivere test fallenti per supplemento e rimborso**

```js
test('crea un supplemento senza alterare il pagamento originale', () => {
  assert.deepEqual(calculateAdjustment(20, 25), { type: 'supplement', amount: 5, status: 'pending' });
});
```

- [x] **Step 2: Verificare RED**

Run: `node --test test/order-revisions.test.js`
Expected: FAIL.

- [x] **Step 3: Implementare storico filtrabile ed editor revisione**

La revisione conserva snapshot precedente; supplementi demo offrono Apple Pay, Google Pay e cassa, mentre riduzioni creano rimborso demo.

- [x] **Step 4: Verificare GREEN e flusso navigato**

Run: `npm test`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add js/views js/payments.js js/app.js test/order-revisions.test.js
git commit -m "feat: add order history and revisions"
```

### Task 7: Recap cliente e bilingue

**Files:**
- Create: `js/views/order-receipt.js`
- Create: `js/i18n.js`
- Modify: `js/app.js`
- Test: `test/customer-recap.test.js`

**Interfaces:**
- Produces: `buildPublicOrderCode`, `buildCustomerRecap`, `translate(key, locale)`.

- [x] **Step 1: Testare codice pubblico e fallback lingua**

```js
test('formatta codice giornaliero', () => {
  assert.equal(buildPublicOrderCode('2026-08-23', 1), '23-08 · #01');
});
test('usa italiano se manca la traduzione inglese', () => {
  assert.equal(translateProduct({ it: 'Bufala' }, 'en'), 'Bufala');
});
```

- [x] **Step 2: Verificare RED**

Run: `node --test test/customer-recap.test.js`
Expected: FAIL.

- [x] **Step 3: Implementare recap persistente e simulazioni invio**

Telefono obbligatorio, email facoltativa; recap con numero pizzeria, pagamento, ETA, personalizzazioni, allergeni e note.

- [x] **Step 4: Verificare GREEN**

Run: `npm test`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add js/views/order-receipt.js js/i18n.js js/app.js test/customer-recap.test.js
git commit -m "feat: add bilingual customer recap"
```

### Task 8: Verifica integrata e pubblicazione

**Files:**
- Modify: `README.md`
- Create: `docs/operations.md`

**Interfaces:**
- Produces: build navigabile, istruzioni Creator e checklist operativa.

- [x] **Step 1: Eseguire suite completa**

Run: `npm test`
Expected: tutti i test PASS, zero failure.

- [x] **Step 2: Verificare assenza popup browser e segreti**

Run: `rg -n 'prompt\(|confirm\(|service_role|secret' . --glob '!docs/**'`
Expected: nessun popup nativo e nessuna chiave privilegiata.

- [x] **Step 3: Provare i flussi nel browser**

Aprire pranzo, creare `#01`, completarlo, chiudere e riaprire pranzo, creare cena, superare mezzanotte simulata, chiudere giornata, verificare nuova sequenza `#01`, storico e report.

- [x] **Step 4: Aggiornare documentazione**

Documentare configurazione calendario, ferie, chiusura modificabile, report, modifica ordine e limiti demo.

- [x] **Step 5: Commit e push**

```bash
git add README.md docs/operations.md
git commit -m "docs: add Hot Meeting operations guide"
git push
```
