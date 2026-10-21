import { type FieldMessage, invalid, required } from './errors';

/** Same shape the API checks for emails: something@something.tld, no spaces. */
export const isEmail = (value: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

/** Digits with the usual separators, no letters; the API only limits the length. */
export const isPhone = (value: string): boolean => {
  const text = value.trim();
  return /^\+?[\d\s().-]+$/.test(text) && text.replace(/\D/g, '').length >= 6;
};

/** `required` for an empty day, `invalid` when it is not a real `YYYY-MM-DD` date, none otherwise. */
export function dayMessage(value: string): FieldMessage | undefined {
  const text = value.trim();
  if (!text) return required;
  const date = new Date(`${text}T00:00:00Z`);
  const real =
    /^\d{4}-\d{2}-\d{2}$/.test(text) &&
    !Number.isNaN(date.getTime()) &&
    date.toISOString().startsWith(text);
  return real ? undefined : invalid;
}

/** `required` for an empty text, none otherwise. */
export const requiredText = (value: string): FieldMessage | undefined =>
  value.trim() ? undefined : required;

/** Message of a text longer than its limit. */
export const tooLong = (max: number): FieldMessage => ({
  key: 'forms.errors.tooLong',
  params: { max },
});

export const EMAIL_ERROR: FieldMessage = { key: 'forms.errors.email' };
export const PHONE_ERROR: FieldMessage = { key: 'forms.errors.phone' };
