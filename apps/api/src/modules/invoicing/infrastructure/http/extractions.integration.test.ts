import { extractionResponseSchema } from '@multicooperativa/contracts';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createTestPrisma, resetDatabase } from '../../../../../test/database';
import { memberToken, TEST_PASSWORD } from '../../../../../test/members';
import { createApi } from '../../../../api';
import { loadEnv } from '../../../../config/env';
import { InMemoryFileStorage } from '../../../../shared/files/in-memory-file-storage';
import { createAccessModule } from '../../../access';
import { HashingEmbedder } from '../../../documents';
import type { RawExtraction } from '../../application/ports/document-extractor';
import { FakeDocumentExtractor } from '../fake-document-extractor';

const env = loadEnv(process.env);
const prisma = createTestPrisma();
const extractor = new FakeDocumentExtractor(null);
const invitationSender = { send: async () => {} };
const { app } = createApi({
  prisma,
  jwtSecret: env.JWT_SECRET,
  invitationSender,
  files: new InMemoryFileStorage(),
  embedder: new HashingEmbedder(),
  documentExtractor: extractor,
  authRateLimits: false,
});
// No extractor configured: ADR-007 says 503 and the rest keeps working.
const { app: appWithoutAi } = createApi({
  prisma,
  jwtSecret: env.JWT_SECRET,
  invitationSender,
  files: new InMemoryFileStorage(),
  embedder: new HashingEmbedder(),
  authRateLimits: false,
});

const PDF = Buffer.from('%PDF-1.4 invoice');
const reading = (overrides: Partial<RawExtraction> = {}): RawExtraction => ({
  documentType: 'invoice',
  issuer: { nif: 'B12345674', name: 'Southern Fertilizers' },
  recipient: { nif: 'F12345674', name: 'Farm' },
  number: 'F-77',
  date: '2026-10-05',
  dueDate: '2026-11-05',
  base: '100,00',
  vatRate: '21',
  total: '121,00',
  lines: [{ concept: 'NPK', quantity: '10', unit: 'kg' }],
  lowConfidence: [],
  ...overrides,
});

let coop: string;
let manager: string;
let board: string;
const as = (token: string) => ({ Authorization: `Bearer ${token}` });
const send = (token: string, file: Buffer | null = PDF, target = app) => {
  const call = request(target).post(`/cooperatives/${coop}/extractions`).set(as(token));
  return file ? call.attach('file', file, 'scan.pdf') : call;
};

beforeEach(async () => {
  await resetDatabase(prisma);
  extractor.calls.length = 0;
  extractor.setReading(null);
  const access = createAccessModule({ prisma, jwtSecret: env.JWT_SECRET, invitationSender });
  coop = (
    await access.provisionCooperative({
      name: 'Farm',
      cif: 'F12345674',
      admin: { email: 'admin@coop.test', name: 'Ana', password: TEST_PASSWORD },
    })
  ).cooperativeId;
  const common = { passwordOf: 'admin@coop.test', cooperativeId: coop };
  manager = await memberToken(
    { prisma, app },
    { ...common, email: 'manager@coop.test', profileName: 'Gestor', isPartner: false },
  );
  board = await memberToken(
    { prisma, app },
    { ...common, email: 'board@coop.test', profileName: 'Consejo rector', isPartner: true },
  );
});

afterAll(() => prisma.$disconnect());

describe('POST /extractions (US-INV-05)', () => {
  it('US-INV-05: returns a validated proposal as a purchase, preselecting a registered supplier', async () => {
    const created = await request(app)
      .post(`/cooperatives/${coop}/third-parties`)
      .set(as(manager))
      .send({
        nif: 'B12345674',
        name: 'Southern Fertilizers',
        isSupplier: true,
        isCustomer: false,
      });
    extractor.setReading(reading());

    const response = await send(manager);

    expect(response.status).toBe(200);
    const proposal = extractionResponseSchema.parse(response.body);
    expect(proposal).toMatchObject({
      status: 'proposal',
      documentType: 'invoice',
      operation: 'purchase',
      number: 'F-77',
      base: '100.00',
      total: '121.00',
    });
    expect(proposal.thirdParty.match?.id).toBe(created.body.id);
    expect(extractor.calls).toEqual([{ mediaType: 'application/pdf', bytes: PDF.length }]);
  });

  it('BR-INV-11: persists nothing, whatever the model reads', async () => {
    extractor.setReading(reading());
    await send(manager);

    expect(await prisma.invoice.count()).toBe(0);
    expect(await prisma.deliveryNote.count()).toBe(0);
    expect(await prisma.thirdParty.count()).toBe(0);
  });

  it('US-INV-05: tells that nothing could be read so the form is filled by hand', async () => {
    const response = await send(manager);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('no_data');
  });

  it('US-INV-05: a sale when the cooperative itself issues the document', async () => {
    extractor.setReading(
      reading({
        issuer: { nif: 'F12345674', name: 'Farm' },
        recipient: { nif: '12345678Z', name: 'Eastern Oil Mill' },
      }),
    );

    const response = await send(manager);

    expect(response.body).toMatchObject({
      operation: 'sale',
      thirdParty: { nif: '12345678Z', match: null },
    });
  });

  it('rejects a body without file or with something that is not a photo or PDF', async () => {
    expect((await send(manager, null)).status).toBe(400);
    const text = await send(manager, Buffer.from('hello'));
    expect(text.status).toBe(400);
    expect(text.body.error).toBe('invalid_document');
    expect(extractor.calls).toHaveLength(0);
  });

  it('403 for the governing board (reads, does not manage) and 401 without session', async () => {
    expect((await send(board)).status).toBe(403);
    expect(
      (await request(app).post(`/cooperatives/${coop}/extractions`).attach('file', PDF, 'a.pdf'))
        .status,
    ).toBe(401);
    expect(extractor.calls).toHaveLength(0);
  });

  it('NFR-INV-05: without a configured provider it answers 503 extraction_unavailable', async () => {
    const response = await send(manager, PDF, appWithoutAi);

    expect(response.status).toBe(503);
    expect(response.body.error).toBe('extraction_unavailable');
  });
});
