// Il ciclo di un ordine visto dalla sala.
//
// In pizzeria comanda chi sta al banco, non chi impasta: il pizzaiolo ha le
// mani sporche e guarda soltanto. L'ordine lo chiude il cameriere, e chiudendolo
// sparisce da tutte e due le schermate.
//
// Il database conosce due passaggi distinti, pronto e consegnato, e li registra
// entrambi: se un ordine viene chiuso mentre e' ancora in preparazione si fanno
// i due passi di fila invece di saltarne uno, cosi' lo storico resta vero.

const CHIUSURA = {
  received: ['ready', 'collected'],
  preparing: ['ready', 'collected'],
  ready: ['collected']
};

export function closingSteps(order = {}) {
  return CHIUSURA[order.status] ?? [];
}

export function workingOrders(orders = []) {
  return orders
    .filter(order => ['received', 'preparing', 'ready'].includes(order.status))
    .sort((left, right) => Number(left.readyAt ?? 0) - Number(right.readyAt ?? 0));
}
