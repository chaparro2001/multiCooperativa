/** Local wall-clock formats of the HTML date inputs (never UTC: values are local dates). */
const pad = (n: number) => String(n).padStart(2, '0');

export function toInputValue(date: Date, mode: 'date' | 'datetime'): string {
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return mode === 'date' ? day : `${day}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Null if the input is empty or incomplete. */
export function fromInputValue(value: string, mode: 'date' | 'datetime'): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(value);
  if (!match) return null;
  const [, year, month, day, hours, minutes] = match;
  if (mode === 'datetime' && hours === undefined) return null;
  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    mode === 'datetime' ? Number(hours) : 0,
    mode === 'datetime' ? Number(minutes) : 0,
  );
}
