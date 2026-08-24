# Hot Meeting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Creare la prima build persistente e navigabile di Hot Meeting.

**Architecture:** Applicazione statica modulare con regole di dominio pure, rendering client-side e persistenza locale. Le tre interfacce condividono lo stesso stato applicativo.

**Tech Stack:** HTML, CSS, JavaScript ES modules, Node test runner

**Spec:** `docs/superpowers/specs/2026-08-24-hot-meeting-design.md`

## Global Constraints

- Repository privato `GhostTeo/hot-meeting`.
- Nessun servizio esterno o segreto nella prima build.
- Interfaccia responsive e testo in italiano.

---

### Task 1: Regole di dominio

**Files:**
- Create: `js/domain.js`
- Test: `test/domain.test.js`

**Interfaces:**
- Produces: `normalizePhone`, `isValidItalianPhone`, `estimateMinutes`, `formatTimer`, `summarizeOrders`.

- [ ] Scrivere test fallenti per validazione, coda, timer e report.
- [ ] Eseguire `npm test` e verificare il fallimento previsto.
- [ ] Implementare le funzioni pure minime.
- [ ] Eseguire `npm test` e verificare il passaggio.
- [ ] Registrare la modifica in Git.

### Task 2: Interfacce e stato condiviso

**Files:**
- Create: `index.html`
- Create: `styles.css`
- Create: `js/app.js`

**Interfaces:**
- Consumes: funzioni esportate da `js/domain.js`.
- Produces: navigazione Cliente, Creator e Cucina con stato persistente.

- [ ] Aggiungere una verifica DOM dei punti di ingresso.
- [ ] Implementare menu, carrello, login e sezioni operative.
- [ ] Collegare ordini e menu a `localStorage`.
- [ ] Verificare i flussi nel browser locale.
- [ ] Registrare la modifica in Git.

### Task 3: Repository e anteprima

**Files:**
- Modify: `README.md`

**Interfaces:**
- Produces: repository remoto aggiornato e istruzioni riproducibili.

- [ ] Inizializzare Git e impostare il ramo `main`.
- [ ] Collegare `https://github.com/GhostTeo/hot-meeting.git`.
- [ ] Eseguire test e controllo navigato finale.
- [ ] Pubblicare il primo commit sul repository.
