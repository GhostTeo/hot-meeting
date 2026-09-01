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

test('bootstrap decodifica JWT base64url e accetta soltanto role anon', async () => {
  const jwt = role => {
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ role, iss: 'supabase' })}.signature`;
  };
  const supabase = {
    createClient() {
      return {
        auth: {
          async getSession() { return { data: { session: null }, error: null }; },
          onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; }
        }
      };
    }
  };

  await assert.rejects(bootstrapDataLayer({
    config: { mode: 'supabase', supabaseUrl: 'https://project.supabase.co', supabaseAnonKey: jwt('service_role') },
    supabase
  }), /pubblica anon/i);
  await assert.rejects(bootstrapDataLayer({
    config: { mode: 'supabase', supabaseUrl: 'https://project.supabase.co', supabaseAnonKey: jwt('supabase_admin') },
    supabase
  }), /pubblica anon/i);
  const runtime = await bootstrapDataLayer({
    config: { mode: 'supabase', supabaseUrl: 'https://project.supabase.co', supabaseAnonKey: jwt('anon') },
    supabase
  });
  assert.equal(runtime.mode, 'supabase');
});

test('repository remoto cambia accesso quando cambia la sessione autenticata', async () => {
  let authListener;
  const selected = [];
  const client = {
    auth: {
      async getSession() { return { data: { session: null }, error: null }; },
      onAuthStateChange(listener) {
        authListener = listener;
        return { data: { subscription: { unsubscribe() {} } } };
      }
    },
    from(table) {
      const query = {
        select() { selected.push(table); return query; },
        order() { return query; },
        then(resolve, reject) { return Promise.resolve({ data: [], error: null }).then(resolve, reject); }
      };
      return query;
    }
  };
  const runtime = await bootstrapDataLayer({
    config: { mode: 'supabase', supabaseUrl: 'https://project.supabase.co', supabaseAnonKey: 'sb_publishable_demo' },
    supabase: { createClient: () => client }
  });
  const unsubscribe = runtime.auth.onChange(() => {});

  await runtime.repository.getState();
  assert.deepEqual(selected, ['products', 'public_opening_status', 'public_closure_calendar', 'allergens', 'public_queue_status', 'pizzeria_settings']);
  selected.length = 0;
  authListener('SIGNED_IN', { user: { app_metadata: { role: 'creator' } } });
  await runtime.repository.getState();
  assert.ok(selected.includes('orders'));
  unsubscribe();
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
