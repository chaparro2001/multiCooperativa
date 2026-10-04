const DAY = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
const DAY_TIME = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** «15 de marzo de 2026» from an ISO date or day (AAAA-MM-DD, read as a calendar day). */
export function formatDay(value: string): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
  return DAY.format(date);
}

export function formatDateTime(iso: string): string {
  return DAY_TIME.format(new Date(iso));
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

/** Today as AAAA-MM-DD in the device's time zone (default date of a new document). */
export function today(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** «AAAA-MM-DD HH:MM» in the device's time zone, for editing a date and time as text. */
export function toLocalInput(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${today(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Back to an ISO instant; null if the text is not a valid date and time. */
export function fromLocalInput(text: string): string | null {
  const match = text.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, y, m, d, h, min] = match.map(Number) as [number, number, number, number, number, number];
  const date = new Date(y, m - 1, d, h, min);
  const roundTrip =
    date.getFullYear() === y &&
    date.getMonth() === m - 1 &&
    date.getDate() === d &&
    date.getHours() === h;
  return roundTrip ? date.toISOString() : null;
}
