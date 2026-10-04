import { beforeAll, describe, expect, it } from 'vitest';

import { loadEnv } from '../../config/env';
import { FileNotFoundError, newFileKey } from './file-storage';
import { S3FileStorage, s3SettingsFromEnv } from './s3-file-storage';

const COOP = '11111111-1111-4111-8111-111111111111';
const PDF = new TextEncoder().encode('%PDF-1.4\nAcuerdos de la asamblea\n%%EOF');

const storage = new S3FileStorage(s3SettingsFromEnv(loadEnv(process.env)));

beforeAll(() => storage.ensureBucket());

async function stored() {
  const key = newFileKey(COOP, 'documentos');
  await storage.put(key, PDF, 'application/pdf');
  return key;
}

describe('almacenamiento S3 (ADR-005)', () => {
  it('guarda y lee el contenido exacto', async () => {
    const key = await stored();

    expect(await storage.read(key)).toEqual(PDF);
  });

  it('la URL firmada descarga el fichero con su tipo y su nombre (RNF-DOC-02)', async () => {
    const key = await stored();

    const url = await storage.signedDownloadUrl(key, {
      fileName: 'Acta de junio.pdf',
      contentType: 'application/pdf',
    });
    const response = await fetch(url);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/pdf');
    expect(response.headers.get('content-disposition')).toContain(
      "filename*=UTF-8''Acta%20de%20junio.pdf",
    );
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PDF);
    expect(url).toContain('X-Amz-Expires=300');
  });

  it('sin firma, con la firma alterada o con otra clave, no se descarga', async () => {
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

  it('la URL firmada caduca', async () => {
    const key = await stored();
    const url = await storage.signedDownloadUrl(key, {
      fileName: 'a.pdf',
      contentType: 'application/pdf',
      expiresInSeconds: 1,
    });

    await new Promise((resolve) => setTimeout(resolve, 2100));

    expect((await fetch(url)).status).toBe(403);
  });

  it('borrar es definitivo e idempotente', async () => {
    const key = await stored();

    await storage.delete(key);
    await storage.delete(key);

    await expect(storage.read(key)).rejects.toBeInstanceOf(FileNotFoundError);
  });
});
