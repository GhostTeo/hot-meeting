import { createRepository } from './data/repository.js';
import { ordineProtetto } from './ordine-protetto.js';

function decodeJwtPayload(key) {
  const parts = key.split('.');
  if (parts.length !== 3) return null;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const binary = globalThis.atob(padded);
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

function isPublicSupabaseKey(key) {
  if (key.startsWith('sb_publishable_')) return true;
  const payload = decodeJwtPayload(key);
  return payload?.role === 'anon';
}

function requirePublicConfig(config) {
  if (!config?.mode) throw new TypeError('La configurazione deve dichiarare mode: local o supabase');
  if (config.mode !== 'supabase') return;
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    throw new TypeError('Supabase richiede URL e chiave pubblica anon');
  }
  if (!isPublicSupabaseKey(config.supabaseAnonKey)) {
    throw new TypeError('Usare esclusivamente una chiave pubblica anon Supabase');
  }
}

function localAuth() {
  let session = null;
  const listeners = new Set();
  return {
    async getSession() { return session; },
    async signIn(username, password) {
      if (username !== 'creator' || password !== 'pizza143') throw new Error('Credenziali non corrette');
      session = { user: { app_metadata: { role: 'creator' } } };
      for (const listener of listeners) listener(session);
      return session;
    },
    async signOut() {
      session = null;
      for (const listener of listeners) listener(null);
    },
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}

function remoteAuth(client) {
  return {
    async getSession() {
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      return data.session;
    },
    async signIn(email, password) {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return data.session;
    },
    async signOut() {
      const { error } = await client.auth.signOut();
      if (error) throw error;
    },
    onChange(listener) {
      const { data } = client.auth.onAuthStateChange((_event, session) => listener(session));
      return () => data.subscription.unsubscribe();
    }
  };
}

export async function bootstrapDataLayer({ config, supabase, storage, initialState } = {}) {
  requirePublicConfig(config);
  if (config.mode === 'local') {
    const auth = localAuth();
    return {
      mode: 'local',
      repository: createRepository({ storage, initialState }),
      auth,
      session: await auth.getSession()
    };
  }
  if (!supabase?.createClient) throw new TypeError('SDK Supabase browser non disponibile');
  const client = supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  const remote = remoteAuth(client);
  let currentSession = await remote.getSession();
  const auth = {
    async getSession() {
      currentSession = await remote.getSession();
      return currentSession;
    },
    async signIn(email, password) {
      currentSession = await remote.signIn(email, password);
      return currentSession;
    },
    async signOut() {
      await remote.signOut();
      currentSession = null;
    },
    onChange(listener) {
      return remote.onChange(session => {
        currentSession = session;
        listener(session);
      });
    }
  };
  return {
    mode: 'supabase',
    repository: createRepository({
      client, storage, initialState,
      accessMode: () => isCreatorSession(currentSession) ? 'creator' : 'anon',
      placeOrder: ordineProtetto(config)
    }),
    auth,
    session: currentSession
  };
}

export function isCreatorSession(session) {
  return session?.user?.app_metadata?.role === 'creator';
}
