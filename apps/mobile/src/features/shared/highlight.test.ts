import { describe, expect, it } from 'vitest';

import { splitHighlight } from './highlight';

describe('splitHighlight', () => {
  it('marks case-insensitive matches of each word', () => {
    expect(splitHighlight('La Asamblea general', 'asamblea')).toEqual([
      { text: 'La ', match: false },
      { text: 'Asamblea', match: true },
      { text: ' general', match: false },
    ]);
  });

  it('returns the text untouched without usable words', () => {
    expect(splitHighlight('hola', ' a ')).toEqual([{ text: 'hola', match: false }]);
  });

  it('escapes regular expression characters', () => {
    expect(splitHighlight('coste (IVA)', '(IVA)')).toEqual([
      { text: 'coste ', match: false },
      { text: '(IVA)', match: true },
    ]);
  });
});
