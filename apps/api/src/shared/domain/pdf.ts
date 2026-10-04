const SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

/** By content, not by name or declared type: both come from the client. */
export function isPdf(content: Uint8Array): boolean {
  return SIGNATURE.every((byte, index) => content[index] === byte);
}
