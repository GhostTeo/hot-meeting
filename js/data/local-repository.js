import { calendarFromClosures, closureRowFromException, weeklyClosureRow } from '../closures.js';

function copy(value) {
  return structuredClone(value);
}

export function createLocalRepository({ initialState = {}, storage, storageKey = 'hm-repository-cache' } = {}) {
  let stored = null;
  let restored = initialState;
  try {
    stored = storage?.getItem(storageKey);
    if (stored) restored = JSON.parse(stored);
  } catch {
    // An unavailable browser storage must not make the local adapter unusable.
  }
  const state = copy({ menu: [], services: {}, orders: [], ...restored });
  const listeners = new Set();

  function persist() {
    try {
      storage?.setItem(storageKey, JSON.stringify(state));
    } catch {
      // In-memory behavior remains available when storage is full or blocked.
    }
  }

  function openServiceEntry() {
    return Object.values(state.services).find(service => service?.status === 'open') ?? null;
  }

  function snapshot() {
    const open = openServiceEntry();
    // Come repository primario la verita' sono le righe closures; come cache di
    // uno snapshot remoto il calendario e' gia' mappato e va conservato.
    const calendar = Array.isArray(state.closures)
      ? calendarFromClosures(state.closures)
      : (state.calendar ?? { closedWeekdays: [], exceptions: [] });
    return copy({
      ...state, calendar, adjustments: state.adjustments ?? [],
      shift: open?.shift ?? null, online: open?.online ?? false,
      ovenDefaults: state.ovenDefaults ?? null
    });
  }

  function closureRows() {
    if (!Array.isArray(state.closures)) state.closures = [];
    return state.closures;
  }

  function newId() {
    return globalThis.crypto.randomUUID();
  }

  function emit(scope) {
    const event = { type: 'repository.changed', scope };
    for (const listener of listeners) listener(event);
  }

  return {
    async getMenu() {
      return copy(state.menu);
    },

    async saveProduct(product) {
      const index = state.menu.findIndex(candidate => candidate.id === product.id);
      if (index === -1) state.menu.push(copy(product));
      else state.menu[index] = { ...state.menu[index], ...copy(product) };
      const saved = state.menu[index === -1 ? state.menu.length - 1 : index];
      persist();
      emit('menu');
      return copy(saved);
    },

    async saveIngredient(ingredient) {
      state.ingredients = state.ingredients ?? [];
      const index = state.ingredients.findIndex(entry => entry.id === ingredient.id || entry.name?.toLowerCase() === String(ingredient.name).toLowerCase());
      if (index === -1) state.ingredients.push(copy(ingredient));
      else state.ingredients[index] = { ...state.ingredients[index], ...copy(ingredient) };
      persist();
      emit('menu');
      return copy(index === -1 ? state.ingredients[state.ingredients.length - 1] : state.ingredients[index]);
    },

    async setWeekly(product, weekly) {
      const entry = state.menu.find(candidate => candidate.id === product.id || candidate.databaseId === product.databaseId);
      if (!entry) throw new Error(`Prodotto ${product.id} non trovato`);
      entry.weekly = Boolean(weekly);
      persist();
      emit('menu');
      return copy(entry);
    },

    async replaceMenu(menu) {
      state.menu = copy(menu);
      persist();
      return copy(state.menu);
    },

    async replaceState(snapshot) {
      Object.assign(state, copy(snapshot));
      persist();
      return copy(state);
    },

    async getState() {
      return snapshot();
    },

    async saveWeeklyClosure(weekday) {
      const row = { id: newId(), ...weeklyClosureRow(weekday) };
      state.closures = [...closureRows().filter(entry => entry.closure_type !== 'weekly'), row];
      persist();
      emit('calendar');
      return copy(row);
    },

    async addClosureException(exception) {
      const row = { id: newId(), ...closureRowFromException(exception) };
      state.closures = [...closureRows(), row];
      persist();
      emit('calendar');
      return copy(row);
    },

    async removeClosureException(id) {
      state.closures = closureRows().filter(entry => entry.id !== id);
      persist();
      emit('calendar');
    },

    async getOrderProgress(orderId) {
      const order = (state.orders ?? []).find(entry => String(entry.id) === String(orderId));
      if (!order) return null;
      const restano = order.readyAt ? Math.max(0, Math.ceil((order.readyAt - Date.now()) / 60000)) : 0;
      const promessi = order.readyAt && order.createdAt
        ? Math.round((order.readyAt - order.createdAt) / 60000)
        : 0;
      return { status: order.status, sequence: order.sequence, minutesLeft: restano, promisedMinutes: promessi };
    },

    async setOvenDefaults(oven) {
      state.ovenDefaults = { slots: Number(oven.slots), bakeMinutes: Number(oven.bakeMinutes), bufferMinutes: Number(oven.bufferMinutes) };
      const open = openServiceEntry();
      if (open) open.oven = { ...state.ovenDefaults };
      persist();
      emit('services');
      return copy(state.ovenDefaults);
    },

    async setServiceOven(serviceId, oven) {
      const entry = Object.values(state.services).find(service => service?.id === serviceId);
      if (!entry) throw new Error(`Servizio ${serviceId} non trovato`);
      entry.oven = { slots: Number(oven.slots), bakeMinutes: Number(oven.bakeMinutes), bufferMinutes: Number(oven.bufferMinutes) };
      persist();
      emit('services');
      return copy(entry);
    },

    async setProductPhoto(productId, imageUrl) {
      // Rispecchia set_product_photo: la foto e' un dato a se', si cambia
      // senza toccare prezzo o ingredienti, e vuota vuol dire nessuna foto.
      const product = state.menu.find(entry => entry.id === productId || entry.databaseId === productId);
      if (!product) throw new Error(`Prodotto ${productId} non trovato`);
      product.imageUrl = String(imageUrl ?? '').trim() || null;
      persist();
      emit('menu');
      return product.imageUrl;
    },

    async saveMenuProduct(payload) {
      // Rispecchia la RPC: stesso payload, stesso risultato letto dal menu.
      const id = payload.product_id ?? newId();
      const it = payload.translations?.it ?? {};
      const en = payload.translations?.en;
      const rows = payload.ingredients ?? [];
      const product = {
        id,
        databaseId: id,
        type: payload.product_type ?? 'pizza',
        name: it.name ?? '',
        names: en?.name ? { it: it.name, en: en.name } : { it: it.name },
        price: Number(payload.price_cents ?? 0) / 100,
        available: payload.available !== false,
        sortOrder: Number(payload.sort_order ?? 0),
        ingredients: rows.filter(row => row.included).map(row => row.name_it),
        ingredientNames: rows.filter(row => row.included)
          .map(row => (row.name_en ? { it: row.name_it, en: row.name_en } : { it: row.name_it })),
        additions: rows.filter(row => row.can_add ?? !row.included).map(row => ({
          id: row.name_it,
          name: row.name_it,
          names: row.name_en ? { it: row.name_it, en: row.name_en } : { it: row.name_it },
          price: Number(row.addition_price_cents ?? 0) / 100,
          maxQuantity: Number(row.max_quantity ?? 1)
        })),
        allergenIds: [...(payload.allergen_ids ?? [])]
      };
      const index = state.menu.findIndex(entry => entry.id === id);
      // La foto non fa parte di questo payload: rifare il prodotto da capo non
      // deve cancellarla.
      if (index === -1) state.menu.push(product);
      else state.menu[index] = { ...product, imageUrl: state.menu[index].imageUrl ?? null, weekly: state.menu[index].weekly ?? false };
      persist();
      emit('menu');
      return id;
    },

    async deleteMenuProduct(productId) {
      const before = state.menu.length;
      state.menu = state.menu.filter(entry => entry.id !== productId);
      if (state.menu.length === before) throw new Error(`Prodotto ${productId} non trovato`);
      persist();
      emit('menu');
      return 'deleted';
    },

    async recordPaymentAdjustment(orderId, adjustment) {
      // Il pagamento originale dell'ordine non viene mai toccato: la differenza
      // vive come movimento separato, in attesa finche' non viene registrata.
      const movement = {
        id: newId(),
        orderId,
        type: adjustment.type,
        amount: Number(adjustment.amount || 0),
        status: adjustment.status ?? 'pending',
        method: adjustment.method ?? null,
        note: adjustment.note ?? ''
      };
      state.adjustments = [...(state.adjustments ?? []), movement];
      persist();
      emit('orders');
      return copy(movement);
    },

    async transitionPaymentAdjustment(adjustmentId, status) {
      const movement = (state.adjustments ?? []).find(entry => entry.id === adjustmentId);
      if (!movement) throw new Error(`Movimento ${adjustmentId} non trovato`);
      if (movement.status !== 'pending') throw new Error('Un movimento gia concluso non cambia piu stato');
      movement.status = status;
      persist();
      emit('orders');
      return copy(movement);
    },

    async openService(service) {
      const opened = { ...copy(service), status: 'open' };
      state.services[opened.shift ?? opened.id] = opened;
      if (opened.businessDate) {
        state.activeDay = { id: opened.businessDayId ?? null, date: opened.businessDate, status: 'open' };
      }
      persist();
      emit('services');
      return copy(opened);
    },

    async closeService(serviceOrId) {
      const id = typeof serviceOrId === 'object' ? serviceOrId.id : serviceOrId;
      const entry = Object.entries(state.services).find(([, service]) => service?.id === id);
      if (!entry) throw new Error(`Servizio ${id} non trovato`);
      const [key, service] = entry;
      const closed = { ...service, status: 'closed' };
      state.services[key] = closed;
      persist();
      emit('services');
      return copy(closed);
    },

    async setServiceOnline(serviceId, enabled) {
      const service = state.services[serviceId] ?? Object.values(state.services).find(candidate => candidate?.id === serviceId);
      if (!service) throw new Error(`Servizio ${serviceId} non trovato`);
      service.online = enabled;
      persist();
      emit('services');
      return copy(service);
    },

    async createOrder(order) {
      const created = { revision: 1, status: 'preparing', ...copy(order) };
      state.orders.push(created);
      persist();
      emit('orders');
      return copy(created);
    },

    async reviseOrder(orderId, revision) {
      const index = state.orders.findIndex(order => String(order.id) === String(orderId));
      if (index === -1) throw new Error(`Ordine ${orderId} non trovato`);
      const revised = {
        ...state.orders[index],
        ...copy(revision),
        revision: (state.orders[index].revision ?? 1) + 1
      };
      state.orders[index] = revised;
      persist();
      emit('orders');
      return copy(revised);
    },

    async updateOrderStatus(orderId, status) {
      const order = state.orders.find(candidate => String(candidate.id) === String(orderId));
      if (!order) throw new Error(`Ordine ${orderId} non trovato`);
      order.status = status;
      persist();
      emit('orders');
      return copy(order);
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    getSnapshot() {
      return snapshot();
    }
  };
}
