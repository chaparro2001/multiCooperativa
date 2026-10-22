/**
 * Money helpers on decimal strings and integer cents: amounts never go through
 * floating point (BR-INV-13). The API validates again; this only saves a round trip.
 */

/** "1.234,50", "1234,5" or "1234.50" → "1234.50"; null if it is not an amount with up to 2 decimals. */
export function normalizeAmountInput(text: string): string | null {
  const value = text.trim().replace(/\s|€/g, '');
  if (!value) return null;
  // Both separators: the last one is the decimal mark. Only one: a comma is the decimal mark.
  const lastComma = value.lastIndexOf(',');
  const lastDot = value.lastIndexOf('.');
  let canonical = value;
  if (lastComma >= 0 && lastDot >= 0) {
    const decimalMark = lastComma > lastDot ? ',' : '.';
    const thousands = decimalMark === ',' ? '.' : ',';
    canonical = value.split(thousands).join('').replace(decimalMark, '.');
  } else if (lastComma >= 0) {
    canonical = value.replace(',', '.');
  }
  const match = /^(-?\d+)(?:\.(\d{1,2}))?$/.exec(canonical);
  if (!match) return null;
  return `${match[1]}.${(match[2] ?? '').padEnd(2, '0')}`;
}

/** Quantities accept up to 3 decimals. */
export function normalizeQuantityInput(text: string): string | null {
  const value = text.trim().replace(',', '.');
  const match = /^(\d+)(?:\.(\d{1,3}))?$/.exec(value);
  if (!match) return null;
  return match[2] ? `${match[1]}.${match[2]}` : match[1]!;
}

export function normalizeVatInput(text: string): string | null {
  const value = text.trim().replace('%', '').replace(',', '.').trim();
  return /^\d{1,3}(\.\d{1,2})?$/.test(value) ? value : null;
}

const toCents = (amount: string): bigint => {
  const [whole, decimals = ''] = amount.split('.');
  const cents = BigInt(whole!.replace('-', '')) * 100n + BigInt(decimals.padEnd(2, '0'));
  return amount.startsWith('-') ? -cents : cents;
};

const fromCents = (cents: bigint): string => {
  const negative = cents < 0n;
  const abs = negative ? -cents : cents;
  const text = `${abs / 100n}.${String(abs % 100n).padStart(2, '0')}`;
  return negative ? `-${text}` : text;
};

/** VAT is rounded to the cent, half up (requirements/05, amount representation). */
function vatCents(baseCents: bigint, vatRate: string): bigint {
  const [whole, decimals = ''] = vatRate.split('.');
  const hundredths = BigInt(whole!) * 100n + BigInt(decimals.padEnd(2, '0'));
  const numerator = baseCents * hundredths;
  const sign = numerator < 0n ? -1n : 1n;
  return sign * ((sign * numerator + 5000n) / 10000n);
}

/** Total = base + VAT, both already normalized. Null when either is missing or invalid. */
export function computeTotal(base: string, vatRate: string): string | null {
  const normalizedBase = normalizeAmountInput(base);
  const normalizedVat = normalizeVatInput(vatRate);
  if (normalizedBase === null || normalizedVat === null) return null;
  const baseCents = toCents(normalizedBase);
  return fromCents(baseCents + vatCents(baseCents, normalizedVat));
}

/** a - b on decimal strings, exact (e.g. the VAT amount = total - base). */
export function subtractAmounts(a: string, b: string): string {
  return fromCents(toCents(a) - toCents(b));
}

/** "1234.50" → "1.234,50 €" with the separators of the given locale. Display only. */
export function formatEuros(amount: string, locale: string): string {
  const numberFormat = new Intl.NumberFormat(locale, { minimumFractionDigits: 1 });
  const sample = numberFormat.format(1000.5);
  let group = '.';
  let decimal = ',';
  if (typeof numberFormat.formatToParts === 'function') {
    const parts = numberFormat.formatToParts(1000.5);
    group = parts.find((part) => part.type === 'group')?.value ?? group;
    decimal = parts.find((part) => part.type === 'decimal')?.value ?? decimal;
  } else {
    // Hermes on iOS has no `formatToParts`: read the separators off a formatted sample
    // ("1.000,5" has a group separator, "1000,5" does not).
    decimal = sample.charAt(sample.length - 2) || decimal;
    if (sample.length === 7) group = sample.charAt(1);
  }
  const negative = amount.startsWith('-');
  const [whole = '0', decimals = '00'] = amount.replace('-', '').split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, group);
  return `${negative ? '-' : ''}${grouped}${decimal}${decimals.padEnd(2, '0')} €`;
}
