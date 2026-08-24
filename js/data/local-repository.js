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
      return copy(state);
    },

    async openService(service) {
      const opened = { ...copy(service), status: 'open' };
      state.services[opened.shift ?? opened.id] = opened;
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
      return copy(state);
    }
  };
}
