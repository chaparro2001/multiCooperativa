import { addDays, type Day, type Operation } from './documents';

/**
 * Pure rules behind the assistant's analytic reads (requirements/07, section 3): concept
 * normalization, grouping of item quantities, due-date buckets and ages. Money and quantities
 * stay as bigint (BR-INV-13); nothing here touches the database.
 */

/** “Aceite  de OLIVA ” and “aceite de oliva” are the same concept; accents do not count. */
export const normalizeConcept = (text: string): string =>
  text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

// ── Items (top_items) ──

export interface ItemLine {
  date: Day;
  concept: string;
  unit: string;
  /** Thousandths. */
  quantity: bigint;
}

export interface ItemTotal {
  /** The spelling most used for the concept (ties: the first alphabetically). */
  concept: string;
  unit: string;
  /** Thousandths. */
  quantity: bigint;
  /** Lines that were added up. */
  lines: number;
  /** YYYY-MM, only when grouped by month. */
  period?: string;
}

export interface ItemRanking {
  rows: ItemTotal[];
  /** How many different items (concept and unit) matched, before the limit. */
  total: number;
  truncated: boolean;
}

/** Most common original spelling; a tie goes to the alphabetically first one (stable). */
function mostCommon(spellings: Map<string, number>): string {
  return [...spellings.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]![0];
}

interface Group {
  concepts: Map<string, number>;
  units: Map<string, number>;
  quantity: bigint;
  lines: number;
}

function add(groups: Map<string, Group>, key: string, line: ItemLine) {
  const group = groups.get(key) ?? {
    concepts: new Map(),
    units: new Map(),
    quantity: 0n,
    lines: 0,
  };
  group.concepts.set(line.concept, (group.concepts.get(line.concept) ?? 0) + 1);
  group.units.set(line.unit, (group.units.get(line.unit) ?? 0) + 1);
  group.quantity += line.quantity;
  group.lines += 1;
  groups.set(key, group);
}

const toTotal = (group: Group, period?: string): ItemTotal => ({
  concept: mostCommon(group.concepts),
  unit: mostCommon(group.units),
  quantity: group.quantity,
  lines: group.lines,
  ...(period && { period }),
});

const byQuantity = (a: ItemTotal, b: ItemTotal) =>
  a.quantity === b.quantity ? a.concept.localeCompare(b.concept) : a.quantity > b.quantity ? -1 : 1;

/**
 * Adds quantities per normalized concept and unit (a kilo and a bag are never added together),
 * highest first. With `groupBy: 'month'` the `limit` best items come back month by month
 * (oldest month first): the evolution of one concept, or of the leaders.
 */
export function rankItems(
  lines: readonly ItemLine[],
  options: { concept?: string; groupBy?: 'none' | 'month'; limit: number },
): ItemRanking {
  const needle = options.concept ? normalizeConcept(options.concept) : '';
  const matching = lines.filter(
    (line) => !needle || normalizeConcept(line.concept).includes(needle),
  );
  const keyOf = (line: ItemLine) =>
    `${normalizeConcept(line.concept)}|${normalizeConcept(line.unit)}`;

  const overall = new Map<string, Group>();
  for (const line of matching) add(overall, keyOf(line), line);
  const ranked = [...overall.entries()]
    .map(([key, group]) => ({ key, total: toTotal(group) }))
    .sort((a, b) => byQuantity(a.total, b.total));
  const top = ranked.slice(0, options.limit);
  const truncated = ranked.length > top.length;

  if (options.groupBy !== 'month') {
    return { rows: top.map((entry) => entry.total), total: ranked.length, truncated };
  }

  const leaders = new Map(top.map((entry, i) => [entry.key, { label: entry.total, rank: i }]));
  const monthly = new Map<string, Group>();
  for (const line of matching) {
    if (leaders.has(keyOf(line))) add(monthly, `${line.date.slice(0, 7)}|${keyOf(line)}`, line);
  }
  const rows = [...monthly.entries()]
    .map(([key, group]) => {
      const [period, ...rest] = key.split('|');
      const leader = leaders.get(rest.join('|'))!;
      // The label is the leader's, so every month of one item reads the same.
      return {
        rank: leader.rank,
        row: { ...toTotal(group, period), concept: leader.label.concept, unit: leader.label.unit },
      };
    })
    .sort((a, b) => a.row.period!.localeCompare(b.row.period!) || a.rank - b.rank)
    .map((entry) => entry.row);
  return { rows, total: ranked.length, truncated };
}

// ── Cash forecast (cash_forecast) ──

export type Granularity = 'week' | 'month';

export interface DueInvoice {
  operation: Operation;
  dueDate: Day;
  /** Cents. */
  total: bigint;
  overdue: boolean;
}

export interface Flow {
  /** Cents; includes the overdue part. */
  total: bigint;
  count: number;
  overdueTotal: bigint;
  overdueCount: number;
}

export interface CashBucket {
  /** First and last day of the week (Monday to Sunday) or of the month. */
  from: Day;
  to: Day;
  toPay: Flow;
  toCollect: Flow;
}

/** The week (Monday to Sunday) or the month that contains the day. */
export function periodOf(day: Day, granularity: Granularity): { from: Day; to: Day } {
  const date = new Date(`${day}T00:00:00Z`);
  if (granularity === 'month') {
    const from = `${day.slice(0, 7)}-01`;
    const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
    return { from, to: addDays(next.toISOString().slice(0, 10), -1) };
  }
  const sinceMonday = (date.getUTCDay() + 6) % 7;
  const from = addDays(day, -sinceMonday);
  return { from, to: addDays(from, 6) };
}

const empty = (): Flow => ({ total: 0n, count: 0, overdueTotal: 0n, overdueCount: 0 });

/**
 * Pending and overdue invoices bucketed by due date, oldest bucket first. Money still to pay
 * (purchases) and to collect (sales) are kept apart; a bucket's total already includes its
 * overdue part, so the two are never added together.
 */
export function bucketByDueDate(
  invoices: readonly DueInvoice[],
  granularity: Granularity,
): CashBucket[] {
  const buckets = new Map<Day, CashBucket>();
  for (const invoice of invoices) {
    const period = periodOf(invoice.dueDate, granularity);
    const bucket = buckets.get(period.from) ?? { ...period, toPay: empty(), toCollect: empty() };
    const flow = invoice.operation === 'purchase' ? bucket.toPay : bucket.toCollect;
    flow.total += invoice.total;
    flow.count += 1;
    if (invoice.overdue) {
      flow.overdueTotal += invoice.total;
      flow.overdueCount += 1;
    }
    buckets.set(period.from, bucket);
  }
  return [...buckets.values()].sort((a, b) => a.from.localeCompare(b.from));
}

// ── Ages ──

/** Whole days from `from` to `to` (calendar days, never negative). */
export function daysBetween(from: Day, to: Day): number {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  return Math.max(0, Math.round(ms / 86_400_000));
}
