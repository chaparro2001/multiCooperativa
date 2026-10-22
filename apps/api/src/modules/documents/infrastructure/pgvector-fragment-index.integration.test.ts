import { randomUUID } from 'node:crypto';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { createTestPrisma, resetDatabase } from '../../../../test/database';
import { createAccessModule } from '../../access';
import type { Embedder } from '../application/ports/embedder';
import { HashingEmbedder } from '../application/testing/hashing-embedder';
import { PgVectorFragmentIndex } from './pgvector-fragment-index';

const prisma = createTestPrisma();
const embedder: Embedder = new HashingEmbedder();
const JWT_SECRET = 'x'.repeat(32);

let coop: string;
let sea: string;

async function provision(name: string, cif: string, email: string) {
  const access = createAccessModule({
    prisma,
    jwtSecret: JWT_SECRET,
    invitationSender: { send: async () => {} },
  });
  return (
    await access.provisionCooperative({
      name,
      cif,
      admin: { email, name: 'Ana', password: 'una-clave-larga' },
    })
  ).cooperativeId;
}

beforeEach(async () => {
  await resetDatabase(prisma);
  coop = await provision('Farm', 'F12345674', 'admin@coop.test');
  sea = await provision('Sea', 'F76543214', 'admin@sea.test');
});
afterAll(() => prisma.$disconnect());

async function addDocument(
  cooperativeId: string,
  title: string,
  contents: string[],
  status: 'published' | 'withdrawn' = 'published',
  index = new PgVectorFragmentIndex(prisma, { minVectorScore: 0 }),
) {
  const document = await prisma.document.create({
    data: {
      cooperativeId,
      title,
      category: 'bylaws',
      documentDate: new Date('2026-01-01'),
      status,
    },
  });
  const embeddings = await embedder.embed(contents, 'document');
  await index.replaceDocument(
    cooperativeId,
    document.id,
    randomUUID(),
    contents.map((content, position) => ({
      page: position + 1,
      position,
      content,
      embedding: embeddings[position]!,
    })),
  );
  return document;
}

async function search(
  text: string,
  options: { minVectorScore?: number; limit?: number; cooperativeId?: string } = {},
) {
  const index = new PgVectorFragmentIndex(prisma, { minVectorScore: options.minVectorScore ?? 0 });
  const [embedding] = await embedder.embed([text], 'query');
  return index.search(
    options.cooperativeId ?? coop,
    { text, embedding: embedding! },
    options.limit ?? 5,
  );
}

describe('PgVectorFragmentIndex hybrid search (US-DOC-07, US-AI-02)', () => {
  it('Given an exact term the embedding barely sees, the text arm finds the fragment (stemming included)', async () => {
    // The query shares one rare word with the target; the vector arm is dominated by the others,
    // and the threshold (0.9) discards every vector hit, so only the text arm can return it.
    await addDocument(coop, 'Regulation', [
      'Las compuertas del canal principal se revisan en primavera cada ano.',
      'El expediente RIEGO-2026 regula los turnos nocturnos de agua.',
      'Otros asuntos generales sin relacion alguna con lo anterior.',
    ]);

    const hits = await search('quiero consultar el expediente de riego-2026 por favor', {
      minVectorScore: 0.9,
    });

    expect(hits.map((hit) => hit.page)).toEqual([2]);
    expect(hits[0]?.score).toBeGreaterThan(0);
    expect(hits[0]?.score).toBeLessThan(0.9);
  });

  it('the text arm ORs the terms: a question with extra words still finds a fragment with one of them', async () => {
    await addDocument(coop, 'Minutes', ['Se aprobo el presupuesto de la campana de aceituna.']);

    const hits = await search('cuando empieza la campana', { minVectorScore: 0.99 });

    expect(hits).toHaveLength(1);
  });

  it('a query of only stopwords or odd characters does not fail and finds nothing by text', async () => {
    await addDocument(coop, 'Bylaws', ['Texto cualquiera del documento.']);

    for (const text of [
      'para como pero sobre',
      '\'; DROP TABLE "DocumentChunk"; --',
      'foo & bar | !baz :* <-> qux:A* (x',
    ]) {
      await expect(search(text, { minVectorScore: 0.99 })).resolves.toEqual([]);
    }
    expect(await prisma.documentChunk.count()).toBe(1);
  });

  it('threshold: drops vector-only hits below the minimum similarity and keeps those above', async () => {
    await addDocument(coop, 'Bylaws', [
      'asamblea general ordinaria cada junio',
      'cultivo de olivos y almendros',
    ]);

    const all = await search('asamblea general ordinaria', { minVectorScore: 0 });
    const strict = await search('asamblea general ordinaria', { minVectorScore: 0.5 });

    expect(all.length).toBeGreaterThan(strict.length);
    expect(strict.map((hit) => hit.page)).toEqual([1]);
    expect(strict.every((hit) => hit.score >= 0.5)).toBe(true);
  });

  it('threshold: an irrelevant query (no shared term, low similarity) returns nothing', async () => {
    await addDocument(coop, 'Bylaws', ['asamblea general ordinaria cada junio']);

    expect(await search('paella valenciana receta', { minVectorScore: 0.3 })).toEqual([]);
  });

  it('fuses both arms: a fragment found by both outranks one found by only one', async () => {
    await addDocument(coop, 'Regulation', [
      'riego nocturno turnos agua',
      'riego diurno',
      'turnos de vigilancia',
    ]);

    const hits = await search('riego nocturno turnos');

    expect(hits[0]?.page).toBe(1);
    expect(new Set(hits.map((hit) => hit.page)).size).toBe(hits.length);
  });

  it('respects the limit', async () => {
    await addDocument(
      coop,
      'Many',
      Array.from({ length: 8 }, (_, i) => `riego numero ${i} del reglamento`),
    );

    expect(await search('riego reglamento', { limit: 3 })).toHaveLength(3);
    expect(await search('riego reglamento', { limit: 5 })).toHaveLength(5);
  });

  it('NFR-DOC-03, BR-AI-04: never returns another cooperative or an unpublished document, by either arm', async () => {
    await addDocument(sea, 'Sea bylaws', ['riego nocturno turnos agua exclusivo marea']);
    await addDocument(coop, 'Withdrawn', ['riego nocturno turnos agua retirado'], 'withdrawn');

    const text = 'riego nocturno turnos agua exclusivo marea retirado';
    for (const minVectorScore of [0, 0.99]) {
      expect(await search(text, { minVectorScore })).toEqual([]);
    }
    expect((await search(text, { cooperativeId: sea })).map((hit) => hit.title)).toEqual([
      'Sea bylaws',
    ]);
  });

  it('generated column: raw INSERTs fill the tsvector and a new indexing replaces the old one', async () => {
    const document = await addDocument(coop, 'Bylaws', ['alfa beta']);
    const rows = await prisma.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM "DocumentChunk" WHERE "contentTsv" @@ to_tsquery('spanish', 'beta')`;
    expect(rows[0]?.n).toBe(1);

    const index = new PgVectorFragmentIndex(prisma, { minVectorScore: 0 });
    const [embedding] = await embedder.embed(['gamma'], 'document');
    await index.replaceDocument(coop, document.id, randomUUID(), [
      { page: 1, position: 0, content: 'gamma', embedding: embedding! },
    ]);
    expect(await search('beta', { minVectorScore: 0.99 })).toEqual([]);
  });
});
