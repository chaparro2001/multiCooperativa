/** BR-ACC-17: the logo is a PNG or JPEG of at most 1 MB and 1024 px per side, checked by content. */
export const MAX_LOGO_BYTES = 1024 * 1024;
export const MAX_LOGO_SIDE = 1024;

export type LogoRejection = 'svg_not_allowed' | 'unsupported_type' | 'too_large_dimensions';

export type LogoInspection =
  | {
      ok: true;
      type: 'image/png' | 'image/jpeg';
      extension: 'png' | 'jpg';
      width: number;
      height: number;
    }
  | { ok: false; reason: LogoRejection };

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const unsupported: LogoInspection = { ok: false, reason: 'unsupported_type' };

const startsWith = (content: Uint8Array, signature: number[]) =>
  signature.every((byte, i) => content[i] === byte);

/** SVG can carry scripts: refused by name, not only by not being a PNG or JPEG. */
function looksLikeSvg(content: Uint8Array): boolean {
  const head = new TextDecoder().decode(content.subarray(0, 1024)).trimStart().toLowerCase();
  return head.startsWith('<?xml') || head.includes('<svg');
}

/** IHDR is always the first chunk: width and height are big-endian at bytes 16 and 20. */
function pngSize(content: Uint8Array): [number, number] | null {
  if (content.length < 24) return null;
  const view = new DataView(content.buffer, content.byteOffset, content.byteLength);
  return [view.getUint32(16), view.getUint32(20)];
}

/** Walks the JPEG segments up to the first start-of-frame marker, which holds the size. */
function jpegSize(content: Uint8Array): [number, number] | null {
  const view = new DataView(content.buffer, content.byteOffset, content.byteLength);
  let offset = 2;
  while (offset + 4 <= content.length) {
    if (content[offset] !== 0xff) return null;
    const marker = content[offset + 1]!;
    if (marker === 0xff) {
      offset += 1; // fill byte
      continue;
    }
    const isFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isFrame) {
      if (offset + 9 > content.length) return null;
      return [view.getUint16(offset + 7), view.getUint16(offset + 5)];
    }
    const length = view.getUint16(offset + 2);
    if (length < 2) return null;
    offset += 2 + length;
  }
  return null;
}

export function inspectLogo(content: Uint8Array): LogoInspection {
  if (looksLikeSvg(content)) return { ok: false, reason: 'svg_not_allowed' };

  let type: 'image/png' | 'image/jpeg';
  let size: [number, number] | null;
  if (startsWith(content, PNG_SIGNATURE)) {
    type = 'image/png';
    size = pngSize(content);
  } else if (startsWith(content, [0xff, 0xd8, 0xff])) {
    type = 'image/jpeg';
    size = jpegSize(content);
  } else {
    return unsupported;
  }
  if (!size || size[0] === 0 || size[1] === 0) return unsupported;
  const [width, height] = size;
  if (width > MAX_LOGO_SIDE || height > MAX_LOGO_SIDE) {
    return { ok: false, reason: 'too_large_dimensions' };
  }
  return { ok: true, type, extension: type === 'image/png' ? 'png' : 'jpg', width, height };
}
