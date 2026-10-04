export type AcceptedFileType = 'application/pdf' | 'image/jpeg' | 'image/png';

const SIGNATURES: [AcceptedFileType, number[]][] = [
  ['application/pdf', [0x25, 0x50, 0x44, 0x46, 0x2d]], // %PDF-
  ['image/jpeg', [0xff, 0xd8, 0xff]],
  ['image/png', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
];

export const EXTENSIONS: Record<AcceptedFileType, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

/** By content, never by name or declared type: both come from the client. */
export function detectFileType(content: Uint8Array): AcceptedFileType | null {
  const match = SIGNATURES.find(([, signature]) =>
    signature.every((byte, i) => content[i] === byte),
  );
  return match?.[0] ?? null;
}

/** The type of a stored file from the extension we gave its name. */
export function fileTypeFromName(name: string): AcceptedFileType {
  const extension = name.split('.').pop()?.toLowerCase();
  const entry = Object.entries(EXTENSIONS).find(
    ([, ext]) => ext === extension || (ext === 'jpg' && extension === 'jpeg'),
  );
  return (entry?.[0] as AcceptedFileType | undefined) ?? 'application/pdf';
}
