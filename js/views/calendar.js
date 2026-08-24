const WEEKDAYS = [
  [1, 'Lunedì'],
  [2, 'Martedì'],
  [3, 'Mercoledì'],
  [4, 'Giovedì'],
  [5, 'Venerdì'],
  [6, 'Sabato'],
  [7, 'Domenica']
];

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
}

export function updateWeeklyClosure(calendar, weekday) {
  return { ...calendar, closedWeekdays: [Number(weekday)] };
}

export function addHoliday(calendar, holiday) {
  const exception = {
    from: holiday.from,
    to: holiday.to,
    closed: true,
    message: holiday.message?.trim() || 'Chiuso per ferie'
  };
  return { ...calendar, exceptions: [...(calendar.exceptions || []), exception] };
}

export function addExceptionalOpening(calendar, opening) {
  const exception = {
    date: opening.date,
    closed: false,
    message: opening.message?.trim() || 'Apertura straordinaria'
  };
  return { ...calendar, exceptions: [...(calendar.exceptions || []), exception] };
}

export function calendarPanel(calendar) {
  const closedWeekday = calendar.closedWeekdays?.[0] ?? 2;
  const exceptions = calendar.exceptions || [];
  return `<h1>Calendario</h1>
    <div class="calendar-layout">
      <section class="card"><span class="eyebrow">Chiusura ricorrente</span><h2>Riposo settimanale</h2><form id="weekly-closure-form"><div class="field"><label>Giorno<select name="weekday">${WEEKDAYS.map(([value, label]) => `<option value="${value}" ${value === closedWeekday ? 'selected' : ''}>${label}</option>`).join('')}</select></label></div><button class="btn primary" type="submit">Salva giorno</button></form></section>
      <section class="card"><span class="eyebrow">Periodo chiuso</span><h2>Aggiungi ferie</h2><form id="holiday-form"><div class="field"><label>Dal<input name="from" type="date" required></label></div><div class="field"><label>Al<input name="to" type="date" required></label></div><div class="field"><label>Motivo pubblico<input name="message" value="Chiuso per ferie" required></label></div><button class="btn primary" type="submit">Aggiungi ferie</button></form></section>
      <section class="card"><span class="eyebrow">Eccezione</span><h2>Apertura straordinaria</h2><form id="exceptional-opening-form"><div class="field"><label>Data<input name="date" type="date" required></label></div><div class="field"><label>Messaggio pubblico<input name="message" value="Apertura straordinaria" required></label></div><button class="btn primary" type="submit">Aggiungi apertura</button></form></section>
    </div>
    <section class="card calendar-exceptions"><h2>Eccezioni inserite</h2>${exceptions.length ? `<ul>${exceptions.map((exception, index) => `<li><span><b>${exception.closed ? 'Chiusura' : 'Apertura'}</b> · ${escapeHtml(exception.date || `${exception.from} → ${exception.to}`)}<br><small>${escapeHtml(exception.message)}</small></span><button class="btn secondary remove-calendar-exception" data-index="${index}">Rimuovi</button></li>`).join('')}</ul>` : '<p>Nessuna eccezione configurata.</p>'}</section>`;
}
