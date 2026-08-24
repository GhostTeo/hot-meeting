import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const RUN_DB_INTEGRATION = process.env.RUN_DB_INTEGRATION === '1';
const POSTGRES_IMAGE = 'postgres:17-alpine';
const migration = readFileSync(new URL('../supabase/migrations/202608240001_core.sql', import.meta.url), 'utf8');
const seed = readFileSync(new URL('../supabase/seed.sql', import.meta.url), 'utf8');
const waitBuffer = new Int32Array(new SharedArrayBuffer(4));

const IDS = Object.freeze({
  day: '50000000-0000-4000-8000-000000000001',
  otherDay: '50000000-0000-4000-8000-000000000002',
  service: '60000000-0000-4000-8000-000000000001',
  margherita: '20000000-0000-4000-8000-000000000001',
  bufalaAddition: '30000000-0000-4000-8000-000000000005'
});

function command(args, options = {}) {
  return spawnSync(args[0], args.slice(1), {
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
    ...options
  });
}

function commandDescription(result, args) {
  return [
    `command failed: ${args.join(' ')}`,
    `exit: ${result.status}`,
    result.stdout?.trim(),
    result.stderr?.trim()
  ].filter(Boolean).join('\n');
}

function quoteJson(value) {
  return `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
}

function basePayload(token, overrides = {}) {
  return {
    request_token: token,
    service_id: IDS.service,
    customer: { name: 'Cliente Test', phone: '+39 333 123 4567' },
    payment_method: 'cash',
    items: [{ product_id: IDS.margherita, quantity: 1, changes: [] }],
    ...overrides
  };
}

test('schema Supabase: comportamenti PostgreSQL e policy', {
  skip: RUN_DB_INTEGRATION
    ? false
    : 'Prerequisito esplicito: eseguire `npm run test:db` con Docker attivo e immagine postgres:17-alpine disponibile.'
}, async t => {
  const container = `hot-meeting-schema-${process.pid}-${Date.now()}`;

  const dockerVersion = command(['docker', 'version', '--format', '{{.Server.Version}}']);
  assert.equal(
    dockerVersion.status,
    0,
    `Docker daemon non disponibile. Avviare Docker e rilanciare npm run test:db.\n${dockerVersion.stderr}`
  );

  const image = command(['docker', 'image', 'inspect', POSTGRES_IMAGE]);
  assert.equal(
    image.status,
    0,
    `Immagine ${POSTGRES_IMAGE} mancante. Eseguire: docker pull ${POSTGRES_IMAGE}`
  );

  const started = command([
    'docker', 'run', '--rm', '--name', container,
    '-e', 'POSTGRES_PASSWORD=hot-meeting-test-only',
    '-d', POSTGRES_IMAGE
  ]);
  assert.equal(started.status, 0, commandDescription(started, ['docker', 'run']));

  function psql(sql, { allowFailure = false, appName } = {}) {
    const args = ['docker', 'exec'];
    if (appName) args.push('-e', `PGAPPNAME=${appName}`);
    args.push('-i', container, 'psql', '-X', '-qAt', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1');
    const result = command(args, { input: sql });
    if (!allowFailure) assert.equal(result.status, 0, commandDescription(result, args));
    return result;
  }

  function resetOperationalData() {
    psql(`
      truncate table public.events, public.payment_adjustments, public.order_revisions,
        public.order_item_changes, public.order_items, public.orders, public.service_sessions,
        public.services, public.business_days;
    `);
  }

  function openService() {
    psql(`
      insert into public.business_days (id, business_date)
      values ('${IDS.day}', date '2026-08-24');
      insert into public.services (id, business_day_id, shift, status, online_orders_enabled, opened_at)
      values ('${IDS.service}', '${IDS.day}', 'dinner', 'open', true, now());
    `);
  }

  function callPublicOrder(payload, allowFailure = false) {
    return psql(`set role anon; select public.create_public_order(${quoteJson(payload)});`, { allowFailure });
  }

  function receipt(result) {
    const line = result.stdout.trim().split('\n').filter(Boolean).at(-1);
    return JSON.parse(line);
  }

  function creatorSql(sql, allowFailure = false) {
    return psql(`
      select set_config('request.jwt.claims', '{"app_metadata":{"role":"creator"}}', false);
      set role authenticated;
      ${sql}
    `, { allowFailure });
  }

  try {
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const logs = command(['docker', 'logs', container]);
      const startupLog = `${logs.stdout}\n${logs.stderr}`;
      const readyCount = (startupLog.match(/database system is ready to accept connections/g) || []).length;
      if (readyCount >= 2) {
        ready = true;
        break;
      }
      Atomics.wait(waitBuffer, 0, 0, 100);
    }
    assert.equal(ready, true, 'PostgreSQL temporaneo non è diventato pronto entro 6 secondi');

    psql(`
      create role anon nologin;
      create role authenticated nologin;
      create schema auth;
      create function auth.jwt()
      returns jsonb language sql stable
      as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $$;
    `);
    psql(migration);
    psql(seed);

    await t.test('isola ordini ed eventi e rifiuta prezzi client', () => {
      resetOperationalData();
      openService();

      const rejected = callPublicOrder(basePayload(
        '70000000-0000-4000-8000-000000000001',
        { items: [{ product_id: IDS.margherita, quantity: 1, price_cents: 1 }] }
      ), true);
      assert.notEqual(rejected.status, 0);
      assert.match(rejected.stderr, /prices must not be supplied by the client/i);

      callPublicOrder(basePayload('70000000-0000-4000-8000-000000000002'));
      const anonRead = psql('set role anon; select count(*) from public.orders;', { allowFailure: true });
      assert.notEqual(anonRead.status, 0);
      const anonEvents = psql('set role anon; select count(*) from public.events;', { allowFailure: true });
      assert.notEqual(anonEvents.status, 0);
      assert.equal(psql('set role authenticated; select count(*) from public.orders;').stdout.trim(), '0');
      assert.equal(creatorSql('select count(*) from public.orders;').stdout.trim().split('\n').at(-1), '1');
      assert.equal(creatorSql('select count(*) from public.events;').stdout.trim().split('\n').at(-1), '1');
    });

    await t.test('rifiuta chiavi sconosciute, payload e array eccessivi e token assente', () => {
      resetOperationalData();
      openService();

      const cases = [
        [basePayload('70000000-0000-4000-8000-000000000011', { unexpected: true }), /unknown top-level key/i],
        [{ ...basePayload('70000000-0000-4000-8000-000000000012'), request_token: undefined }, /request_token is required/i],
        [basePayload('70000000-0000-4000-8000-000000000013', {
          items: [{ product_id: IDS.margherita, quantity: 1, changes: [], unexpected: true }]
        }), /unknown item key/i],
        [basePayload('70000000-0000-4000-8000-000000000014', {
          items: [{ product_id: IDS.margherita, quantity: 1, changes: [{
            type: 'addition', ingredient_id: IDS.bufalaAddition, quantity: 1, unexpected: true
          }] }]
        }), /unknown change key/i],
        [basePayload('70000000-0000-4000-8000-000000000015', {
          customer: { name: 'Cliente Test', phone: '+393331234567', email: `${'a'.repeat(33_000)}@example.test` }
        }), /payload exceeds 32768 bytes/i],
        [basePayload('70000000-0000-4000-8000-000000000016', {
          items: Array.from({ length: 21 }, () => ({ product_id: IDS.margherita, quantity: 1, changes: [] }))
        }), /between 1 and 20 items/i]
      ];

      for (const [payload, message] of cases) {
        const result = callPublicOrder(payload, true);
        assert.notEqual(result.status, 0, `payload inatteso accettato: ${JSON.stringify(payload).slice(0, 200)}`);
        assert.match(result.stderr, message);
      }
      assert.equal(psql('select count(*) from public.orders;').stdout.trim(), '0');
      assert.equal(psql(`select next_sequence from public.business_days where id = '${IDS.day}';`).stdout.trim(), '0');
    });

    await t.test('idempotenza restituisce lo stesso ordine senza consumare sequenze', () => {
      resetOperationalData();
      openService();
      const token = '70000000-0000-4000-8000-000000000021';
      const first = receipt(callPublicOrder(basePayload(token)));
      const retry = receipt(callPublicOrder(basePayload(token)));

      assert.equal(retry.order_id, first.order_id);
      assert.equal(retry.sequence, 1);
      assert.equal(psql('select count(*) from public.orders;').stdout.trim(), '1');
      assert.equal(psql(`select next_sequence from public.business_days where id = '${IDS.day}';`).stdout.trim(), '1');

      const conflicting = callPublicOrder(basePayload(token, {
        items: [{ product_id: IDS.margherita, quantity: 2, changes: [] }]
      }), true);
      assert.notEqual(conflicting.status, 0);
      assert.match(conflicting.stderr, /idempotency token already used with different payload/i);
      assert.equal(psql(`select next_sequence from public.business_days where id = '${IDS.day}';`).stdout.trim(), '1');
    });

    await t.test('limita raffiche per telefono senza penalizzare retry idempotenti', () => {
      resetOperationalData();
      openService();
      const tokens = Array.from({ length: 6 }, (_, index) =>
        `70000000-0000-4000-8000-${String(index + 31).padStart(12, '0')}`
      );
      for (const token of tokens.slice(0, 5)) callPublicOrder(basePayload(token));

      const limited = callPublicOrder(basePayload(tokens[5]), true);
      assert.notEqual(limited.status, 0);
      assert.match(limited.stderr, /too many recent orders for this phone/i);
      const retry = receipt(callPublicOrder(basePayload(tokens[0])));
      assert.equal(retry.sequence, 1);
      assert.equal(psql('select count(*) from public.orders;').stdout.trim(), '5');
      assert.equal(psql(`select next_sequence from public.business_days where id = '${IDS.day}';`).stdout.trim(), '5');
    });

    await t.test('storico è append-only e le aggiunte Creator passano da RPC controllate', () => {
      resetOperationalData();
      openService();
      const created = receipt(callPublicOrder(basePayload('70000000-0000-4000-8000-000000000041', {
        items: [{ product_id: IDS.margherita, quantity: 1, changes: [{
          type: 'addition', ingredient_id: IDS.bufalaAddition, quantity: 1
        }] }]
      })));

      const revisionId = creatorSql(`select public.append_order_revision(
        '${created.order_id}', '{"items":[],"total_cents":900}'::jsonb, 'Correzione Creator'
      );`).stdout.trim().split('\n').at(-1);
      assert.match(revisionId, /^[0-9a-f-]{36}$/i);

      const adjustmentId = creatorSql(`select public.record_payment_adjustment(
        '${created.order_id}', 'supplement', 100, 'pending', 'cash', 'Differenza demo'
      );`).stdout.trim().split('\n').at(-1);
      assert.match(adjustmentId, /^[0-9a-f-]{36}$/i);

      const mutations = [
        `update public.orders set customer_name = 'Sovrascritto' where id = '${created.order_id}';`,
        `delete from public.orders where id = '${created.order_id}';`,
        `update public.order_items set note = 'sovrascritto';`,
        `delete from public.order_item_changes;`,
        `update public.order_revisions set snapshot = '{}'::jsonb;`,
        `delete from public.payment_adjustments;`,
        `insert into public.order_revisions (order_id, revision, snapshot, reason)
          values ('${created.order_id}', 99, '{}'::jsonb, 'bypass');`,
        `insert into public.payment_adjustments (order_id, adjustment_type, amount_cents)
          values ('${created.order_id}', 'supplement', 1);`
      ];
      for (const sql of mutations) {
        const result = creatorSql(sql, true);
        assert.notEqual(result.status, 0, `mutazione storica accettata: ${sql}`);
      }
      assert.equal(psql('select count(*) from public.order_revisions;').stdout.trim(), '2');
      assert.equal(psql('select count(*) from public.payment_adjustments;').stdout.trim(), '1');
    });

    await t.test('snapshot allergeni resta invariato dopo modifiche catalogo', () => {
      resetOperationalData();
      openService();
      const created = receipt(callPublicOrder(basePayload('70000000-0000-4000-8000-000000000051')));
      const before = psql(`
        select allergens_snapshot::text from public.order_items where order_id = '${created.order_id}';
      `).stdout.trim();
      const parsed = JSON.parse(before);
      assert.deepEqual(parsed.map(value => value.id).sort(), [
        '10000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000007'
      ]);
      assert.ok(parsed.every(value => value.label_it && value.label_en));

      const revisionBefore = psql(`
        select snapshot::text from public.order_revisions
        where order_id = '${created.order_id}' and revision = 1;
      `).stdout.trim();
      const snapshot = JSON.parse(revisionBefore);
      assert.equal(snapshot.request_token, '70000000-0000-4000-8000-000000000051');
      assert.equal(snapshot.items.length, 1);
      assert.deepEqual(Object.keys(snapshot.items[0]).sort(), [
        'allergens', 'changes', 'name_it', 'note', 'product_id', 'product_type',
        'quantity', 'total_price_cents', 'unit_price_cents'
      ]);
      assert.equal(snapshot.items[0].unit_price_cents, Number(psql(`
        select price_cents from public.products where id = '${IDS.margherita}';
      `).stdout.trim()));

      psql(`update public.allergens set label_it = 'CAMBIATO', label_en = 'CHANGED';`);
      const after = psql(`
        select allergens_snapshot::text from public.order_items where order_id = '${created.order_id}';
      `).stdout.trim();
      assert.equal(after, before);
      assert.equal(psql(`
        select snapshot::text from public.order_revisions
        where order_id = '${created.order_id}' and revision = 1;
      `).stdout.trim(), revisionBefore);
    });

    await t.test('ordine e servizio devono appartenere alla stessa giornata', () => {
      resetOperationalData();
      openService();
      psql(`insert into public.business_days (id, business_date) values ('${IDS.otherDay}', date '2026-08-25');`);
      const mismatched = psql(`
        insert into public.orders (
          business_day_id, service_id, sequence, source, status, customer_name,
          customer_phone, payment_method, gross_cents, fee_cents, total_cents
        ) values (
          '${IDS.otherDay}', '${IDS.service}', 1, 'restaurant', 'preparing', 'Cliente',
          '+393331234567', 'cash', 800, 0, 800
        );
      `, { allowFailure: true });
      assert.notEqual(mismatched.status, 0);
      assert.match(mismatched.stderr, /foreign key constraint/i);
      assert.equal(psql('select count(*) from public.orders;').stdout.trim(), '0');
    });

    await t.test('creazione ordine e chiusura servizio sono serializzate', async () => {
      resetOperationalData();
      openService();
      const payload = basePayload('70000000-0000-4000-8000-000000000061');
      const args = [
        'exec', '-e', 'PGAPPNAME=hm_order_session', '-i', container,
        'psql', '-X', '-qAt', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1'
      ];
      const orderSession = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] });
      let orderStdout = '';
      let orderStderr = '';
      orderSession.stdout.on('data', chunk => { orderStdout += chunk; });
      orderSession.stderr.on('data', chunk => { orderStderr += chunk; });
      orderSession.stdin.end(`
        begin;
        set role anon;
        select public.create_public_order(${quoteJson(payload)});
        select pg_sleep(2);
        commit;
      `);

      let sleeping = false;
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const active = psql(`
          select count(*) from pg_stat_activity
          where application_name = 'hm_order_session' and query like '%pg_sleep%';
        `).stdout.trim();
        if (active === '1') {
          sleeping = true;
          break;
        }
        Atomics.wait(waitBuffer, 0, 0, 50);
      }
      assert.equal(sleeping, true, 'sessione ordine concorrente non osservata');

      const close = psql(`
        update public.services
           set status = 'closed', online_orders_enabled = false, closed_at = now()
         where id = '${IDS.service}';
      `, { allowFailure: true });
      assert.notEqual(close.status, 0);
      assert.match(close.stderr, /service has active orders/i);

      const orderExit = await new Promise(resolve => orderSession.once('close', resolve));
      assert.equal(orderExit, 0, `${orderStdout}\n${orderStderr}`);
      assert.equal(psql(`select status from public.services where id = '${IDS.service}';`).stdout.trim(), 'open');
      assert.equal(psql('select count(*) from public.orders;').stdout.trim(), '1');
    });
  } finally {
    command(['docker', 'stop', container]);
  }
});
