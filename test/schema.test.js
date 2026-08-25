import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationsUrl = new URL('../supabase/migrations/', import.meta.url);
const migrationUrl = new URL('202608240001_core.sql', migrationsUrl);

function migrationSql() {
  assert.ok(existsSync(migrationUrl), 'la migrazione Supabase core deve esistere');
  return readFileSync(migrationUrl, 'utf8');
}

// Le verifiche di coerenza guardano lo schema completo, non solo la migrazione
// iniziale, cosi' una migrazione successiva non puo' sfuggire ai controlli.
function allMigrationsSql() {
  return readdirSync(migrationsUrl)
    .filter(name => name.endsWith('.sql'))
    .sort()
    .map(name => readFileSync(new URL(name, migrationsUrl), 'utf8'))
    .join('\n');
}

test('la migrazione abilita RLS su ordini ed eventi', () => {
  const sql = migrationSql();

  assert.match(sql, /alter table public\.orders enable row level security/i);
  assert.match(sql, /alter table public\.events enable row level security/i);
});

test('crea tutte le tabelle del modello persistente', () => {
  const sql = migrationSql();
  const tables = [
    'products',
    'product_translations',
    'ingredients',
    'ingredient_translations',
    'product_ingredients',
    'allergens',
    'product_allergens',
    'services',
    'business_days',
    'service_sessions',
    'closures',
    'orders',
    'order_items',
    'order_item_changes',
    'order_revisions',
    'payment_adjustments',
    'events'
  ];

  for (const table of tables) {
    assert.match(sql, new RegExp(`create table public\\.${table}\\b`, 'i'), `tabella ${table} mancante`);
  }
});

test('nega agli anonimi ordini ed eventi e limita il menu ai record disponibili', () => {
  const sql = migrationSql();
  const anonymousGrants = sql
    .split(';')
    .map(statement => statement.trim())
    .filter(statement => /^grant\b/i.test(statement) && /\bto anon\b/i.test(statement));

  assert.match(sql, /revoke all on table public\.orders from anon/i);
  assert.match(sql, /revoke all on table public\.events from anon/i);
  assert.match(sql, /create policy products_public_read[\s\S]*?to anon, authenticated[\s\S]*?using \(available\)/i);
  for (const grant of anonymousGrants) {
    assert.doesNotMatch(grant, /public\.(?:orders|order_items|events)\b/i);
  }
});

test('protegge i dati operativi con il ruolo Creator', () => {
  const sql = migrationSql();

  assert.match(sql, /create (?:or replace )?function public\.is_creator\(\)[\s\S]*?app_metadata[\s\S]*?creator/i);
  assert.match(sql, /create policy orders_creator_access[\s\S]*?using \(public\.is_creator\(\)\)[\s\S]*?with check \(public\.is_creator\(\)\)/i);
  assert.match(sql, /create policy events_creator_insert[\s\S]*?with check \(public\.is_creator\(\)\)/i);
});

test('assegna il progressivo giornaliero con un aggiornamento atomico', () => {
  const sql = migrationSql();

  assert.match(sql, /function public\.next_order_sequence\(p_business_day uuid\)/i);
  assert.match(sql, /update public\.business_days[\s\S]*?set next_sequence = next_sequence \+ 1[\s\S]*?returning next_sequence/i);
  assert.match(sql, /revoke all on function public\.next_order_sequence\(uuid\) from public, anon, authenticated/i);
});

test('la RPC pubblica ricalcola prezzi e accetta ordini solo durante un servizio aperto', () => {
  const sql = migrationSql();

  assert.match(sql, /function public\.create_public_order\(payload jsonb\)/i);
  assert.match(sql, /security definer/i);
  assert.match(sql, /from public\.services[\s\S]*?status = 'open'[\s\S]*?online_orders_enabled/i);
  assert.match(sql, /from public\.products[\s\S]*?available/i);
  assert.match(sql, /v_unit_price := v_product\.price_cents/i);
  assert.match(sql, /grant execute on function public\.create_public_order\(jsonb\) to anon, authenticated/i);
  assert.doesNotMatch(sql, /payload\s*->>?\s*'price'/i);
});

test('il registro eventi è append-only e indicizzato per audit', () => {
  const sql = migrationSql();

  assert.match(sql, /before update or delete on public\.events/i);
  assert.match(sql, /raise exception 'events are append-only'/i);
  assert.match(sql, /create index events_business_day_created_idx on public\.events \(business_day_id, created_at desc\)/i);
  assert.doesNotMatch(sql, /create policy events_creator_(?:update|delete)/i);
});

test('impedisce la cancellazione fisica degli ordini', () => {
  const sql = migrationSql();

  assert.match(sql, /before delete on public\.orders/i);
  assert.match(sql, /raise exception 'orders cannot be deleted'/i);
  assert.match(sql, /create trigger orders_protect_history\s+before update on public\.orders/is);
  assert.match(sql, /historical order fields cannot be overwritten/i);
  assert.match(sql, /revoke delete on table public\.orders from authenticated/i);
});

test('blocca catalogo e prezzi durante il ricalcolo della RPC', () => {
  const sql = migrationSql();

  assert.match(sql, /from public\.products[\s\S]*?and available[\s\S]*?for share/i);
  assert.match(sql, /from public\.product_ingredients pi[\s\S]*?join public\.ingredients ingredient[\s\S]*?for share of pi, ingredient/i);
});

test('impedisce di chiudere un servizio con ordini attivi', () => {
  const sql = migrationSql();

  assert.match(sql, /before update of status on public\.services/i);
  assert.match(sql, /status in \('received', 'preparing'\)/i);
  assert.match(sql, /raise exception 'service has active orders'/i);
});

test('la RPC applica schema JSON chiuso, limiti e idempotenza', () => {
  const sql = migrationSql();

  assert.match(sql, /octet_length\(payload::text\) > 32768/i);
  assert.match(sql, /unknown top-level key/i);
  assert.match(sql, /unknown item key/i);
  assert.match(sql, /unknown change key/i);
  assert.match(sql, /client_request_token uuid unique/i);
  assert.match(sql, /request_fingerprint bytea/i);
  assert.match(sql, /too many recent orders for this phone/i);
  assert.doesNotMatch(sql, /values \(v_order_id, 1, payload\b/i);
});

test('le tabelle storiche sono immutabili e aggiornate tramite RPC Creator', () => {
  const sql = migrationSql();

  assert.match(sql, /before update or delete on public\.order_revisions/i);
  assert.match(sql, /before update or delete on public\.order_items/i);
  assert.match(sql, /before update or delete on public\.order_item_changes/i);
  assert.match(sql, /before update or delete on public\.payment_adjustments/i);
  assert.match(sql, /function public\.revise_order\(/i);
  assert.match(sql, /function public\.record_payment_adjustment\(/i);
  assert.match(sql, /revoke insert, update, delete on table public\.order_items/i);
});

test('snapshotta allergeni e vincola ordine e servizio alla stessa giornata', () => {
  const sql = migrationSql();

  assert.match(sql, /allergens_snapshot jsonb not null/i);
  assert.match(sql, /jsonb_build_object\('id', allergen\.id, 'label_it', allergen\.label_it, 'label_en', allergen\.label_en\)/i);
  assert.match(sql, /foreign key \(service_id, business_day_id\) references public\.services \(id, business_day_id\)/i);
});

test('le RPC Creator creano ordini ristorante e revisioni operative versionate', () => {
  const sql = migrationSql();

  assert.match(sql, /function public\.create_restaurant_order\(payload jsonb\)/i);
  assert.match(sql, /function public\.revise_order\(\s*p_order_id uuid,\s*p_items jsonb,\s*p_reason text\s*\)/is);
  assert.match(sql, /order_items[\s\S]*?revision integer not null/i);
  assert.match(sql, /create view public\.current_order_items/i);
  assert.match(sql, /create view public\.current_order_totals/i);
  assert.match(sql, /revoke insert on table public\.orders from authenticated/i);
  assert.match(sql, /grant execute on function public\.create_restaurant_order\(jsonb\) to authenticated/i);
  assert.match(sql, /grant execute on function public\.revise_order\(uuid, jsonb, text\) to authenticated/i);
});

test('i movimenti pagamento usano versioni immutabili e una vista corrente', () => {
  const sql = migrationSql();

  assert.match(sql, /adjustment_group_id uuid not null/i);
  assert.match(sql, /version integer not null/i);
  assert.match(sql, /supersedes_id uuid(?: unique)? references public\.payment_adjustments/i);
  assert.match(sql, /function public\.transition_payment_adjustment\(/i);
  assert.match(sql, /current status must be pending/i);
  assert.match(sql, /create view public\.current_payment_adjustments/i);
  assert.match(sql, /grant execute on function public\.transition_payment_adjustment\(uuid, text\) to authenticated/i);
});

test('il lifecycle servizi passa da RPC Creator atomiche e non da scritture tabella', () => {
  const sql = migrationSql();

  assert.match(sql, /function public\.open_service\(\s*p_business_date date,\s*p_shift text,\s*p_online_orders_enabled boolean,\s*p_capacity_pizzas_hour integer\s*\)/is);
  assert.match(sql, /function public\.reopen_service\(\s*p_service_id uuid,\s*p_online_orders_enabled boolean\s*\)/is);
  assert.match(sql, /function public\.close_service\(\s*p_service_id uuid,\s*p_close_business_day boolean\s*\)/is);
  assert.match(sql, /open_service[\s\S]*?pg_advisory_xact_lock/is);
  assert.match(sql, /reopen_service[\s\S]*?insert into public\.service_sessions/is);
  assert.match(sql, /close_service[\s\S]*?status in \('received', 'preparing'\)/is);
  assert.match(sql, /revoke insert, update, delete on table public\.business_days, public\.services, public\.service_sessions from authenticated/i);
  assert.match(sql, /grant execute on function public\.open_service\(date, text, boolean, integer\) to authenticated/i);
  assert.match(sql, /grant execute on function public\.reopen_service\(uuid, boolean\) to authenticated/i);
  assert.match(sql, /grant execute on function public\.close_service\(uuid, boolean\) to authenticated/i);
  assert.match(sql, /function public\.save_product\(\s*p_product_id uuid,\s*p_price_cents integer,\s*p_available boolean\s*\)/is);
  assert.match(sql, /grant execute on function public\.save_product\(uuid, integer, boolean\) to authenticated/i);
  assert.match(sql, /function public\.transition_order_status\(\s*p_order_id uuid,\s*p_target_status text\s*\)/is);
  assert.match(sql, /grant execute on function public\.transition_order_status\(uuid, text\) to authenticated/i);
  assert.match(sql, /function public\.set_service_online\(\s*p_service_id uuid,\s*p_enabled boolean\s*\)/is);
  assert.match(sql, /grant execute on function public\.set_service_online\(uuid, boolean\) to authenticated/i);
});

test('registra nel publication Realtime tutte le sorgenti riconciliate dal repository', () => {
  const sql = allMigrationsSql();

  for (const table of [
    'products', 'product_translations', 'ingredients', 'product_ingredients', 'product_allergens',
    'business_days', 'services', 'service_sessions', 'orders', 'order_items',
    'order_item_changes', 'order_revisions', 'closures'
  ]) {
    assert.match(sql, new RegExp(`'${table}'`, 'i'), `sorgente Realtime ${table} mancante`);
  }
  assert.match(sql, /alter publication supabase_realtime add table public\.%I/i);
  assert.match(sql, /function public\.is_open_business_day\(p_business_day_id uuid\)[\s\S]*?business_days[\s\S]*?status = 'open'/i);
  assert.match(sql, /create policy services_public_realtime_read[\s\S]*?to anon, authenticated[\s\S]*?is_open_business_day\(business_day_id\)/i);
  assert.match(sql, /grant select on table public\.services to anon/i);
});
