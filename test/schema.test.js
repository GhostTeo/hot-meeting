import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const migrationUrl = new URL('../supabase/migrations/202608240001_core.sql', import.meta.url);

function migrationSql() {
  assert.ok(existsSync(migrationUrl), 'la migrazione Supabase core deve esistere');
  return readFileSync(migrationUrl, 'utf8');
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
