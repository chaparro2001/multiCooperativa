/**
 * Turns a number as printed on a Spanish document (“1.234,56 €”, “21 %”)
 * into the canonical form the money parsers accept (“1234.56”). Null when it
 * is not unambiguously a number. Only text manipulation: never through floats.
 */
export function normalizeDecimal(text: string | null): string | null {
  if (text === null) return null;
  const cleaned = text.replace(/[€%\s\u00a0]/g, '');
  if (!/^-?[\d.,]+$/.test(cleaned)) return null;

  const commas = (cleaned.match(/,/g) ?? []).length;
  const dots = (cleaned.match(/\./g) ?? []).length;
  let canonical: string;
  if (commas > 0 && dots > 0) {
    // The last separator is the decimal one; the other groups thousands.
    const decimalIsComma = cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.');
    const [thousands, decimal] = decimalIsComma ? ['.', ','] : [',', '.'];
    if ((cleaned.match(decimal === ',' ? /,/g : /\./g) ?? []).length > 1) return null;
    const integer = cleaned.slice(0, cleaned.lastIndexOf(decimal));
    const grouping = thousands === '.' ? /^-?\d{1,3}(\.\d{3})*$/ : /^-?\d{1,3}(,\d{3})*$/;
    if (!grouping.test(integer)) return null;
    canonical = cleaned.split(thousands).join('').replace(decimal, '.');
  } else if (commas === 1) {
    canonical = cleaned.replace(',', '.');
  } else if (dots === 1) {
    // “1.234” in Spain is a thousand: three digits after a single dot mean grouping.
    canonical = /\.\d{3}$/.test(cleaned) ? cleaned.replace('.', '') : cleaned;
  } else if (commas === 0 && dots === 0) {
    canonical = cleaned;
  } else if (dots > 1 && commas === 0 && /^-?\d{1,3}(\.\d{3})+$/.test(cleaned)) {
    canonical = cleaned.split('.').join('');
  } else {
    return null;
  }
  return /^-?\d+(\.\d+)?$/.test(canonical) ? canonical : null;
}
