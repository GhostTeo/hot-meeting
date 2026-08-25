import assert from 'node:assert/strict';
import test from 'node:test';

import { createLocalRepository } from '../js/data/local-repository.js';
import { createSupabaseRepository } from '../js/data/supabase-repository.js';
import { createRepository } from '../js/data/repository.js';

export function repositoryContract(label, createRepository) {
  test(`${label}: salva e rilegge una modifica menu`, async () => {
    const repo = await createRepository();

    await repo.saveProduct({ id: 'margherita', price: 9 });

    assert.equal((await repo.getMenu()).find(product => product.id === 'margherita').price, 9);
  });

  test(`${label}: gestisce servizio, ordini, revisioni e sottoscrizioni`, async () => {
    const repo = await createRepository();
    const events = [];
    const unsubscribe = repo.subscribe(event => events.push(event));

    await repo.openService({ id: 'dinner-1', shift: 'dinner' });
    await repo.createOrder({ id: 'order-1', serviceId: 'dinner-1', items: [{ quantity: 1 }] });
    await repo.reviseOrder('order-1', { items: [{ quantity: 2 }], reason: 'Aggiunta pizza' });
    await repo.closeService('dinner-1');
    unsubscribe();
    await repo.saveProduct({ id: 'margherita', available: false });

    const snapshot = repo.getSnapshot();
    assert.equal(snapshot.services.dinner.id, 'dinner-1');
    assert.equal(snapshot.services.dinner.status, 'closed');
    assert.equal(snapshot.orders[0].revision, 2);
    assert.deepEqual(snapshot.orders[0].items, [{ quantity: 2 }]);
    assert.deepEqual(events.map(event => event.scope), ['services', 'orders', 'orders', 'services']);
  });

  test(`${label}: il calendario vive nel repository e non solo nel browser`, async () => {
    const repo = await createRepository();

    await repo.saveWeeklyClosure(3);
    await repo.addClosureException({ from: '2026-08-10', to: '2026-08-20', closed: true, message: 'Ferie' });
    const state = await repo.getState();

    assert.deepEqual(state.calendar.closedWeekdays, [3]);
    assert.deepEqual(state.calendar.exceptions.map(exception => exception.message), ['Ferie']);
  });

  test(`${label}: cambiare riposo settimanale sostituisce il giorno invece di aggiungerlo`, async () => {
    const repo = await createRepository();

    await repo.saveWeeklyClosure(2);
    await repo.saveWeeklyClosure(4);

    assert.deepEqual((await repo.getState()).calendar.closedWeekdays, [4]);
  });

  test(`${label}: un movimento di pagamento resta separato dall ordine`, async () => {
    const repo = await createRepository();
    await repo.openService({ id: 'lunch-1', shift: 'lunch' });
    await repo.createOrder({ id: 'order-9', serviceId: 'lunch-1', items: [{ quantity: 1 }], total: 20 });

    await repo.recordPaymentAdjustment('order-9', { type: 'supplement', amount: 5, status: 'pending', method: 'cash' });
    const state = await repo.getState();

    assert.deepEqual(state.adjustments.map(movement => ({ orderId: movement.orderId, type: movement.type, amount: movement.amount, status: movement.status })), [
      { orderId: 'order-9', type: 'supplement', amount: 5, status: 'pending' }
    ]);
    assert.equal(state.orders.find(order => order.id === 'order-9').total, 20);
  });

  test(`${label}: un movimento in attesa puo essere registrato o annullato`, async () => {
    const repo = await createRepository();
    await repo.openService({ id: 'lunch-1', shift: 'lunch' });
    await repo.createOrder({ id: 'order-9', serviceId: 'lunch-1', items: [{ quantity: 1 }], total: 20 });
    const movement = await repo.recordPaymentAdjustment('order-9', { type: 'supplement', amount: 5, method: 'cash' });

    await repo.transitionPaymentAdjustment(movement.id, 'recorded');

    assert.equal((await repo.getState()).adjustments[0].status, 'recorded');
  });

  test(`${label}: un eccezione del calendario si rimuove per identificativo`, async () => {
    const repo = await createRepository();
    await repo.addClosureException({ date: '2026-08-15', closed: false, message: 'Ferragosto aperto' });
    const { id } = (await repo.getState()).calendar.exceptions[0];

    await repo.removeClosureException(id);

    assert.deepEqual((await repo.getState()).calendar.exceptions, []);
  });
}

repositoryContract('repository locale', async () => createLocalRepository({
  initialState: { menu: [{ id: 'margherita', price: 8 }], services: {}, orders: [] }
}));

test('repository locale: persiste lo snapshot nello storage configurato', async () => {
  const values = new Map();
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  };
  const first = createLocalRepository({
    storage,
    storageKey: 'test-cache',
    initialState: { menu: [{ id: 'margherita', price: 8 }] }
  });
  await first.saveProduct({ id: 'margherita', price: 9 });

  const restored = createLocalRepository({ storage, storageKey: 'test-cache' });

  assert.equal((await restored.getMenu())[0].price, 9);
});

test('repository locale: ignora una cache illeggibile e riparte dai dati iniziali', async () => {
  const repo = createLocalRepository({
    storage: { getItem: () => '{non-json', setItem() {} },
    initialState: { menu: [{ id: 'margherita', price: 8 }] }
  });

  assert.equal((await repo.getMenu())[0].price, 8);
});

function fakeSupabase({ rows = [], readError = null } = {}) {
  const calls = [];
  const realtimeTables = [];
  let removedChannel = null;

  return {
    calls,
    realtimeTables,
    get removedChannel() {
      return removedChannel;
    },
    from(table) {
      const query = {
        select(columns) {
          calls.push({ operation: 'select', table, columns });
          return Promise.resolve({ data: rows, error: readError });
        },
        update(values) {
          calls.push({ operation: 'update', table, values });
          return {
            eq(column, value) {
              calls.at(-1).filter = { column, value };
              return {
                select() {
                  return {
                    single: async () => ({
                      data: { id: value, slug: value, price_cents: values.price_cents, available: values.available },
                      error: null
                    })
                  };
                }
              };
            }
          };
        },
        upsert(values) {
          calls.push({ operation: 'upsert', table, values });
          return {
            select() {
              return { single: async () => ({ data: values, error: null }) };
            }
          };
        }
      };
      return query;
    },
    async rpc(name, args) {
      calls.push({ operation: 'rpc', name, args });
      if (name === 'save_product') return {
        data: { id: args.p_product_id, slug: 'margherita', price_cents: args.p_price_cents, available: args.p_available },
        error: null
      };
      return { data: { order_id: 'remote-order', revision: 2 }, error: null };
    },
    channel(name) {
      const channel = {
        name,
        on(_kind, filter) {
          realtimeTables.push(filter.table);
          return channel;
        },
        subscribe() {
          return channel;
        }
      };
      return channel;
    },
    async removeChannel(channel) {
      removedChannel = channel;
    }
  };
}

test('repository Supabase: preferisce il menu remoto e aggiorna la cache di fallback', async () => {
  const cache = createLocalRepository({ initialState: { menu: [{ id: 'vecchio', price: 1 }] } });
  const client = fakeSupabase({ rows: [{
    id: 'product-uuid', slug: 'margherita', product_type: 'pizza', price_cents: 900,
    available: true, product_translations: [{ locale: 'it', name: 'Margherita' }]
  }] });
  const repo = createSupabaseRepository({ client, cache });

  const menu = await repo.getMenu();

  assert.deepEqual(menu, [{
    id: 'margherita', databaseId: 'product-uuid', type: 'pizza', name: 'Margherita',
    price: 9, available: true, ingredients: [], additions: [], allergens: [], ingredientIds: {}
  }]);
  assert.deepEqual(await cache.getMenu(), menu);
});

test('repository Supabase: usa la cache soltanto quando la lettura remota fallisce', async () => {
  const cachedMenu = [{ id: 'margherita', price: 8 }];
  const cache = createLocalRepository({ initialState: { menu: cachedMenu } });
  const failing = createSupabaseRepository({
    client: fakeSupabase({ readError: new Error('offline') }),
    cache
  });
  const emptyRemote = createSupabaseRepository({ client: fakeSupabase({ rows: [] }), cache });

  assert.deepEqual(await failing.getMenu(), cachedMenu);
  assert.deepEqual(await emptyRemote.getMenu(), []);
});

test('repository Supabase: una modifica prezzo non perde i dettagli UI del prodotto', async () => {
  const client = fakeSupabase();
  const repo = createSupabaseRepository({ client });
  const product = {
    id: 'margherita', databaseId: 'product-uuid', name: 'Margherita', type: 'pizza',
    price: 8, available: true, ingredients: ['Pomodoro'], additions: [{ name: 'Olive', price: 1 }]
  };

  const saved = await repo.saveProduct({ ...product, price: 9 });

  assert.equal(saved.price, 9);
  assert.deepEqual(saved.ingredients, ['Pomodoro']);
  assert.deepEqual(saved.additions, [{ name: 'Olive', price: 1 }]);
});

test('repository Supabase: instrada ordini e revisioni sulle RPC controllate', async () => {
  const client = fakeSupabase();
  const repo = createSupabaseRepository({ client });

  await repo.createOrder({
    source: 'WEB', requestToken: 'token', serviceId: 'service',
    customer: { name: 'Ada' }, paymentMethod: 'cash',
    items: [{
      id: 'margherita', databaseId: 'product-uuid', price: 99, quantity: 1, note: 'Ben cotta',
      ingredientIds: { Mozzarella: 'ingredient-1' }, removed: ['Mozzarella'],
      additions: [{ id: 'ingredient-2', name: 'Olive', price: 99, quantity: 2 }]
    }]
  });
  await repo.createOrder({ source: 'RESTAURANT', serviceId: 'service', customer: { name: 'Lia' }, paymentMethod: 'cash', items: [] });
  await repo.reviseOrder('order-1', { items: [{ product_id: 'p1' }], reason: 'Correzione' });

  const rpcCalls = client.calls.filter(call => call.operation === 'rpc');
  assert.deepEqual(rpcCalls.map(call => call.name), [
    'create_public_order', 'create_restaurant_order', 'revise_order'
  ]);
  assert.deepEqual(rpcCalls[0].args.payload, {
    request_token: 'token',
    service_id: 'service',
    customer: { name: 'Ada' },
    payment_method: 'cash',
    items: [{
      product_id: 'product-uuid', quantity: 1, note: 'Ben cotta', changes: [
        { type: 'removed', ingredient_id: 'ingredient-1', quantity: 1 },
        { type: 'addition', ingredient_id: 'ingredient-2', quantity: 2 }
      ]
    }]
  });
  assert.deepEqual(client.calls.at(-1).args, {
    p_order_id: 'order-1', p_items: [{ product_id: 'p1' }], p_reason: 'Correzione'
  });
});

test('repository Supabase: usa le RPC controllate per il lifecycle servizio', async () => {
  const client = fakeSupabase();
  const repo = createSupabaseRepository({ client });

  await repo.openService({
    id: 'service-1', businessDayId: 'day-1', businessDate: '2026-08-24', shift: 'dinner',
    online: true, capacity: 90, sessions: [{ openedAt: 1_777_000_000_000 }]
  });
  await repo.closeService('service-1');

  assert.deepEqual(client.calls.filter(call => call.operation === 'rpc').map(call => call.name), [
    'open_service', 'close_service'
  ]);
});

test('repository Supabase: sottoscrive tutte le fonti realtime e rimuove il canale', async () => {
  const client = fakeSupabase();
  const repo = createSupabaseRepository({ client });

  const unsubscribe = repo.subscribe(() => {});
  await unsubscribe();

  assert.deepEqual(client.realtimeTables, [
    'products', 'product_translations', 'ingredients', 'product_ingredients', 'product_allergens',
    'business_days', 'services', 'service_sessions', 'orders', 'order_items',
    'order_item_changes', 'order_revisions', 'closures'
  ]);
  assert.equal(client.removedChannel.name, 'hot-meeting-repository');
});

test('factory repository: usa Supabase solo quando riceve un client pubblico', async () => {
  const local = createRepository({ initialState: { menu: [{ id: 'local', price: 4 }] } });
  const remote = createRepository({ client: fakeSupabase({ rows: [] }) });

  assert.equal((await local.getMenu())[0].id, 'local');
  assert.deepEqual(await remote.getMenu(), []);
  for (const method of ['getMenu', 'saveProduct', 'openService', 'closeService', 'createOrder', 'reviseOrder', 'subscribe']) {
    assert.equal(typeof local[method], 'function');
    assert.equal(typeof remote[method], 'function');
  }
});
