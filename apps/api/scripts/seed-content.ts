/**
 * Sample documents and announcements for the hosted demo, loaded THROUGH THE API as the
 * administrator of "Cooperativa Agrícola San Isidro": the same upload path as any user, so the
 * files land in the configured storage and are indexed with the configured embeddings provider
 * (ADR-006 / ADR-010). Run `db:seed` first (it creates the users).
 *
 *   API_URL=https://multicooperativa-api.onrender.com SEED_PASSWORD='…' \
 *     pnpm --filter @multicooperativa/api db:seed:content
 *
 * Idempotent: documents and announcements whose title already exists are skipped. A cold API
 * takes about a minute to answer the first request. Vectors of different providers are not
 * comparable: never index here and search against another environment.
 */
import {
  announcementSummarySchema,
  authTokensSchema,
  documentSummarySchema,
  meResponseSchema,
} from '@multicooperativa/contracts';
import { z } from 'zod';

import { buildSamplePdf, SAMPLE_ANNOUNCEMENTS, SAMPLE_DOCUMENTS } from '../src/dev/sample-content';

const ADMIN_EMAIL = 'admin@sanisidro.test';
const DEMO_PASSWORD = 'demo-cooperativa-2026';
const INDEXING_TIMEOUT_MS = 180_000;

const apiUrl = process.env.API_URL?.replace(/\/+$/, '');
if (!apiUrl) {
  console.error('Set API_URL to the base URL of the API (no trailing slash).');
  process.exit(1);
}
const password = process.env.SEED_PASSWORD || DEMO_PASSWORD;

async function call<S extends z.ZodType>(
  schema: S,
  path: string,
  init: RequestInit = {},
  token?: string,
): Promise<z.infer<S>> {
  const response = await fetch(`${apiUrl}${path}`, {
    ...init,
    signal: AbortSignal.timeout(120_000),
    headers: {
      Accept: 'application/json',
      ...(init.body && !(init.body instanceof FormData) && { 'Content-Type': 'application/json' }),
      ...(token && { Authorization: `Bearer ${token}` }),
    },
  });
  if (!response.ok) {
    throw new Error(
      `${init.method ?? 'GET'} ${path} -> ${response.status} ${await response.text()}`,
    );
  }
  return schema.parse(await response.json());
}

// First call: wakes a sleeping free instance.
console.log(`Waiting for ${apiUrl}/health (a cold start takes about a minute)...`);
await fetch(`${apiUrl}/health`, { signal: AbortSignal.timeout(180_000) });

const { accessToken } = await call(authTokensSchema, '/auth/login', {
  method: 'POST',
  body: JSON.stringify({ email: ADMIN_EMAIL, password }),
});
const me = await call(meResponseSchema, '/me', {}, accessToken);
const membership = me.memberships.find((m) => m.cooperativeName.includes('San Isidro'));
if (!membership) throw new Error('San Isidro not found: run db:seed first.');
const base = `/cooperatives/${membership.cooperativeId}`;

const existingDocuments = await call(
  z.object({ items: z.array(documentSummarySchema) }),
  `${base}/documents`,
  {},
  accessToken,
);
const uploaded: string[] = [];
for (const sample of SAMPLE_DOCUMENTS) {
  if (existingDocuments.items.some((d) => d.title === sample.title)) {
    console.log(`Document already there: ${sample.title}`);
    continue;
  }
  const form = new FormData();
  form.append('title', sample.title);
  form.append('category', sample.category);
  form.append('documentDate', sample.documentDate);
  form.append(
    'file',
    new Blob([Buffer.from(await buildSamplePdf(sample))], { type: 'application/pdf' }),
    `${sample.title}.pdf`,
  );
  const created = await call(
    documentSummarySchema,
    `${base}/documents`,
    { method: 'POST', body: form },
    accessToken,
  );
  uploaded.push(created.id);
  console.log(`Uploaded: ${sample.title}`);
}

const existingAnnouncements = await call(
  z.object({ items: z.array(announcementSummarySchema) }),
  `${base}/announcements`,
  {},
  accessToken,
);
for (const sample of SAMPLE_ANNOUNCEMENTS) {
  if (existingAnnouncements.items.some((a) => a.title === sample.title)) {
    console.log(`Announcement already there: ${sample.title}`);
    continue;
  }
  const draft = await call(
    z.object({ id: z.uuid() }),
    `${base}/announcements`,
    { method: 'POST', body: JSON.stringify(sample) },
    accessToken,
  );
  await call(
    z.object({ id: z.uuid() }),
    `${base}/announcements/${draft.id}/publish`,
    { method: 'POST' },
    accessToken,
  );
  console.log(`Published: ${sample.title}`);
}

// Indexing is asynchronous: wait so that a failing embeddings provider is noticed now.
const deadline = Date.now() + INDEXING_TIMEOUT_MS;
let failed = false;
for (const id of uploaded) {
  for (;;) {
    const { indexingStatus, indexingError } = await call(
      z.object({ indexingStatus: z.string().nullable(), indexingError: z.string().nullable() }),
      `${base}/documents/${id}`,
      {},
      accessToken,
    );
    if (indexingStatus === 'indexed') break;
    if (indexingStatus === 'error' || indexingStatus === 'not_indexable') {
      console.error(`Indexing ${id}: ${indexingStatus} (${indexingError ?? 'no detail'})`);
      failed = true;
      break;
    }
    if (Date.now() > deadline) {
      console.error(`Indexing ${id} did not finish in time.`);
      failed = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}
console.log(failed ? 'Done, with indexing problems.' : 'Done.');
process.exit(failed ? 1 : 0);
