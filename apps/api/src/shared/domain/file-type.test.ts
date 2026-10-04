import { describe, expect, it } from 'vitest';

import { detectFileType, fileTypeFromName } from './file-type';

describe('tipo de fichero por contenido', () => {
  it('reconoce PDF, JPEG y PNG por su firma', () => {
    expect(detectFileType(new TextEncoder().encode('%PDF-1.7'))).toBe('application/pdf');
    expect(detectFileType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(
      detectFileType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])),
    ).toBe('image/png');
  });

  it('cualquier otra cosa no se acepta', () => {
    expect(detectFileType(new TextEncoder().encode('<html>'))).toBeNull();
    expect(detectFileType(new Uint8Array())).toBeNull();
  });

  it('deduce el tipo de un fichero guardado por su extensión', () => {
    expect(fileTypeFromName('albaran.jpg')).toBe('image/jpeg');
    expect(fileTypeFromName('factura.PDF')).toBe('application/pdf');
    expect(fileTypeFromName('foto.png')).toBe('image/png');
  });
});
