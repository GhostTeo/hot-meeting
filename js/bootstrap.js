import { createRepository } from './data/repository.js';

function requirePublicConfig(config) {
  if (!config?.mode) throw new TypeError('La configurazione deve dichiarare mode: local o supabase');
  if (config.mode !== 'supabase') return;
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    throw new TypeError('Supabase richiede URL e chiave pubblica anon');
  }
  if (/service.?role|sb_secret/i.test(config.supabaseAnonKey)) {
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
  const auth = remoteAuth(client);
  return {
    mode: 'supabase',
    repository: createRepository({ client, storage, initialState }),
    auth,
    session: await auth.getSession()
  };
}

export function isCreatorSession(session) {
  return session?.user?.app_metadata?.role === 'creator';
}
