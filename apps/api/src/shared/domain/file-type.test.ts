import { describe, expect, it } from 'vitest';

import { detectFileType, fileTypeFromName } from './file-type';

describe('file type by content', () => {
  it('recognizes PDF, JPEG and PNG by their signature', () => {
    expect(detectFileType(new TextEncoder().encode('%PDF-1.7'))).toBe('application/pdf');
    expect(detectFileType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(
      detectFileType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])),
    ).toBe('image/png');
  });

  it('anything else is not accepted', () => {
    expect(detectFileType(new TextEncoder().encode('<html>'))).toBeNull();
    expect(detectFileType(new Uint8Array())).toBeNull();
  });

  it('infers the type of a stored file from its extension', () => {
    expect(fileTypeFromName('delivery-note.jpg')).toBe('image/jpeg');
    expect(fileTypeFromName('invoice.PDF')).toBe('application/pdf');
    expect(fileTypeFromName('photo.png')).toBe('image/png');
  });
});
