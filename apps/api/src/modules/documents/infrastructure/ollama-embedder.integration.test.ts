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

describe.skipIf(!modelReady)(`Ollama con ${env.EMBEDDING_MODEL} (ADR-006)`, () => {
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
      name: 'Campo',
      cif: 'F12345674',
      admin: { email: 'admin@campo.test', name: 'Ana', password: 'una-clave-larga' },
    }));
    const login = await request(app)
      .post('/auth/login')
      .send({ email: 'admin@campo.test', password: 'una-clave-larga' });
    token = authTokensSchema.parse(login.body).accessToken;
  });
  afterAll(() => prisma.$disconnect());

  it('las frases con el mismo significado quedan más cerca que las que no', async () => {
    const [asamblea, pregunta, tractor] = await embedder.embed([
      'La asamblea general se celebra en junio.',
      '¿Cuándo es la asamblea?',
      'El tractor necesita gasóleo.',
    ]);
    const cosine = (a: number[], b: number[]) => a.reduce((sum, v, i) => sum + v * b[i]!, 0);

    expect(cosine(asamblea!, pregunta!)).toBeGreaterThan(cosine(asamblea!, tractor!) + 0.1);
  });

  it(
    'RNF-DOC-01: un documento de 50 páginas queda indexado en menos de 60 segundos',
    { timeout: 120_000 },
    async () => {
      const line = (page: number, n: number) =>
        `Página ${page}, punto ${n}: la cooperativa acuerda el reparto de la cosecha de aceituna entre sus socios.`;
      const pages = Array.from({ length: 50 }, (_, p) =>
        Array.from({ length: 14 }, (_, n) => line(p + 1, n + 1)),
      );
      pages[36]!.push('El plazo para solicitar el riego por goteo termina el 15 de marzo.');
      const pdf = Buffer.from(await buildPdf(pages));

      const started = Date.now();
      const uploaded = await request(app)
        .post(`/cooperativas/${cooperativeId}/documentos`)
        .set('Authorization', `Bearer ${token}`)
        .field('title', 'Memoria anual')
        .field('category', 'cuentas')
        .field('documentDate', '2026-06-30')
        .attach('fichero', pdf, 'Memoria anual.pdf');
      const document = documentSummarySchema.parse(uploaded.body);
      await indexing.idle();
      const elapsed = Date.now() - started;

      const version = await prisma.documentVersion.findFirstOrThrow({
        where: { documentId: document.id },
      });
      expect(version.indexingStatus).toBe('indexado');
      expect(
        await prisma.documentChunk.count({ where: { documentId: document.id } }),
      ).toBeGreaterThanOrEqual(50);
      console.info(`50 páginas indexadas en ${(elapsed / 1000).toFixed(1)} s`);
      expect(elapsed).toBeLessThan(60_000);

      const search = await request(app)
        .get(`/cooperativas/${cooperativeId}/documentos/buscar`)
        .query({ q: '¿hasta cuándo puedo pedir el riego?' })
        .set('Authorization', `Bearer ${token}`);
      const [best] = searchDocumentsResponseSchema.parse(search.body).items;
      expect(best?.page).toBe(37);
    },
  );
});
