import { formatEuros } from '@/features/invoicing/amounts';

const MINUS = '−';

/**
 * Euros for display from an exact decimal string ("1234.50", "-350.00"): `1.234,50 €`. A negative
 * amount uses a true minus sign (U+2212), never a hyphen; `signed` adds "+" to positive ones. Zero
 * (also "-0.00") has no sign. Amounts stay strings: they never go through floating point.
 */
export function formatMoney(
  amount: string,
  locale: string,
  options: { signed?: boolean } = {},
): { text: string; negative: boolean } {
  const negative = amount.startsWith('-') && /[1-9]/.test(amount);
  const unsigned = formatEuros(amount.replace(/^[-+]/, ''), locale);
  if (negative) return { text: `${MINUS}${unsigned}`, negative };
  const positive = /[1-9]/.test(amount);
  return { text: options.signed && positive ? `+${unsigned}` : unsigned, negative };
}
