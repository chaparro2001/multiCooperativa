import { describe, expect, it } from 'vitest';

import { mapsSearchUrl } from './maps-url';

describe('mapsSearchUrl', () => {
  it.each([
    ['ios', 'https://maps.apple.com/?q=Sal%C3%B3n%20de%20actos%2C%20Calle%20Mayor%201'],
    ['android', 'geo:0,0?q=Sal%C3%B3n%20de%20actos%2C%20Calle%20Mayor%201'],
    [
      'web',
      'https://www.google.com/maps/search/?api=1&query=Sal%C3%B3n%20de%20actos%2C%20Calle%20Mayor%201',
    ],
  ])('builds the %s URL with the place encoded', (platform, expected) => {
    expect(mapsSearchUrl('  Salón de actos, Calle Mayor 1 ', platform)).toBe(expected);
  });

  it('encodes characters that would break the query', () => {
    expect(mapsSearchUrl('A&B #1', 'ios')).toBe('https://maps.apple.com/?q=A%26B%20%231');
  });
});
