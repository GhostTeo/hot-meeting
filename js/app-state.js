export function applyRepositorySnapshot(state, snapshot) {
  return {
    ...state,
    menu: snapshot.menu,
    services: snapshot.services,
    activeDay: snapshot.activeDay,
    shift: snapshot.shift,
    online: snapshot.online,
    orders: snapshot.orders
  };
}

export async function hydrateApplicationState(state, repository) {
  return applyRepositorySnapshot(state, await repository.getState());
}
