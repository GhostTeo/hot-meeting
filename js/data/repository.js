import { createLocalRepository } from './local-repository.js';
import { createSupabaseRepository } from './supabase-repository.js';

export function createRepository({ client, storage, storageKey, initialState, accessMode, placeOrder } = {}) {
  const cache = createLocalRepository({ storage, storageKey, initialState });
  return client ? createSupabaseRepository({ client, cache, accessMode, placeOrder }) : cache;
}
