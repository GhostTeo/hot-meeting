import { createLocalRepository } from './local-repository.js';
import { createSupabaseRepository } from './supabase-repository.js';

export const REPOSITORY_METHODS = Object.freeze([
  'getMenu',
  'getState',
  'saveProduct',
  'openService',
  'closeService',
  'setServiceOnline',
  'createOrder',
  'reviseOrder',
  'updateOrderStatus',
  'subscribe'
]);

export function createRepository({ client, storage, storageKey, initialState } = {}) {
  const cache = createLocalRepository({ storage, storageKey, initialState });
  return client ? createSupabaseRepository({ client, cache }) : cache;
}
