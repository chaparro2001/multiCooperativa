import { i18n } from './index';
import { INTL_LOCALES, resolveLanguage } from './resources';

/** BCP 47 locale of the current UI language, for `Intl` and native pickers. */
export function currentLocale(): string {
  return INTL_LOCALES[resolveLanguage(i18n.language)];
}

/** "15 mar 2026" style, from an ISO date or a calendar day (YYYY-MM-DD, read as that day). */
export function formatDay(value: string): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
  return formatDate(date);
}

const dateFormatters = new Map<string, Intl.DateTimeFormat>();
const numberFormatters = new Map<string, Intl.NumberFormat>();

/** Formatters are costly to build; keep one per locale and variant (the locale can change at runtime). */
function dateFormatter(variant: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const locale = currentLocale();
  const key = `${locale}|${variant}`;
  let formatter = dateFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, options);
    dateFormatters.set(key, formatter);
  }
  return formatter;
}

/** Short month, as the design system writes dates ("22 oct 2026"; ADR-024). */
export function formatDate(date: Date): string {
  return dateFormatter('date', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

export function formatTime(date: Date): string {
  return dateFormatter('time', { hour: '2-digit', minute: '2-digit' }).format(date);
}

export function formatDateTime(iso: string): string {
  return dateFormatter('dateTime', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  const locale = currentLocale();
  const key = `${locale}|${options ? JSON.stringify(options) : ''}`;
  let formatter = numberFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, options);
    numberFormatters.set(key, formatter);
  }
  return formatter.format(value);
}

/** Human-readable file size: bytes, then KB and MB with the locale's decimal separator. */
export function formatSize(bytes: number): string {
  const unit = (key: 'bytes' | 'kb' | 'mb', value: string) =>
    i18n.t(`common.units.${key}`, { value });
  if (bytes < 1024) return unit('bytes', formatNumber(bytes));
  if (bytes < 1024 * 1024) return unit('kb', formatNumber(Math.round(bytes / 1024)));
  const mb = bytes / (1024 * 1024);
  return unit('mb', formatNumber(Math.round(mb * 10) / 10, { minimumFractionDigits: 1 }));
}

/** Today as YYYY-MM-DD in the device's time zone (default date of a new document). */
export function today(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** "a, b and c" in the current language, without relying on `Intl.ListFormat` (missing in Hermes). */
export function joinList(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  const and = i18n.t('common.listAnd');
  return `${items.slice(0, -1).join(', ')} ${and} ${items[items.length - 1]}`;
}
