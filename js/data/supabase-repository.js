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

export function createSupabaseRepository({ client, cache } = {}) {
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

    async saveProduct(product) {
      const values = {};
      if (product.price !== undefined) values.price_cents = Math.round(product.price * 100);
      if (product.available !== undefined) values.available = product.available;
      const identifier = product.databaseId ?? product.id;
      const column = product.databaseId ? 'id' : 'slug';
      const result = await client.from('products').update(values).eq(column, identifier).select().single();
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
      const openedAt = service.sessions?.at(-1)?.openedAt ?? service.openedAt ?? Date.now();
      const result = await client.from('services').upsert({
        id: service.id,
        business_day_id: service.businessDayId ?? service.business_day_id,
        shift: service.shift,
        status: 'open',
        online_orders_enabled: service.online ?? service.online_orders_enabled ?? true,
        capacity_pizzas_hour: service.capacity ?? service.capacity_pizzas_hour ?? 90,
        opened_at: new Date(openedAt).toISOString(),
        closed_at: null
      }).select().single();
      return throwIfError(result);
    },

    async closeService(serviceOrId) {
      const id = typeof serviceOrId === 'object' ? serviceOrId.id : serviceOrId;
      const result = await client.from('services').update({
        status: 'closed',
        online_orders_enabled: false,
        closed_at: new Date().toISOString()
      }).eq('id', id).select().single();
      return throwIfError(result);
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

    subscribe(listener) {
      const channel = client.channel('hot-meeting-repository');
      for (const table of ['products', 'services', 'orders', 'order_items', 'order_revisions']) {
        channel.on('postgres_changes', { event: '*', schema: 'public', table }, payload => {
          listener({ entity: table, action: payload.eventType, value: payload.new, previous: payload.old });
        });
      }
      channel.subscribe();
      return () => client.removeChannel(channel);
    }
  };
}

export { mapProduct };
