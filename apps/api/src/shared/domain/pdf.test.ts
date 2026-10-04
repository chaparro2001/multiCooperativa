import { describe, expect, it } from 'vitest';

import { isPdf } from './pdf';

const bytes = (text: string) => new TextEncoder().encode(text);

describe('isPdf', () => {
  it('reconoce la firma %PDF- del inicio del fichero', () => {
    expect(isPdf(bytes('%PDF-1.7\n...'))).toBe(true);
  });

  it('rechaza otros formatos aunque se llamen .pdf', () => {
    expect(isPdf(bytes('PK\u0003\u0004 un docx'))).toBe(false);
    expect(isPdf(bytes('<html>'))).toBe(false);
    expect(isPdf(new Uint8Array())).toBe(false);
  });
});
