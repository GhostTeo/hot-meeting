import { createLocalRepository } from './local-repository.js';
import { createSupabaseRepository } from './supabase-repository.js';

export function createRepository({ client, storage, storageKey, initialState, accessMode } = {}) {
  const cache = createLocalRepository({ storage, storageKey, initialState });
  return client ? createSupabaseRepository({ client, cache, accessMode }) : cache;
}
