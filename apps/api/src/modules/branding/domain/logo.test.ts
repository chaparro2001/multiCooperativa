import { describe, expect, it } from 'vitest';

import { inspectLogo, MAX_LOGO_SIDE } from './logo';

function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  bytes.set([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 8); // IHDR chunk
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  return bytes;
}

function jpeg(width: number, height: number): Uint8Array {
  return Uint8Array.from([
    0xff,
    0xd8, // SOI
    0xff,
    0xe0,
    0x00,
    0x04,
    0x4a,
    0x46, // APP0 with a 2-byte payload
    0xff,
    0xc0,
    0x00,
    0x0b,
    0x08,
    height >> 8,
    height & 255,
    width >> 8,
    width & 255,
    0x01,
    0x01,
    0x11,
    0x00, // SOF0
  ]);
}

const text = (value: string) => new TextEncoder().encode(value);

describe('inspectLogo (BR-ACC-17)', () => {
  it('accepts a PNG and reads its size from the header', () => {
    expect(inspectLogo(png(300, 120))).toEqual({
      ok: true,
      type: 'image/png',
      extension: 'png',
      width: 300,
      height: 120,
    });
  });

  it('accepts a JPEG and reads its size from the SOF segment', () => {
    expect(inspectLogo(jpeg(640, 480))).toEqual({
      ok: true,
      type: 'image/jpeg',
      extension: 'jpg',
      width: 640,
      height: 480,
    });
  });

  it('accepts exactly the maximum side and rejects one pixel more', () => {
    expect(inspectLogo(png(MAX_LOGO_SIDE, MAX_LOGO_SIDE)).ok).toBe(true);
    expect(inspectLogo(png(MAX_LOGO_SIDE + 1, 10))).toEqual({
      ok: false,
      reason: 'too_large_dimensions',
    });
    expect(inspectLogo(jpeg(10, MAX_LOGO_SIDE + 1))).toEqual({
      ok: false,
      reason: 'too_large_dimensions',
    });
  });

  it('rejects SVG explicitly (it can carry scripts)', () => {
    for (const svg of [
      '<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>',
      '<?xml version="1.0"?>\n<svg></svg>',
      '  \n<svg></svg>',
    ]) {
      expect(inspectLogo(text(svg))).toEqual({ ok: false, reason: 'svg_not_allowed' });
    }
  });

  it.each([
    ['PDF', text('%PDF-1.4 hello')],
    ['GIF', text('GIF89a......')],
    ['empty', new Uint8Array(0)],
  ])('rejects %s by content', (_name, content) => {
    expect(inspectLogo(content)).toEqual({ ok: false, reason: 'unsupported_type' });
  });

  it('rejects a truncated PNG or JPEG whose size cannot be read', () => {
    expect(inspectLogo(png(10, 10).slice(0, 12))).toEqual({
      ok: false,
      reason: 'unsupported_type',
    });
    expect(inspectLogo(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00]))).toEqual({
      ok: false,
      reason: 'unsupported_type',
    });
  });

  it('rejects zero-size images', () => {
    expect(inspectLogo(png(0, 10))).toEqual({ ok: false, reason: 'unsupported_type' });
  });
});
