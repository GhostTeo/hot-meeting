export function applyRepositorySnapshot(state, snapshot) {
  return {
    ...state,
    menu: snapshot.menu,
    allergens: snapshot.allergens ?? state.allergens ?? [],
    calendar: snapshot.calendar ?? state.calendar,
    services: snapshot.services,
    activeDay: snapshot.activeDay,
    shift: snapshot.shift,
    online: snapshot.online,
    orders: snapshot.orders,
    pizzasQueued: snapshot.pizzasQueued ?? null,
    ovenDefaults: snapshot.ovenDefaults ?? state.ovenDefaults ?? null,
    adjustments: snapshot.adjustments ?? []
  };
}

export async function hydrateApplicationState(state, repository) {
  return applyRepositorySnapshot(state, await repository.getState());
}

export function createRepositoryRefreshCoordinator({ repository, apply, onError = () => {} }) {
  let generation = 0;
  let scheduled = null;
  let running = false;
  let rerun = false;

  async function refresh() {
    const requestGeneration = ++generation;
    try {
      const snapshot = await repository.getState();
      if (requestGeneration === generation) await apply(snapshot);
      return snapshot;
    } catch (error) {
      if (requestGeneration === generation) onError(error);
      throw error;
    }
  }

  function schedule() {
    if (scheduled) {
      if (running) rerun = true;
      return scheduled;
    }
    scheduled = Promise.resolve().then(async () => {
      running = true;
      let snapshot;
      do {
        rerun = false;
        try {
          snapshot = await refresh();
        } catch {
          // Realtime retries are driven by the next semantic event.
        }
      } while (rerun);
      running = false;
      scheduled = null;
      return snapshot;
    });
    return scheduled;
  }

  return { refresh, schedule };
}
