import { randomUUID } from 'node:crypto';

/** RNF-COM-03, RNF-DOC-02: download links live five minutes. */
export const SIGNED_URL_TTL_SECONDS = 5 * 60;

/** Storage of uploaded files (ADR-005). Modules depend on this port, never on S3. */
export interface FileStorage {
  put(key: string, content: Uint8Array, contentType: string): Promise<void>;
  /** For server-side processing (indexing, extraction). Throws FileNotFoundError. */
  read(key: string): Promise<Uint8Array>;
  /** A short-lived link the app opens directly; it fixes type and download name. */
  signedDownloadUrl(
    key: string,
    options: { fileName: string; contentType: string; expiresInSeconds?: number },
  ): Promise<string>;
  /** Idempotent. */
  delete(key: string): Promise<void>;
}

export class FileNotFoundError extends Error {
  constructor(key: string) {
    super(`No existe el fichero ${key}.`);
    this.name = 'FileNotFoundError';
  }
}

/**
 * `cooperativas/<cooperativeId>/<area>/<random uuid>`: the uuid makes it
 * unguessable (RNF-DOC-04); the prefix groups every file of a cooperative (ADR-003).
 */
export function newFileKey(cooperativeId: string, area: string): string {
  if (!/^[a-z0-9-]+$/.test(area)) throw new Error(`Área de fichero no válida: ${area}`);
  return `cooperativas/${cooperativeId}/${area}/${randomUUID()}`;
}

/**
 * Content-Disposition with the original name: an ASCII fallback plus the
 * UTF-8 version (RFC 6266), since names like «Acta junio.pdf» are the norm here.
 */
export function inlineDisposition(fileName: string): string {
  const ascii = fileName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]/g, '_')
    .replace(/["\\]/g, '_');
  return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
