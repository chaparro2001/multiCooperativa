import { describe, expect, it } from 'vitest';

import { collect } from './errors';
import { dayMessage, isEmail, isPhone, requiredText } from './rules';

describe('form rules (usability of forms)', () => {
  it('checks emails with the shape the API checks', () => {
    expect(isEmail(' a@b.es ')).toBe(true);
    expect(isEmail('a@b')).toBe(false);
    expect(isEmail('a b@c.es')).toBe(false);
    expect(isEmail('')).toBe(false);
  });

  it('accepts phones with digits and separators only', () => {
    expect(isPhone('+34 600 111 222')).toBe(true);
    expect(isPhone('(91) 555-12-34')).toBe(true);
    expect(isPhone('12345')).toBe(false);
    expect(isPhone('call me')).toBe(false);
  });

  it('tells empty days from invalid ones', () => {
    expect(dayMessage('')?.key).toBe('forms.errors.required');
    expect(dayMessage('2026-02-30')?.key).toBe('forms.errors.invalid');
    expect(dayMessage('2026-99-99')?.key).toBe('forms.errors.invalid');
    expect(dayMessage('05/10/2026')?.key).toBe('forms.errors.invalid');
    expect(dayMessage('2026-10-05')).toBeUndefined();
  });

  it('flags blank text as required', () => {
    expect(requiredText('  ')?.key).toBe('forms.errors.required');
    expect(requiredText('x')).toBeUndefined();
  });

  it('collects only the fields that have a message', () => {
    expect(collect({ a: requiredText(''), b: requiredText('x') })).toEqual({
      a: { key: 'forms.errors.required' },
    });
  });
});
