import { describe, expect, it } from 'vitest';

import { S3FileStorage, type S3Settings } from './s3-file-storage';

const base: S3Settings = {
  endpoint: 'http://storage:9000',
  region: 'us-east-1',
  bucket: 'multicooperativa',
  accessKeyId: 'key',
  secretAccessKey: 'secret',
  forcePathStyle: true,
};
const options = { fileName: 'invoice.pdf', contentType: 'application/pdf' };

describe('S3FileStorage signed URLs (ADR-005, ADR-012)', () => {
  it('uses the public endpoint host when configured', async () => {
    const storage = new S3FileStorage({
      ...base,
      publicEndpoint: 'https://files-cooperativa.example.com',
    });

    const url = new URL(await storage.signedDownloadUrl('coops/a/invoices/x.pdf', options));

    expect(url.origin).toBe('https://files-cooperativa.example.com');
    expect(url.pathname).toBe('/multicooperativa/coops/a/invoices/x.pdf');
    expect(url.searchParams.get('X-Amz-Signature')).toBeTruthy();
  });

  it('uses the internal endpoint when no public one is configured', async () => {
    const url = new URL(await new S3FileStorage(base).signedDownloadUrl('k.pdf', options));

    expect(url.origin).toBe('http://storage:9000');
  });
});
