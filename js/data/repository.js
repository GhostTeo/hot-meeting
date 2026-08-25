import { createLocalRepository } from './local-repository.js';
import { createSupabaseRepository } from './supabase-repository.js';

export const REPOSITORY_METHODS = Object.freeze([
  'getMenu',
  'getState',
  'saveProduct',
  'saveMenuProduct',
  'deleteMenuProduct',
  'setProductPhoto',
  'setServiceOven',
  'openService',
  'closeService',
  'setServiceOnline',
  'saveWeeklyClosure',
  'addClosureException',
  'removeClosureException',
  'createOrder',
  'reviseOrder',
  'updateOrderStatus',
  'recordPaymentAdjustment',
  'transitionPaymentAdjustment',
  'subscribe'
]);

export function createRepository({ client, storage, storageKey, initialState, accessMode } = {}) {
  const cache = createLocalRepository({ storage, storageKey, initialState });
  return client ? createSupabaseRepository({ client, cache, accessMode }) : cache;
}
