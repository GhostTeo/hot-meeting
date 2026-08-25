// Traduzione fra le righe della tabella closures e la forma del calendario
// usata dalla UI e da resolveClosure. L'apertura straordinaria resta una data
// esatta perche' deve prevalere su un intervallo di ferie che la contiene.

export function calendarFromClosures(rows = []) {
  const closedWeekdays = rows
    .filter(row => row.closure_type === 'weekly')
    .map(row => Number(row.weekday))
    .filter(Number.isInteger);

  const exceptions = rows
    .filter(row => row.closure_type === 'holiday' || row.closure_type === 'exceptional_opening')
    .map(row => {
      const base = { id: row.id ?? null, message: row.public_message ?? '' };
      return row.closure_type === 'exceptional_opening'
        ? { ...base, date: row.starts_on, closed: false }
        : { ...base, from: row.starts_on, to: row.ends_on, closed: true };
    })
    .map(exception => reorderException(exception));

  return { closedWeekdays, exceptions };
}

function reorderException({ id, message, ...rest }) {
  return 'date' in rest
    ? { id, date: rest.date, closed: rest.closed, message }
    : { id, from: rest.from, to: rest.to, closed: rest.closed, message };
}

export function weeklyClosureRow(weekday) {
  return {
    closure_type: 'weekly',
    weekday: Number(weekday),
    starts_on: null,
    ends_on: null,
    public_message: 'Chiuso per riposo settimanale',
    enabled: true
  };
}

export function closureRowFromException(exception = {}) {
  const opening = exception.closed === false;
  const from = exception.date ?? exception.from;
  const to = exception.date ?? exception.to;
  return {
    closure_type: opening ? 'exceptional_opening' : 'holiday',
    weekday: null,
    starts_on: from,
    ends_on: to,
    public_message: exception.message ?? '',
    enabled: true
  };
}
