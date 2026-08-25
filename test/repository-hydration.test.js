import assert from 'node:assert/strict';
import test from 'node:test';

import { createLocalRepository } from '../js/data/local-repository.js';
import { createSupabaseRepository } from '../js/data/supabase-repository.js';

function constrainedClient(tables = {}, rpcData = {}, tableErrors = {}, writableTables = []) {
  const calls = [];
  const handlers = new Map();
  const channel = {
    on(_kind, filter, handler) {
      handlers.set(filter.table, handler);
      return channel;
    },
    subscribe() { return channel; }
  };
  return {
    calls,
    handlers,
    from(table) {
      const query = {
        select(columns) {
          calls.push({ type: 'select', table, columns });
          return query;
        },
        order(column, options) {
          calls.push({ type: 'order', table, column, options });
          return query;
        },
        eq(column, value) {
          calls.push({ type: 'eq', table, column, value });
          return query;
        },
        then(resolve, reject) {
          const result = {
            data: structuredClone(tables[table] ?? []),
            error: tableErrors[table] ?? null
          };
          return Promise.resolve(result).then(resolve, reject);
        },
        update() {
          throw new Error(`direct write forbidden: ${table}`);
        },
        upsert() {
          throw new Error(`direct write forbidden: ${table}`);
        },
        insert(values) {
          if (!writableTables.includes(table)) throw new Error(`direct write forbidden: ${table}`);
          calls.push({ type: 'insert', table, values });
          return Promise.resolve({ data: structuredClone(values), error: null });
        },
        delete() {
          if (!writableTables.includes(table)) throw new Error(`direct write forbidden: ${table}`);
          calls.push({ type: 'delete', table });
          return query;
        }
      };
      return query;
    },
    async rpc(name, args) {
      calls.push({ type: 'rpc', name, args });
      return { data: structuredClone(rpcData[name] ?? {}), error: null };
    },
    channel() { return channel; },
    async removeChannel() {}
  };
}

test('hydration remota compone menu, giornata, servizi e viste correnti ordini', async () => {
  const client = constrainedClient({
    products: [{
      id: '20000000-0000-4000-8000-000000000001', slug: 'margherita',
      product_type: 'pizza', price_cents: 900, available: true,
      product_translations: [{ locale: 'it', name: 'Margherita' }]
    }],
    public_opening_status: [{
      service_id: '60000000-0000-4000-8000-000000000001', business_date: '2026-08-24',
      shift: 'dinner', status: 'open', online_orders_enabled: true,
      opened_at: '2026-08-24T17:00:00Z', closed_at: null
    }],
    business_days: [{ id: '50000000-0000-4000-8000-000000000001', business_date: '2026-08-24', status: 'open' }],
    services: [{
      id: '60000000-0000-4000-8000-000000000001',
      business_day_id: '50000000-0000-4000-8000-000000000001', shift: 'dinner',
      status: 'open', online_orders_enabled: true, capacity_pizzas_hour: 90,
      opened_at: '2026-08-24T17:00:00Z', closed_at: null
    }],
    orders: [{
      id: '70000000-0000-4000-8000-000000000001',
      business_day_id: '50000000-0000-4000-8000-000000000001',
      service_id: '60000000-0000-4000-8000-000000000001', sequence: 1,
      source: 'web', status: 'preparing', customer_name: 'Ada', customer_phone: '+393331234567',
      payment_method: 'cash', gross_cents: 900, fee_cents: 0, total_cents: 900,
      eta_ready_at: '2026-08-24T17:20:00Z', created_at: '2026-08-24T17:00:00Z'
    }],
    current_order_items: [{
      id: '80000000-0000-4000-8000-000000000001',
      order_id: '70000000-0000-4000-8000-000000000001', revision: 2,
      product_name_snapshot: 'Margherita', unit_price_cents: 900, quantity: 1,
      total_price_cents: 900, allergens_snapshot: [{ label_it: 'Glutine' }], note: '', sort_order: 0
    }],
    current_order_item_changes: [{
      order_item_id: '80000000-0000-4000-8000-000000000001', change_type: 'addition',
      ingredient_id: '90000000-0000-4000-8000-000000000001',
      ingredient_name_snapshot: 'Olive', unit_price_cents: 100, quantity: 1
    }],
    current_order_totals: [{
      order_id: '70000000-0000-4000-8000-000000000001', revision: 2,
      gross_cents: 900, fee_cents: 0, total_cents: 900
    }]
  });
  const repo = createSupabaseRepository({ client, accessMode: 'creator' });

  const state = await repo.getState();

  assert.equal(state.menu.length, 1);
  assert.deepEqual(state.activeDay, {
    id: '50000000-0000-4000-8000-000000000001', date: '2026-08-24', status: 'open'
  });
  assert.equal(state.services.dinner.id, '60000000-0000-4000-8000-000000000001');
  assert.equal(state.shift, 'dinner');
  assert.equal(state.orders[0].revision, 2);
  assert.equal(state.orders[0].items[0].name, 'Margherita');
  assert.deepEqual(state.orders[0].items[0].additions, [{ id: '90000000-0000-4000-8000-000000000001', name: 'Olive', price: 1, quantity: 1 }]);
  assert.deepEqual(client.calls.filter(call => call.type === 'select').map(call => call.table), [
    'products', 'public_opening_status', 'public_closure_calendar', 'business_days', 'services', 'orders',
    'current_order_items', 'current_order_item_changes', 'current_order_totals', 'closures',
    'current_payment_adjustments'
  ]);
});

test('lifecycle servizio remoto usa soltanto RPC e restituisce UUID server-side', async () => {
  const service = {
    business_day_id: '50000000-0000-4000-8000-000000000001',
    business_date: '2026-08-24', business_day_status: 'open',
    service_id: '60000000-0000-4000-8000-000000000001', shift: 'dinner', status: 'open',
    online_orders_enabled: true, capacity_pizzas_hour: 90, opened_at: '2026-08-24T17:00:00Z'
  };
  const client = constrainedClient({}, {
    open_service: service,
    reopen_service: service,
    close_service: { ...service, status: 'closed', online_orders_enabled: false }
  });
  const repo = createSupabaseRepository({ client });

  const opened = await repo.openService({ businessDate: '2026-08-24', shift: 'dinner', online: true, capacity: 90 });
  await repo.openService({ id: opened.id, action: 'reopen', online: false });
  await repo.closeService(opened.id, { closeBusinessDay: true });

  assert.equal(opened.id, '60000000-0000-4000-8000-000000000001');
  assert.deepEqual(client.calls.map(call => call.name).filter(Boolean), [
    'open_service', 'reopen_service', 'close_service'
  ]);
});

test('transizione stato ordine remoto passa dalla RPC Creator', async () => {
  const client = constrainedClient({}, {
    transition_order_status: { order_id: '70000000-0000-4000-8000-000000000001', status: 'ready' }
  });
  const repo = createSupabaseRepository({ client });

  const order = await repo.updateOrderStatus('70000000-0000-4000-8000-000000000001', 'ready');

  assert.equal(order.status, 'ready');
  assert.deepEqual(client.calls.at(-1), {
    type: 'rpc', name: 'transition_order_status',
    args: { p_order_id: '70000000-0000-4000-8000-000000000001', p_target_status: 'ready' }
  });
});

test('sospensione ordini online passa dalla RPC Creator', async () => {
  const client = constrainedClient({}, {
    set_service_online: { service_id: '60000000-0000-4000-8000-000000000001', online_orders_enabled: false }
  });
  const repo = createSupabaseRepository({ client });

  const service = await repo.setServiceOnline('60000000-0000-4000-8000-000000000001', false);

  assert.equal(service.online, false);
  assert.equal(client.calls.at(-1).name, 'set_service_online');
});

test('adapter locali e remoti emettono lo stesso evento semantico', async () => {
  const local = createLocalRepository({ initialState: { menu: [{ id: 'm', price: 8 }] } });
  const remoteClient = constrainedClient();
  const remote = createSupabaseRepository({ client: remoteClient });
  const localEvents = [];
  const remoteEvents = [];
  local.subscribe(event => localEvents.push(event));
  remote.subscribe(event => remoteEvents.push(event));

  await local.saveProduct({ id: 'm', price: 9 });
  remoteClient.handlers.get('products')({ eventType: 'UPDATE', new: { id: 'p' }, old: {} });

  assert.deepEqual(localEvents[0], { type: 'repository.changed', scope: 'menu' });
  assert.deepEqual(remoteEvents[0], { type: 'repository.changed', scope: 'menu' });
});

test('menu remoto vuoto resta autorevole nello snapshot', async () => {
  const cache = createLocalRepository({ initialState: { menu: [{ id: 'cached', price: 8 }] } });
  const repo = createSupabaseRepository({ client: constrainedClient(), cache });

  const state = await repo.getState();

  assert.deepEqual(state.menu, []);
  assert.deepEqual(await cache.getMenu(), []);
});

test('snapshot Creator è atomico e conserva la cache se una query operativa fallisce', async () => {
  const previous = { menu: [{ id: 'cached', price: 8 }], orders: [{ id: 'old' }] };
  const cache = createLocalRepository({ initialState: previous });
  const previousSnapshot = await cache.getState();
  const client = constrainedClient({
    products: [], public_opening_status: [], business_days: [], services: [], orders: [],
    current_order_items: [], current_order_item_changes: [], current_order_totals: []
  }, {}, { current_order_totals: new Error('totali non disponibili') });
  const repo = createSupabaseRepository({ client, cache, accessMode: 'creator' });

  await assert.rejects(repo.getState(), /totali non disponibili/);
  assert.deepEqual(await cache.getState(), previousSnapshot);
});

test('snapshot anonimo legge solo le viste pubbliche e non maschera i loro errori', async () => {
  const publicTables = {
    products: [],
    public_opening_status: [{
      service_id: 'service-public', business_date: '2026-08-24', shift: 'lunch',
      status: 'open', online_orders_enabled: true, opened_at: '2026-08-24T10:00:00Z'
    }]
  };
  const client = constrainedClient(publicTables, {}, {
    business_days: new Error('permission denied'), services: new Error('permission denied')
  });
  const repo = createSupabaseRepository({ client, accessMode: 'anon' });

  const state = await repo.getState();

  assert.equal(state.services.lunch.id, 'service-public');
  assert.deepEqual(client.calls.filter(call => call.type === 'select').map(call => call.table), [
    'products', 'public_opening_status', 'public_closure_calendar'
  ]);

  const cache = createLocalRepository({ initialState: { menu: [{ id: 'last-good' }] } });
  const failing = createSupabaseRepository({
    client: constrainedClient(publicTables, {}, { public_opening_status: new Error('rete assente') }),
    cache,
    accessMode: 'anon'
  });
  await assert.rejects(failing.getState(), /rete assente/);
  assert.deepEqual((await cache.getState()).menu, [{ id: 'last-good' }]);
});

test('giornata e servizi sono deterministici con fixture ripetute su più date', async () => {
  const client = constrainedClient({
    products: [], public_opening_status: [],
    business_days: [
      { id: 'closed-newer', business_date: '2026-08-25', status: 'closed' },
      { id: 'open-day', business_date: '2026-08-24', status: 'open' },
      { id: 'closed-old', business_date: '2026-08-23', status: 'closed' }
    ],
    services: [
      { id: 'old-lunch', business_day_id: 'closed-old', shift: 'lunch', status: 'closed', opened_at: '2026-08-23T10:00:00Z' },
      { id: 'active-dinner', business_day_id: 'open-day', shift: 'dinner', status: 'open', online_orders_enabled: true, opened_at: '2026-08-24T17:00:00Z' },
      { id: 'future-lunch', business_day_id: 'closed-newer', shift: 'lunch', status: 'closed', opened_at: '2026-08-25T10:00:00Z' },
      { id: 'active-lunch', business_day_id: 'open-day', shift: 'lunch', status: 'closed', opened_at: '2026-08-24T10:00:00Z' }
    ],
    orders: [{
      id: 'historical-order', business_day_id: 'closed-old', service_id: 'old-lunch', sequence: 1,
      source: 'pos', status: 'completed', customer_name: 'Ada', customer_phone: '', payment_method: 'cash',
      gross_cents: 1000, fee_cents: 0, total_cents: 1000, created_at: '2026-08-23T10:05:00Z'
    }],
    current_order_items: [], current_order_item_changes: [], current_order_totals: []
  });
  const repo = createSupabaseRepository({ client, accessMode: 'creator' });

  const state = await repo.getState();

  assert.equal(state.activeDay.id, 'open-day');
  assert.deepEqual(Object.keys(state.services).sort(), ['dinner', 'lunch']);
  assert.equal(state.services.lunch.id, 'active-lunch');
  assert.equal(state.orders[0].shift, 'lunch');
  assert.ok(client.calls.some(call => call.type === 'order' && call.table === 'business_days' && call.column === 'business_date'));
  assert.ok(client.calls.some(call => call.type === 'order' && call.table === 'services' && call.column === 'opened_at'));
});

test('senza giornata aperta sceglie l’ultima giornata chiusa per data', async () => {
  const client = constrainedClient({
    products: [], public_opening_status: [],
    business_days: [
      { id: 'older', business_date: '2026-08-22', status: 'closed' },
      { id: 'latest', business_date: '2026-08-24', status: 'closed' }
    ],
    services: [], orders: [], current_order_items: [], current_order_item_changes: [], current_order_totals: []
  });
  const state = await createSupabaseRepository({ client, accessMode: 'creator' }).getState();

  assert.equal(state.activeDay.id, 'latest');
});

test('lo snapshot locale riflette il turno aperto come quello remoto', async () => {
  const repo = createLocalRepository({
    initialState: { menu: [], services: {}, orders: [], shift: null, activeDay: null, online: false }
  });

  await repo.openService({
    id: 'lunch-2026-08-25-1',
    shift: 'lunch',
    businessDate: '2026-08-25',
    businessDayId: 'day-2026-08-25-1',
    online: true
  });

  const snapshot = await repo.getState();

  assert.equal(snapshot.shift, 'lunch');
  assert.equal(snapshot.online, true);
  assert.deepEqual(snapshot.activeDay, { id: 'day-2026-08-25-1', date: '2026-08-25', status: 'open' });
});

test('la chiusura locale libera il turno senza perdere la giornata operativa', async () => {
  const repo = createLocalRepository({
    initialState: { menu: [], services: {}, orders: [], shift: null, activeDay: null, online: false }
  });
  await repo.openService({
    id: 'lunch-2026-08-25-1',
    shift: 'lunch',
    businessDate: '2026-08-25',
    businessDayId: 'day-2026-08-25-1',
    online: true
  });

  await repo.closeService('lunch-2026-08-25-1');
  const snapshot = await repo.getState();

  assert.equal(snapshot.shift, null);
  assert.equal(snapshot.online, false);
  assert.deepEqual(snapshot.activeDay, { id: 'day-2026-08-25-1', date: '2026-08-25', status: 'open' });
});

test('lo snapshot Creator ricostruisce il calendario dalle chiusure', async () => {
  const client = constrainedClient({
    closures: [
      { id: 'w', closure_type: 'weekly', weekday: 2, public_message: '' },
      { id: 'h', closure_type: 'holiday', starts_on: '2026-08-10', ends_on: '2026-08-20', public_message: 'Ferie' }
    ]
  });
  const repo = createSupabaseRepository({ client, cache: createLocalRepository({}) });

  const state = await repo.getState();

  assert.deepEqual(state.calendar.closedWeekdays, [2]);
  assert.deepEqual(state.calendar.exceptions.map(exception => exception.message), ['Ferie']);
});

test('lo snapshot anonimo legge il calendario dalla vista pubblica e non dalla tabella', async () => {
  const client = constrainedClient({
    public_closure_calendar: [{ closure_type: 'weekly', weekday: 4, public_message: '' }]
  });
  const repo = createSupabaseRepository({ client, cache: createLocalRepository({}), accessMode: 'anon' });

  const state = await repo.getState();

  assert.deepEqual(state.calendar.closedWeekdays, [4]);
  assert.equal(client.calls.some(call => call.table === 'closures'), false);
});

test('cambiare riposo settimanale rimuove la riga precedente prima di inserire', async () => {
  const client = constrainedClient({}, {}, {}, ['closures']);
  const repo = createSupabaseRepository({ client, cache: createLocalRepository({}) });

  await repo.saveWeeklyClosure(5);

  const writes = client.calls.filter(call => ['insert', 'delete'].includes(call.type));
  assert.deepEqual(writes.map(call => call.type), ['delete', 'insert']);
  assert.equal(writes[1].values.weekday, 5);
});

test('le chiusure arrivano in Realtime come le altre sorgenti', async () => {
  const client = constrainedClient();
  const repo = createSupabaseRepository({ client, cache: createLocalRepository({}) });
  const events = [];
  repo.subscribe(event => events.push(event));

  client.handlers.get('closures')({ eventType: 'INSERT', new: {}, old: {} });

  assert.deepEqual(events, [{ type: 'repository.changed', scope: 'calendar' }]);
});

test('le righe composte portano gli identificativi necessari a ricostruire una revisione', async () => {
  const client = constrainedClient({
    products: [],
    public_opening_status: [],
    business_days: [{ id: 'day-1', business_date: '2026-08-25', status: 'open' }],
    services: [{ id: 'svc-1', business_day_id: 'day-1', shift: 'lunch', status: 'open', online_orders_enabled: true }],
    orders: [{
      id: 'ord-1', business_day_id: 'day-1', service_id: 'svc-1', sequence: 1,
      source: 'web', status: 'preparing', customer_name: 'Anna', customer_phone: '3331234567',
      payment_method: 'cash', created_at: '2026-08-25T10:00:00Z'
    }],
    current_order_items: [{
      id: 'item-1', order_id: 'ord-1', revision: 1, product_id: 'prod-margherita',
      product_name_snapshot: 'Margherita', unit_price_cents: 900, quantity: 2,
      total_price_cents: 1800, allergens_snapshot: [], note: '', sort_order: 0
    }],
    current_order_item_changes: [{
      order_item_id: 'item-1', change_type: 'addition', ingredient_id: 'ing-olive',
      ingredient_name_snapshot: 'Olive', unit_price_cents: 100, quantity: 1
    }],
    current_order_totals: [{ order_id: 'ord-1', revision: 1, gross_cents: 1800, fee_cents: 0, total_cents: 1800 }]
  });
  const repo = createSupabaseRepository({ client, accessMode: 'creator' });

  const [order] = (await repo.getState()).orders;
  const [item] = order.items;

  assert.equal(item.productId, 'prod-margherita');
  assert.equal(item.unitPrice, 9);
  assert.deepEqual(item.additions, [{ id: 'ing-olive', name: 'Olive', price: 1, quantity: 1 }]);
});

test('ogni ordine porta la giornata operativa a cui appartiene', async () => {
  const client = constrainedClient({
    products: [], public_opening_status: [],
    business_days: [{ id: 'day-1', business_date: '2026-08-25', status: 'open' }],
    services: [{ id: 'svc-1', business_day_id: 'day-1', shift: 'lunch', status: 'open', online_orders_enabled: true }],
    orders: [{
      id: 'ord-1', business_day_id: 'day-1', service_id: 'svc-1', sequence: 1, source: 'web',
      status: 'preparing', customer_name: 'Anna', customer_phone: '333', payment_method: 'cash',
      created_at: '2026-08-25T10:00:00Z'
    }],
    current_order_items: [], current_order_item_changes: [], current_order_totals: []
  });
  const repo = createSupabaseRepository({ client, accessMode: 'creator' });

  const [order] = (await repo.getState()).orders;

  assert.equal(order.businessDate, '2026-08-25');
});

test('un movimento di pagamento nasce in attesa e passa dalla RPC Creator', async () => {
  const client = constrainedClient({}, { record_payment_adjustment: { id: 'adj-1' } });
  const repo = createSupabaseRepository({ client, cache: createLocalRepository({}) });

  await repo.recordPaymentAdjustment('ord-1', {
    type: 'supplement', amount: 5, status: 'pending', method: 'cash', note: 'Aggiunta pizza'
  });

  const call = client.calls.find(entry => entry.type === 'rpc');
  assert.equal(call.name, 'record_payment_adjustment');
  assert.deepEqual(call.args, {
    p_order_id: 'ord-1', p_adjustment_type: 'supplement', p_amount_cents: 500,
    p_status: 'pending', p_payment_method: 'cash', p_note: 'Aggiunta pizza'
  });
});

test('lo snapshot Creator espone i movimenti di pagamento correnti', async () => {
  const client = constrainedClient({
    products: [], public_opening_status: [], business_days: [], services: [], orders: [],
    current_order_items: [], current_order_item_changes: [], current_order_totals: [],
    current_payment_adjustments: [{
      id: 'adj-1', order_id: 'ord-1', adjustment_type: 'supplement',
      amount_cents: 500, status: 'pending', payment_method: 'cash', note: ''
    }]
  });
  const repo = createSupabaseRepository({ client, accessMode: 'creator' });

  const state = await repo.getState();

  assert.deepEqual(state.adjustments, [{
    id: 'adj-1', orderId: 'ord-1', type: 'supplement', amount: 5,
    status: 'pending', method: 'cash', note: ''
  }]);
});

test('il movimento cambia stato solo tramite la RPC Creator', async () => {
  const client = constrainedClient({}, { transition_payment_adjustment: { id: 'adj-1' } });
  const repo = createSupabaseRepository({ client, cache: createLocalRepository({}) });

  await repo.transitionPaymentAdjustment('adj-1', 'recorded');

  const call = client.calls.find(entry => entry.type === 'rpc');
  assert.equal(call.name, 'transition_payment_adjustment');
  assert.deepEqual(call.args, { p_adjustment_id: 'adj-1', p_target_status: 'recorded' });
});

test('il menu porta entrambe le lingue e le etichette allergeni tradotte', async () => {
  const client = constrainedClient({
    products: [{
      id: 'p1', slug: 'bufala', product_type: 'pizza', price_cents: 1100, available: true, sort_order: 1,
      product_translations: [
        { locale: 'it', name: 'Bufala', description: '' },
        { locale: 'en', name: 'Buffalo mozzarella', description: '' }
      ],
      product_ingredients: [{
        is_included: false, removable: false, can_add: true, max_quantity: 2, sort_order: 0,
        ingredients: {
          id: 'ing-1', slug: 'acciughe', additional_price_cents: 200,
          ingredient_translations: [{ locale: 'it', name: 'Acciughe' }, { locale: 'en', name: 'Anchovies' }]
        }
      }],
      product_allergens: [{ allergens: { id: 'a1', label_it: 'Pesce', label_en: 'Fish', eu_order: 4 } }]
    }],
    public_opening_status: []
  });
  const repo = createSupabaseRepository({ client, accessMode: 'anon' });

  const [product] = (await repo.getState()).menu;

  assert.deepEqual(product.names, { it: 'Bufala', en: 'Buffalo mozzarella' });
  assert.equal(product.name, 'Bufala');
  assert.deepEqual(product.allergenLabels, [{ it: 'Pesce', en: 'Fish' }]);
  assert.deepEqual(product.additions[0].names, { it: 'Acciughe', en: 'Anchovies' });
  assert.deepEqual(product.ingredientNames, []);
});

test('la creazione ordine restituisce la ricevuta con numero e giornata', async () => {
  const client = constrainedClient({}, {
    create_public_order: {
      order_id: 'ord-9', business_date: '2026-08-25', sequence: 3,
      status: 'preparing', gross_cents: 2100, fee_cents: 0, total_cents: 2100
    }
  });
  const repo = createSupabaseRepository({ client, cache: createLocalRepository({}) });

  const receipt = await repo.createOrder({
    source: 'WEB', serviceId: 'svc', customer: 'Anna', phone: '333', paymentMethod: 'cash', items: []
  });

  assert.deepEqual(receipt, {
    id: 'ord-9', businessDate: '2026-08-25', sequence: 3, status: 'preparing', gross: 21, fees: 0, total: 21
  });
});
