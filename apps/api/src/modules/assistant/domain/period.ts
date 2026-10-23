/**
 * Relative periods the server resolves, so the model does not do date arithmetic (US-AI-08,
 * requirements/07 section 3). Pure: it takes "today" as a YYYY-MM-DD string.
 */
export const PERIODS = [
  'today',
  'this_week',
  'last_week',
  'next_week',
  'this_month',
  'last_month',
  'next_month',
  'this_quarter',
  'last_quarter',
  'this_year',
  'last_year',
  'last_30_days',
  'next_30_days',
] as const;
export type Period = (typeof PERIODS)[number];

export interface DateRange {
  /** YYYY-MM-DD, inclusive. */
  from: string;
  to: string;
}

const MS_PER_DAY = 86_400_000;

const parse = (day: string) => {
  const [year, month, date] = day.split('-').map(Number) as [number, number, number];
  return { year, month, date };
};
const format = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const utc = (year: number, month: number, date: number) => Date.UTC(year, month - 1, date);

const addDays = (day: string, days: number) => {
  const { year, month, date } = parse(day);
  return format(utc(year, month, date) + days * MS_PER_DAY);
};

/** Monday of the week that contains `day` (weeks run Monday to Sunday, like cash_forecast). */
const mondayOf = (day: string) => {
  const { year, month, date } = parse(day);
  const weekday = new Date(utc(year, month, date)).getUTCDay(); // 0 = Sunday
  return addDays(day, -((weekday + 6) % 7));
};

/** First and last day of the month `offset` months from the one of `day` (Date.UTC rolls the year). */
const monthRange = (day: string, offset: number): DateRange => {
  const { year, month } = parse(day);
  return {
    from: format(utc(year, month + offset, 1)),
    to: format(utc(year, month + offset + 1, 0)),
  };
};

const quarterRange = (day: string, offset: number): DateRange => {
  const { year, month } = parse(day);
  const firstMonth = Math.floor((month - 1) / 3) * 3 + 1 + offset * 3;
  return {
    from: format(utc(year, firstMonth, 1)),
    to: format(utc(year, firstMonth + 3, 0)),
  };
};

const yearRange = (day: string, offset: number): DateRange => {
  const year = parse(day).year + offset;
  return {
    from: `${String(year).padStart(4, '0')}-01-01`,
    to: `${String(year).padStart(4, '0')}-12-31`,
  };
};

const weekRange = (day: string, offset: number): DateRange => {
  const monday = addDays(mondayOf(day), offset * 7);
  return { from: monday, to: addDays(monday, 6) };
};

/** The inclusive calendar range of a relative period; "last/next 30 days" count today as one. */
export function resolvePeriod(period: Period, today: string): DateRange {
  switch (period) {
    case 'today':
      return { from: today, to: today };
    case 'this_week':
      return weekRange(today, 0);
    case 'last_week':
      return weekRange(today, -1);
    case 'next_week':
      return weekRange(today, 1);
    case 'this_month':
      return monthRange(today, 0);
    case 'last_month':
      return monthRange(today, -1);
    case 'next_month':
      return monthRange(today, 1);
    case 'this_quarter':
      return quarterRange(today, 0);
    case 'last_quarter':
      return quarterRange(today, -1);
    case 'this_year':
      return yearRange(today, 0);
    case 'last_year':
      return yearRange(today, -1);
    case 'last_30_days':
      return { from: addDays(today, -29), to: today };
    case 'next_30_days':
      return { from: today, to: addDays(today, 29) };
  }
}

/**
 * Explicit dates win over a period: if the model gave `from` or `to`, the period is ignored
 * (it is not an error, so a small model that sends both still gets an answer).
 */
export function rangeFor(
  period: Period | undefined,
  explicit: { from?: string; to?: string },
  today: string,
): { from?: string; to?: string; period?: DateRange } {
  if (!period || explicit.from || explicit.to) return { from: explicit.from, to: explicit.to };
  const range = resolvePeriod(period, today);
  return { ...range, period: range };
}
