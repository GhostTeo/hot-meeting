import { paymentLabel } from '../domain.js';
import { calendarFromClosures, closureRowFromException, weeklyClosureRow } from '../closures.js';
const MENU_SELECT = `
  id, slug, product_type, price_cents, available, sort_order,
  product_translations(locale, name, description),
  product_ingredients(is_included, removable, can_add, max_quantity, sort_order,
    ingredients(id, slug, additional_price_cents, ingredient_translations(locale, name))),
  product_allergens(allergens(id, label_it, label_en, eu_order))
`;

function italianName(translations = [], fallback = '') {
  return translations.find(translation => translation.locale === 'it')?.name ?? fallback;
}

function mapProduct(row) {
  const relations = row.product_ingredients ?? [];
  const included = relations.filter(relation => relation.is_included);
  return {
    id: row.slug,
    databaseId: row.id,
    type: row.product_type,
    name: italianName(row.product_translations, row.slug),
    price: row.price_cents / 100,
    available: row.available,
    ingredients: included
      .sort((left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0))
      .map(relation => italianName(relation.ingredients?.ingredient_translations, relation.ingredients?.slug)),
    additions: relations
      .filter(relation => relation.can_add)
      .sort((left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0))
      .map(relation => ({
        id: relation.ingredients?.id,
        name: italianName(relation.ingredients?.ingredient_translations, relation.ingredients?.slug),
        price: relation.ingredients?.additional_price_cents / 100,
        maxQuantity: relation.max_quantity
      })),
    allergens: (row.product_allergens ?? [])
      .map(relation => relation.allergens)
      .filter(Boolean)
      .sort((left, right) => (left.eu_order ?? 0) - (right.eu_order ?? 0))
      .map(allergen => allergen.label_it),
    ingredientIds: Object.fromEntries(included.map(relation => [
      italianName(relation.ingredients?.ingredient_translations, relation.ingredients?.slug),
      relation.ingredients?.id
    ]))
  };
}

function throwIfError(result) {
  if (result.error) throw result.error;
  return result.data;
}

function millis(value) {
  return value ? new Date(value).getTime() : null;
}

function mapService(row) {
  const id = row.service_id ?? row.id;
  const openedAt = millis(row.opened_at);
  return {
    id,
    databaseId: id,
    businessDayId: row.business_day_id,
    businessDate: row.business_date,
    shift: row.shift,
    status: row.status,
    online: row.online_orders_enabled,
    capacity: row.capacity_pizzas_hour ?? 90,
    openedAt,
    closedAt: millis(row.closed_at),
    sessions: openedAt ? [{ openedAt, closedAt: millis(row.closed_at) }] : []
  };
}

function mapServiceReceipt(row) {
  return mapService({
    id: row.service_id,
    business_day_id: row.business_day_id,
    business_date: row.business_date,
    shift: row.shift,
    status: row.status,
    online_orders_enabled: row.online_orders_enabled,
    capacity_pizzas_hour: row.capacity_pizzas_hour,
    opened_at: row.opened_at,
    closed_at: row.closed_at
  });
}

function composeOrders(rows, itemRows, changeRows, totalRows, serviceById) {
  const changesByItem = new Map();
  for (const change of changeRows) {
    const list = changesByItem.get(change.order_item_id) ?? [];
    list.push(change);
    changesByItem.set(change.order_item_id, list);
  }
  const itemsByOrder = new Map();
  for (const item of itemRows) {
    const changes = changesByItem.get(item.id) ?? [];
    const mapped = {
      id: item.id,
      productId: item.product_id,
      name: item.product_name_snapshot,
      quantity: item.quantity,
      unitPrice: (item.unit_price_cents ?? 0) / 100,
      price: item.total_price_cents / 100,
      note: item.note,
      allergens: item.allergens_snapshot ?? [],
      removed: changes.filter(change => change.change_type === 'removed').map(change => change.ingredient_name_snapshot),
      // Gli identificativi servono a ricostruire la stessa riga in una revisione.
      removedIngredientIds: changes.filter(change => change.change_type === 'removed').map(change => change.ingredient_id),
      additions: changes.filter(change => change.change_type === 'addition').map(change => ({
        id: change.ingredient_id,
        name: change.ingredient_name_snapshot,
        price: change.unit_price_cents / 100,
        quantity: change.quantity
      }))
    };
    const list = itemsByOrder.get(item.order_id) ?? [];
    list.push(mapped);
    itemsByOrder.set(item.order_id, list);
  }
  const totals = new Map(totalRows.map(total => [total.order_id, total]));
  return rows.map(row => {
    const total = totals.get(row.id);
    return {
      id: row.id,
      sequence: row.sequence,
      businessDayId: row.business_day_id,
      serviceId: row.service_id,
      source: row.source.toUpperCase(),
      customer: row.customer_name,
      phone: row.customer_phone,
      paymentMethod: row.payment_method,
      payment: paymentLabel(row.payment_method),
      status: row.status,
      shift: serviceById.get(row.service_id)?.shift,
      businessDate: serviceById.get(row.service_id)?.businessDate,
      createdAt: millis(row.created_at),
      readyAt: millis(row.eta_ready_at),
      total: (total?.total_cents ?? row.total_cents) / 100,
      gross: (total?.gross_cents ?? row.gross_cents) / 100,
      fee: (total?.fee_cents ?? row.fee_cents) / 100,
      fees: (total?.fee_cents ?? row.fee_cents) / 100,
      revision: total?.revision ?? 1,
      items: itemsByOrder.get(row.id) ?? []
    };
  });
}

function mapAdjustment(row) {
  return {
    id: row.id,
    orderId: row.order_id,
    type: row.adjustment_type,
    amount: (row.amount_cents ?? 0) / 100,
    status: row.status,
    method: row.payment_method,
    note: row.note ?? ''
  };
}

function normalizeOrderItem(item) {
  const changes = item.changes ?? [
    ...(item.removed ?? []).map(name => ({
      type: 'removed', ingredient_id: item.ingredientIds?.[name], quantity: 1
    })),
    ...(item.additions ?? []).filter(addition => addition.quantity > 0).map(addition => ({
      type: 'addition', ingredient_id: addition.id, quantity: addition.quantity
    }))
  ];
  return {
    product_id: item.product_id ?? item.productId ?? item.databaseId,
    quantity: item.quantity ?? 1,
    note: item.note ?? '',
    changes: changes.map(change => ({
      type: change.type,
      ingredient_id: change.ingredient_id ?? change.ingredientId,
      quantity: change.quantity ?? 1
    }))
  };
}

function orderPayload(order, includeRequestToken) {
  const customer = typeof order.customer === 'string'
    ? { name: order.customer, phone: order.phone, email: order.email }
    : order.customer;
  const payload = {
    service_id: order.serviceId,
    customer,
    payment_method: order.paymentMethod,
    items: order.items.map(normalizeOrderItem)
  };
  if (includeRequestToken) payload.request_token = order.requestToken;
  return payload;
}

function compareDescending(left, right, key) {
  return String(right[key] ?? '').localeCompare(String(left[key] ?? ''));
}

function selectOperationalDay(rows) {
  const sorted = [...rows].sort((left, right) => compareDescending(left, right, 'business_date'));
  return sorted.find(day => day.status === 'open')
    ?? sorted.find(day => day.status === 'closed')
    ?? null;
}

function accessModeValue(accessMode) {
  const value = typeof accessMode === 'function' ? accessMode() : accessMode;
  return value === 'anon' ? 'anon' : 'creator';
}

function orderedQuery(client, table, columns, orderBy, ascending = true) {
  return client.from(table).select(columns).order(orderBy, { ascending });
}

export function createSupabaseRepository({ client, cache, accessMode = 'creator' } = {}) {
  if (!client) throw new TypeError('Un client Supabase pubblico è obbligatorio');

  return {
    async getMenu() {
      const result = await client.from('products').select(MENU_SELECT);
      if (result.error) {
        if (cache) return cache.getMenu();
        throw result.error;
      }
      const menu = result.data.map(mapProduct);
      await cache?.replaceMenu(menu);
      return menu;
    },

    async saveWeeklyClosure(weekday) {
      const removal = await client.from('closures').delete().eq('closure_type', 'weekly');
      if (removal?.error) throw removal.error;
      const { error } = await client.from('closures').insert(weeklyClosureRow(weekday));
      if (error) throw error;
    },

    async addClosureException(exception) {
      const { error } = await client.from('closures').insert(closureRowFromException(exception));
      if (error) throw error;
    },

    async removeClosureException(id) {
      const { error } = await client.from('closures').delete().eq('id', id);
      if (error) throw error;
    },

    async getState() {
      const publicResults = await Promise.all([
        orderedQuery(client, 'products', MENU_SELECT, 'sort_order'),
        orderedQuery(client, 'public_opening_status', '*', 'business_date', false),
        orderedQuery(client, 'public_closure_calendar', '*', 'closure_type')
      ]);
      const publicFailure = publicResults.find(result => result.error);
      if (publicFailure) throw publicFailure.error;
      const [productRows, publicServices, publicClosures] = publicResults.map(result => result.data);

      let dayRows = [];
      let creatorServices = [];
      let orderRows = [];
      let itemRows = [];
      let changeRows = [];
      let totalRows = [];
      let closureRows = null;
      let adjustmentRows = [];
      if (accessModeValue(accessMode) === 'creator') {
        const operationalResults = await Promise.all([
          orderedQuery(client, 'business_days', '*', 'business_date', false),
          orderedQuery(client, 'services', '*', 'opened_at', false),
          orderedQuery(client, 'orders', '*', 'created_at', false),
          orderedQuery(client, 'current_order_items', '*', 'sort_order'),
          orderedQuery(client, 'current_order_item_changes', '*', 'created_at'),
          orderedQuery(client, 'current_order_totals', '*', 'created_at'),
          orderedQuery(client, 'closures', '*', 'created_at'),
          orderedQuery(client, 'current_payment_adjustments', '*', 'created_at')
        ]);
        const operationalFailure = operationalResults.find(result => result.error);
        if (operationalFailure) throw operationalFailure.error;
        [dayRows, creatorServices, orderRows, itemRows, changeRows, totalRows, closureRows, adjustmentRows] = operationalResults.map(result => result.data);
      }

      const menu = productRows.map(mapProduct);
      const selectedServices = creatorServices.length ? creatorServices : publicServices;
      const mappedServices = selectedServices
        .map(mapService)
        .sort((left, right) => (right.openedAt ?? 0) - (left.openedAt ?? 0));
      const serviceById = new Map(mappedServices.map(service => [service.id, service]));
      const day = selectOperationalDay(dayRows);
      const publicDate = [...publicServices]
        .sort((left, right) => compareDescending(left, right, 'business_date'))[0]?.business_date;
      const activeDay = day
        ? { id: day.id, date: day.business_date, status: day.status }
        : publicDate ? { id: null, date: publicDate, status: 'open' } : null;
      const activeDayServices = mappedServices.filter(service => activeDay && (
        activeDay.id ? service.businessDayId === activeDay.id : service.businessDate === activeDay.date
      ));
      const services = {};
      for (const service of activeDayServices) {
        if (!services[service.shift]) services[service.shift] = service;
      }
      for (const service of Object.values(services)) {
        if (!service.businessDate) service.businessDate = activeDay?.date;
        if (!service.businessDayId) service.businessDayId = activeDay?.id;
      }
      const activeService = activeDayServices.find(service => service.status === 'open') ?? null;
      const snapshot = {
        menu,
        calendar: calendarFromClosures(closureRows ?? publicClosures),
        services,
        activeDay,
        shift: activeService?.shift ?? null,
        online: activeService?.online ?? false,
        orders: composeOrders(orderRows, itemRows, changeRows, totalRows, serviceById),
        adjustments: adjustmentRows.map(mapAdjustment)
      };
      await cache?.replaceState(snapshot);
      return snapshot;
    },

    async saveProduct(product) {
      if (!product.databaseId) throw new TypeError('Il prodotto remoto richiede un UUID databaseId');
      const result = await client.rpc('save_product', {
        p_product_id: product.databaseId,
        p_price_cents: product.price === undefined ? null : Math.round(product.price * 100),
        p_available: product.available ?? null
      });
      const row = throwIfError(result);
      const saved = {
        ...product,
        id: row.slug ?? product.id,
        databaseId: row.id ?? product.databaseId,
        price: row.price_cents === undefined ? product.price : row.price_cents / 100,
        available: row.available ?? product.available
      };
      await cache?.saveProduct({ ...product, ...saved });
      return saved;
    },

    async openService(service) {
      const reopening = service.action === 'reopen';
      const result = reopening
        ? await client.rpc('reopen_service', {
            p_service_id: service.databaseId ?? service.id,
            p_online_orders_enabled: service.online ?? true
          })
        : await client.rpc('open_service', {
            p_business_date: service.businessDate,
            p_shift: service.shift,
            p_online_orders_enabled: service.online ?? true,
            p_capacity_pizzas_hour: service.capacity ?? 90
          });
      return mapServiceReceipt(throwIfError(result));
    },

    async closeService(serviceOrId, { closeBusinessDay = false } = {}) {
      const id = typeof serviceOrId === 'object' ? serviceOrId.id : serviceOrId;
      const result = await client.rpc('close_service', {
        p_service_id: id,
        p_close_business_day: closeBusinessDay
      });
      return mapServiceReceipt(throwIfError(result));
    },

    async setServiceOnline(serviceId, enabled) {
      const result = await client.rpc('set_service_online', {
        p_service_id: serviceId,
        p_enabled: enabled
      });
      return mapServiceReceipt(throwIfError(result));
    },

    async createOrder(order) {
      const publicOrder = String(order.source ?? 'WEB').toUpperCase() === 'WEB';
      const result = await client.rpc(
        publicOrder ? 'create_public_order' : 'create_restaurant_order',
        { payload: orderPayload(order, publicOrder) }
      );
      return throwIfError(result);
    },

    async reviseOrder(orderId, revision) {
      const result = await client.rpc('revise_order', {
        p_order_id: orderId,
        p_items: revision.items,
        p_reason: revision.reason
      });
      return throwIfError(result);
    },

    async recordPaymentAdjustment(orderId, adjustment) {
      const result = await client.rpc('record_payment_adjustment', {
        p_order_id: orderId,
        p_adjustment_type: adjustment.type,
        p_amount_cents: Math.round(Number(adjustment.amount || 0) * 100),
        p_status: adjustment.status ?? 'pending',
        p_payment_method: adjustment.method ?? null,
        p_note: adjustment.note ?? ''
      });
      return throwIfError(result);
    },

    async updateOrderStatus(orderId, status) {
      const result = await client.rpc('transition_order_status', {
        p_order_id: orderId,
        p_target_status: status
      });
      return throwIfError(result);
    },

    subscribe(listener) {
      const channel = client.channel('hot-meeting-repository');
      const scopes = {
        products: 'menu', product_translations: 'menu', ingredients: 'menu',
        product_ingredients: 'menu', product_allergens: 'menu',
        business_days: 'services', services: 'services', service_sessions: 'services',
        orders: 'orders', order_items: 'orders', order_item_changes: 'orders', order_revisions: 'orders',
        closures: 'calendar'
      };
      for (const [table, scope] of Object.entries(scopes)) {
        channel.on('postgres_changes', { event: '*', schema: 'public', table }, payload => {
          listener({ type: 'repository.changed', scope });
        });
      }
      channel.subscribe();
      return () => client.removeChannel(channel);
    }
  };
}

export { mapProduct };
