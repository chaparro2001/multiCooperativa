import {
  authTokensSchema,
  documentSummarySchema,
  searchDocumentsResponseSchema,
} from '@multicooperativa/contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestPrisma, resetDatabase } from '../../../../test/database';
import { buildPdf } from '../../../../test/pdf';
import { createApi } from '../../../api';
import { loadEnv } from '../../../config/env';
import { S3FileStorage, s3SettingsFromEnv } from '../../../shared/files/s3-file-storage';
import { createAccessModule } from '../../access';
import { OllamaEmbedder } from './ollama-embedder';

/**
 * Against the real local model (ADR-006). Skipped where Ollama is not running
 * with the model, as in CI; run `pnpm db:up && pnpm ai:pull` to include it.
 */
const env = loadEnv(process.env);
const modelReady = await fetch(`${env.OLLAMA_URL}/api/show`, {
  method: 'POST',
  body: JSON.stringify({ model: env.EMBEDDING_MODEL }),
})
  .then((response) => response.ok)
  .catch(() => false);

const embedder = new OllamaEmbedder({ url: env.OLLAMA_URL, model: env.EMBEDDING_MODEL });

describe.skipIf(!modelReady)(`Ollama with ${env.EMBEDDING_MODEL} (ADR-006)`, () => {
  const prisma = createTestPrisma();
  const files = new S3FileStorage(s3SettingsFromEnv(env));
  const { app, indexing } = createApi({
    prisma,
    jwtSecret: env.JWT_SECRET,
    invitationSender: { send: async () => {} },
    files,
    embedder,
    authRateLimits: false,
  });
  let cooperativeId: string;
  let token: string;

  beforeAll(async () => {
    await files.ensureBucket();
    await resetDatabase(prisma);
    const access = createAccessModule({
      prisma,
      jwtSecret: env.JWT_SECRET,
      invitationSender: { send: async () => {} },
    });
    ({ cooperativeId } = await access.provisionCooperative({
      name: 'Farm',
      cif: 'F12345674',
      admin: { email: 'admin@coop.test', name: 'Ana', password: 'una-clave-larga' },
    }));
    const login = await request(app)
      .post('/auth/login')
      .send({ email: 'admin@coop.test', password: 'una-clave-larga' });
    token = authTokensSchema.parse(login.body).accessToken;
  });
  afterAll(() => prisma.$disconnect());

  it('sentences with the same meaning end up closer than those that do not', async () => {
    const [assembly, question, tractor] = await embedder.embed([
      'The general assembly is held in June.',
      'When is the assembly?',
      'The tractor needs diesel.',
    ]);
    const cosine = (a: number[], b: number[]) => a.reduce((sum, v, i) => sum + v * b[i]!, 0);

    expect(cosine(assembly!, question!)).toBeGreaterThan(cosine(assembly!, tractor!) + 0.1);
  });

  it(
    'NFR-DOC-01: a 50-page document is indexed in under 60 seconds',
    { timeout: 120_000 },
    async () => {
      const line = (page: number, n: number) =>
        `Page ${page}, item ${n}: the cooperative agrees on sharing the olive harvest among its members.`;
      const pages = Array.from({ length: 50 }, (_, p) =>
        Array.from({ length: 14 }, (_, n) => line(p + 1, n + 1)),
      );
      pages[36]!.push('The deadline to request drip irrigation ends on 15 March.');
      const pdf = Buffer.from(await buildPdf(pages));

      const started = Date.now();
      const uploaded = await request(app)
        .post(`/cooperatives/${cooperativeId}/documents`)
        .set('Authorization', `Bearer ${token}`)
        .field('title', 'Annual report')
        .field('category', 'accounts')
        .field('documentDate', '2026-06-30')
        .attach('file', pdf, 'Annual report.pdf');
      const document = documentSummarySchema.parse(uploaded.body);
      await indexing.idle();
      const elapsed = Date.now() - started;

      const version = await prisma.documentVersion.findFirstOrThrow({
        where: { documentId: document.id },
      });
      expect(version.indexingStatus).toBe('indexed');
      expect(
        await prisma.documentChunk.count({ where: { documentId: document.id } }),
      ).toBeGreaterThanOrEqual(50);
      console.info(`50 pages indexed in ${(elapsed / 1000).toFixed(1)} s`);
      expect(elapsed).toBeLessThan(60_000);

      const search = await request(app)
        .get(`/cooperatives/${cooperativeId}/documents/search`)
        .query({ q: 'until when can I request irrigation?' })
        .set('Authorization', `Bearer ${token}`);
      const [best] = searchDocumentsResponseSchema.parse(search.body).items;
      expect(best?.page).toBe(37);
    },
  );
});
