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
  index = new PgVectorFragmentIndex(prisma, { minVectorScore: 0, minTextScore: 0 }),
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
      section: null,
      contextHeader: '',
      embedding: embeddings[position]!,
    })),
  );
  return document;
}

async function search(
  text: string,
  options: {
    minVectorScore?: number;
    minTextScore?: number;
    limit?: number;
    cooperativeId?: string;
  } = {},
) {
  const index = new PgVectorFragmentIndex(prisma, {
    minVectorScore: options.minVectorScore ?? 0,
    minTextScore: options.minTextScore ?? 0,
  });
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

  it('term coverage: a fragment matching 2 of 3 terms is found by the text arm although the vector threshold blocks it', async () => {
    await addDocument(coop, 'Minutes', ['Se aprobo el presupuesto de la campana de aceituna.']);

    const hits = await search('presupuesto campana vacaciones', { minVectorScore: 0.99 });

    expect(hits).toHaveLength(1);
  });

  it('term coverage: an irrelevant question sharing only one common word with a fragment returns nothing', async () => {
    await addDocument(coop, 'Bylaws', ['El socio debe pagar la cuota anual en enero.']);

    for (const text of [
      'edad minima para ser socio',
      'receta de paella para el socio',
      'quien ganara el mundial segun cada socio',
    ]) {
      expect(await search(text, { minVectorScore: 0.99 })).toEqual([]);
    }
  });

  it('NFR-DOC-05 benchmark arms: the text arm alone drops what only the vector arm finds, and vice versa', async () => {
    await addDocument(coop, 'Minutes', [
      'Se aprobo el presupuesto de la campana de aceituna.',
      'Otros asuntos generales sin relacion alguna con lo anterior.',
    ]);
    const index = new PgVectorFragmentIndex(prisma, { minVectorScore: 0, minTextScore: 0 });
    const [embedding] = await embedder.embed(['presupuesto campana'], 'query');
    const base = { text: 'presupuesto campana', embedding: embedding! };

    const text = await index.search(coop, { ...base, arm: 'text' }, 5);
    const vector = await index.search(coop, { ...base, arm: 'vector' }, 5);

    expect(text.map((hit) => hit.page)).toEqual([1]);
    expect(vector).toHaveLength(2);
  });

  it('ADR-023 accent-insensitive text arm: accents on either side match the same lexemes', async () => {
    await addDocument(coop, 'Bylaws', [
      'El quórum de la asamblea extraordinaria es de dos tercios.',
      'Articulo 9. Cuota de ingreso de los socios.',
      'Otros asuntos generales sin relacion alguna con lo anterior.',
    ]);

    for (const [text, page] of [
      ['quorum', 1],
      ['quórum', 1],
      ['asamblea extraordinária', 1],
      ['artículo 9', 2],
    ] as const) {
      const hits = await search(text, { minVectorScore: 0.99 });
      expect(
        hits.map((hit) => hit.page),
        text,
      ).toEqual([page]);
    }
  });

  it('ADR-023 diversity: a second document takes a place from a third fragment of the first', async () => {
    await addDocument(coop, 'Long bylaws', [
      'cuota anual socio uno',
      'cuota anual socio dos',
      'cuota anual socio tres',
    ]);
    await addDocument(coop, 'Regulation', ['cuota anual socio cuatro']);

    const hits = await search('cuota anual socio', { limit: 3 });

    expect(hits.map((hit) => hit.title).sort()).toEqual([
      'Long bylaws',
      'Long bylaws',
      'Regulation',
    ]);
  });

  it('ADR-023 neighbours: returns the fragments right before and after, of the same cooperative only', async () => {
    const document = await addDocument(coop, 'Bylaws', ['uno', 'dos', 'tres', 'cuatro']);
    await addDocument(sea, 'Other', ['uno', 'dos', 'tres']);
    const index = new PgVectorFragmentIndex(prisma, { minVectorScore: 0, minTextScore: 0 });

    const found = await index.neighbours(coop, [{ documentId: document.id, position: 1 }]);

    expect(found.map((n) => n.content).sort()).toEqual(['tres', 'uno']);
    expect(await index.neighbours(coop, [])).toEqual([]);
  });

  it('term coverage: a single-term query still finds the fragment, and two distinct terms are needed from 2 up', async () => {
    await addDocument(coop, 'Bylaws', ['El quorum de la asamblea es la mitad mas uno.']);

    expect(await search('quorum', { minVectorScore: 0.99 })).toHaveLength(1);
    expect(await search('quorum cosecha', { minVectorScore: 0.99 })).toEqual([]);
    expect(await search('quorum asamblea', { minVectorScore: 0.99 })).toHaveLength(1);
  });

  it('text floor: a text hit below the minimum similarity is dropped; above it, kept', async () => {
    await addDocument(coop, 'Minutes', [
      'presupuesto campana aceituna junto con muchisimas otras palabras distintas sin relacion alguna para bajar la similitud coseno del fragmento',
    ]);
    const [hit] = await search('presupuesto campana', { minVectorScore: 0.99 });
    expect(hit).toBeDefined();

    expect(
      await search('presupuesto campana', {
        minVectorScore: 0.99,
        minTextScore: hit!.score - 0.01,
      }),
    ).toHaveLength(1);
    expect(
      await search('presupuesto campana', {
        minVectorScore: 0.99,
        minTextScore: hit!.score + 0.01,
      }),
    ).toEqual([]);
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

    const all = await search('asamblea general ordinaria', { minVectorScore: 0, minTextScore: 0 });
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

    const index = new PgVectorFragmentIndex(prisma, { minVectorScore: 0, minTextScore: 0 });
    const [embedding] = await embedder.embed(['gamma'], 'document');
    await index.replaceDocument(coop, document.id, randomUUID(), [
      {
        page: 1,
        position: 0,
        content: 'gamma',
        section: null,
        contextHeader: '',
        embedding: embedding!,
      },
    ]);
    expect(await search('beta', { minVectorScore: 0.99 })).toEqual([]);
  });
});
