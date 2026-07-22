// Istanbul / Turkey timezone (UTC+3)
const ISTANBUL_TZ = 'Europe/Istanbul';

export function nowIso() {
  return new Date().toISOString();
}

/** Returns today's date string (YYYY-MM-DD) in Istanbul timezone */
export function todayIstanbul(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: ISTANBUL_TZ }).format(new Date());
}

/**
 * Verilen Date'in saat/dakikasını process'in çalıştığı sunucu timezone'undan
 * bağımsız, her zaman Europe/Istanbul'a göre döndürür. Docker container'da
 * TZ ayarlanmamışsa (varsayılan UTC) date.getHours()/getMinutes() 3 saat
 * kayar — bu yüzden vardiya/gecikme gibi saat karşılaştırmalarında ham
 * getHours()/getMinutes() yerine bunu kullan.
 */
export function istanbulHourMinute(date: Date): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: ISTANBUL_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const hour = Number(parts.find(p => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find(p => p.type === 'minute')?.value ?? '0');
  return { hour, minute };
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
