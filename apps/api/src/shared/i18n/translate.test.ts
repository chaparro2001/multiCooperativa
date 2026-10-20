import { describe, expect, it } from 'vitest';

import { LOCALES, MESSAGES } from './messages';
import { isLocale, translate } from './translate';

describe('translate', () => {
  it('uses Spanish by default', () => {
    expect(translate(undefined, 'invitation.subject', { cooperativeName: 'San Isidro' })).toBe(
      'Te han invitado a San Isidro',
    );
  });

  it('translates to English', () => {
    expect(translate('en', 'invitation.subject', { cooperativeName: 'San Isidro' })).toBe(
      'You have been invited to San Isidro',
    );
  });

  it('replaces every occurrence of a placeholder and accepts numbers', () => {
    expect(
      translate('en', 'invitation.body', { name: 'Ada', cooperativeName: 'X', link: 'l' }),
    ).toContain('Hello Ada, X has invited you');
  });

  it('leaves a placeholder without a value visible', () => {
    expect(translate('en', 'invitation.subject')).toBe(
      'You have been invited to {cooperativeName}',
    );
  });

  it('has the same keys and placeholders in every locale', () => {
    const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    const reference = MESSAGES.es;

    for (const locale of LOCALES) {
      expect(Object.keys(MESSAGES[locale]).sort()).toEqual(Object.keys(reference).sort());
      for (const [key, text] of Object.entries(MESSAGES[locale])) {
        expect(placeholders(text), `${locale}:${key}`).toEqual(
          placeholders(reference[key as keyof typeof reference]),
        );
      }
    }
  });

  it('recognizes supported locales', () => {
    expect(isLocale('es')).toBe(true);
    expect(isLocale('fr')).toBe(false);
  });
});
