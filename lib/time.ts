// Istanbul / Turkey timezone (UTC+3)
const ISTANBUL_TZ = 'Europe/Istanbul';

export function nowIso() {
  return new Date().toISOString();
}

/** Returns today's date string (YYYY-MM-DD) in Istanbul timezone */
export function todayIstanbul(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: ISTANBUL_TZ }).format(new Date());
}

export function addHours(date: Date, hours: number) {
  const next = new Date(date);
  next.setHours(next.getHours() + hours);
  return next;
}

export function addMinutes(date: Date, minutes: number) {
  const next = new Date(date);
  next.setMinutes(next.getMinutes() + minutes);
  return next;
}
