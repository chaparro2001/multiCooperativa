import { beforeAll, describe, expect, it } from 'vitest';

import { loadEnv } from '../../config/env';
import { FileNotFoundError, newFileKey } from './file-storage';
import { S3FileStorage, s3SettingsFromEnv } from './s3-file-storage';

const COOP = '11111111-1111-4111-8111-111111111111';
const PDF = new TextEncoder().encode('%PDF-1.4\nAssembly resolutions\n%%EOF');

const storage = new S3FileStorage(s3SettingsFromEnv(loadEnv(process.env)));

beforeAll(() => storage.ensureBucket());

async function stored() {
  const key = newFileKey(COOP, 'documents');
  await storage.put(key, PDF, 'application/pdf');
  return key;
}

describe('S3 storage (ADR-005)', () => {
  it('stores and reads the exact content', async () => {
    const key = await stored();

    expect(await storage.read(key)).toEqual(PDF);
  });

  it('the signed URL downloads the file with its type and name (NFR-DOC-02)', async () => {
    const key = await stored();

    const url = await storage.signedDownloadUrl(key, {
      fileName: 'Minutes of June.pdf',
      contentType: 'application/pdf',
    });
    const response = await fetch(url);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('content-disposition')).toContain(
      "filename*=UTF-8''Minutes%20of%20June.pdf",
    );
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PDF);
    expect(url).toContain('X-Amz-Expires=300');
  });

  it('without a signature, with a tampered signature or with another key, it is not downloaded', async () => {
    const key = await stored();
    const url = await storage.signedDownloadUrl(key, {
      fileName: 'a.pdf',
      contentType: 'application/pdf',
    });
    const otherKey = await stored();

    const unsigned = url.split('?')[0]!;
    const forged = url.replace(/X-Amz-Signature=[0-9a-f]+/, `X-Amz-Signature=${'0'.repeat(64)}`);
    const swapped = url.replace(key.split('/').at(-1)!, otherKey.split('/').at(-1)!);

    for (const attempt of [unsigned, forged, swapped]) {
      expect((await fetch(attempt)).status).toBe(403);
    }
  });

  it('the signed URL expires', async () => {
    const key = await stored();
    const url = await storage.signedDownloadUrl(key, {
      fileName: 'a.pdf',
      contentType: 'application/pdf',
      expiresInSeconds: 1,
    });

    await new Promise((resolve) => setTimeout(resolve, 2100));

    expect((await fetch(url)).status).toBe(403);
  });

  it('deleting is permanent and idempotent', async () => {
    const key = await stored();

    await storage.delete(key);
    await storage.delete(key);

    await expect(storage.read(key)).rejects.toBeInstanceOf(FileNotFoundError);
  });
});
