import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { bootstrapDataLayer } from '../js/bootstrap.js';
import { applyRepositorySnapshot, hydrateApplicationState } from '../js/app-state.js';

test('bootstrap Supabase usa config pubblica, ripristina sessione e autentica via email/password', async () => {
  const calls = [];
  const session = { user: { app_metadata: { role: 'creator' } } };
  const client = {
    auth: {
      async getSession() { calls.push(['getSession']); return { data: { session }, error: null }; },
      async signInWithPassword(credentials) {
        calls.push(['signInWithPassword', credentials]);
        return { data: { session }, error: null };
      },
      onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; }
    }
  };
  const supabase = {
    createClient(url, key, options) {
      calls.push(['createClient', url, key, options]);
      return client;
    }
  };

  const runtime = await bootstrapDataLayer({
    config: { mode: 'supabase', supabaseUrl: 'https://project.supabase.co', supabaseAnonKey: 'sb_publishable_demo' },
    supabase,
    initialState: { menu: [] }
  });
  await runtime.auth.signIn('creator@example.test', 'correct horse battery staple');

  assert.equal(runtime.mode, 'supabase');
  assert.equal(runtime.session, session);
  assert.deepEqual(calls[0], ['createClient', 'https://project.supabase.co', 'sb_publishable_demo', {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  }]);
  assert.deepEqual(calls.at(-1), ['signInWithPassword', {
    email: 'creator@example.test', password: 'correct horse battery staple'
  }]);
});

test('bootstrap rifiuta modalità implicita e credenziali service-role', async () => {
  await assert.rejects(() => bootstrapDataLayer({ config: {} }), /mode/i);
  await assert.rejects(() => bootstrapDataLayer({
    config: { mode: 'supabase', supabaseUrl: 'https://project.supabase.co', supabaseAnonKey: 'sb_secret_service_role' },
    supabase: { createClient() { throw new Error('non deve essere chiamato'); } }
  }), /pubblica anon/i);
});

test('login demo esiste soltanto quando la modalità locale è esplicita', async () => {
  const runtime = await bootstrapDataLayer({ config: { mode: 'local' }, initialState: { menu: [] } });

  const signedIn = await runtime.auth.signIn('creator', 'pizza143');

  assert.equal(signedIn.user.app_metadata.role, 'creator');
  await assert.rejects(() => runtime.auth.signIn('creator', 'errata'), /credenziali/i);
});

test('snapshot remoto vuoto sostituisce i default e alimenta cucina e report', async () => {
  const initial = {
    menu: [{ id: 'default' }], orders: [{ id: 'locale' }], services: { dinner: { id: 'locale' } },
    activeDay: { id: 'locale' }, shift: 'dinner', online: true, cart: [{ id: 'cart' }]
  };
  const snapshot = {
    menu: [], orders: [{ id: 'remote', status: 'preparing', items: [] }], services: {},
    activeDay: null, shift: null, online: false
  };

  const applied = applyRepositorySnapshot(initial, snapshot);
  const hydrated = await hydrateApplicationState(initial, { getState: async () => snapshot });

  assert.deepEqual(applied.menu, []);
  assert.deepEqual(applied.orders.map(order => order.id), ['remote']);
  assert.deepEqual(applied.cart, [{ id: 'cart' }]);
  assert.deepEqual(hydrated, applied);
});

test('pagina distribuita carica SDK Supabase prima del modulo app', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

  assert.match(html, /@supabase\/supabase-js@2/i);
  assert.ok(html.indexOf('@supabase/supabase-js@2') < html.indexOf('js/app.js'));
});
