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

  function emit(entity, action, value) {
    const event = copy({ entity, action, value });
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
      emit('menu', 'saved', saved);
      return copy(saved);
    },

    async replaceMenu(menu) {
      state.menu = copy(menu);
      persist();
      return copy(state.menu);
    },

    async openService(service) {
      const opened = { ...copy(service), status: 'open' };
      state.services[opened.id] = opened;
      persist();
      emit('service', 'opened', opened);
      return copy(opened);
    },

    async closeService(serviceOrId) {
      const id = typeof serviceOrId === 'object' ? serviceOrId.id : serviceOrId;
      const closed = { ...state.services[id], status: 'closed' };
      state.services[id] = closed;
      persist();
      emit('service', 'closed', closed);
      return copy(closed);
    },

    async createOrder(order) {
      const created = { revision: 1, status: 'preparing', ...copy(order) };
      state.orders.push(created);
      persist();
      emit('order', 'created', created);
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
      emit('order', 'revised', revised);
      return copy(revised);
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
