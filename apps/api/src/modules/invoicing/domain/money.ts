import { InvalidAmountError, TotalMismatchError } from './errors';

/**
 * RN-FAC-13: exact decimals. Money lives as integer cents, quantities as
 * thousandths and VAT rates as hundredths of a point, all in bigint.
 * Outside the domain they travel as decimal strings ("1234.56").
 */

function parseScaled(value: string, decimals: number, what: string): bigint {
  const match = value.trim().match(new RegExp(`^(-?)(\\d+)(?:\\.(\\d{1,${decimals}}))?$`));
  if (!match) throw new InvalidAmountError(`${what} no válido: «${value}».`);
  const [, sign, whole, fraction = ''] = match;
  const scaled =
    BigInt(whole!) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0') || '0');
  return sign ? -scaled : scaled;
}

function formatScaled(value: bigint, decimals: number, trimZeros: boolean): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const unit = 10n ** BigInt(decimals);
  let fraction = (abs % unit).toString().padStart(decimals, '0');
  if (trimZeros) fraction = fraction.replace(/0+$/, '');
  return `${negative ? '-' : ''}${abs / unit}${fraction ? `.${fraction}` : ''}`;
}

export const parseMoney = (value: string): bigint => parseScaled(value, 2, 'Importe');
export const formatMoney = (cents: bigint): string => formatScaled(cents, 2, false);

export const parseQuantity = (value: string): bigint => parseScaled(value, 3, 'Cantidad');
export const formatQuantity = (thousandths: bigint): string => formatScaled(thousandths, 3, true);

/** «21» → 2100n. Between 0 and 100 %. */
export function parseVatRate(value: string): bigint {
  const rate = parseScaled(value, 2, 'Tipo de IVA');
  if (rate < 0n || rate > 10000n)
    throw new InvalidAmountError('El tipo de IVA debe estar entre 0 y 100.');
  return rate;
}
export const formatVatRate = (hundredths: bigint): string => formatScaled(hundredths, 2, true);

/** base × rate, rounded to cents half up (away from zero). */
export function vatAmount(baseCents: bigint, rateHundredths: bigint): bigint {
  const raw = baseCents * rateHundredths; // in 1/10000 of a cent
  const negative = raw < 0n;
  const abs = negative ? -raw : raw;
  const rounded = (abs + 5000n) / 10000n;
  return negative ? -rounded : rounded;
}

/** RN-FAC-07: total = base + VAT, rounded to 2 decimals, within 0.01 €. */
export const TOTAL_TOLERANCE_CENTS = 1n;

export function assertTotal(baseCents: bigint, rateHundredths: bigint, totalCents: bigint): void {
  const expected = baseCents + vatAmount(baseCents, rateHundredths);
  const difference = totalCents - expected;
  const abs = difference < 0n ? -difference : difference;
  if (abs > TOTAL_TOLERANCE_CENTS) {
    throw new TotalMismatchError(formatMoney(expected), formatMoney(difference));
  }
}
