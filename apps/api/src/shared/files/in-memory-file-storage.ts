import { FileNotFoundError, type FileStorage, SIGNED_URL_TTL_SECONDS } from './file-storage';

/** Test double: keeps files in memory and returns recognizable fake links. */
export class InMemoryFileStorage implements FileStorage {
  readonly files = new Map<string, { content: Uint8Array; contentType: string }>();

  async put(key: string, content: Uint8Array, contentType: string) {
    this.files.set(key, { content, contentType });
  }

  async read(key: string) {
    const file = this.files.get(key);
    if (!file) throw new FileNotFoundError(key);
    return file.content;
  }

  async signedDownloadUrl(
    key: string,
    options: { fileName: string; contentType: string; expiresInSeconds?: number },
  ) {
    const expires = options.expiresInSeconds ?? SIGNED_URL_TTL_SECONDS;
    return `https://files.test/${key}?expires=${expires}&name=${encodeURIComponent(options.fileName)}`;
  }

  async delete(key: string) {
    this.files.delete(key);
  }
}
