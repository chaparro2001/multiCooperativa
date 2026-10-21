import { InvalidMovementError } from './errors';

/**
 * BR-MEM-04: euros with exact decimals. Money lives as integer cents in a
 * bigint; outside the domain it travels as a decimal string ("1234.56").
 */

export function parseMoney(value: string): bigint {
  const match = value.trim().match(/^(-?)(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) throw new InvalidMovementError(`Invalid amount: “${value}”.`);
  const [, sign, whole, fraction = ''] = match;
  const cents = BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0') || '0');
  return sign ? -cents : cents;
}

export function formatMoney(cents: bigint): string {
  const negative = cents < 0n;
  const abs = negative ? -cents : cents;
  return `${negative ? '-' : ''}${abs / 100n}.${(abs % 100n).toString().padStart(2, '0')}`;
}
