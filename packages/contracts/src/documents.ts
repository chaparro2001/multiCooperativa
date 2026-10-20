import { z } from 'zod';

export const documentCategorySchema = z.enum([
  'bylaws',
  'regulations',
  'minutes',
  'accounts',
  'other',
]);
export const documentStatusSchema = z.enum(['published', 'withdrawn']);
/** US-DOC-06: whether the assistant already knows the document. */
export const indexingStatusSchema = z.enum(['pending', 'indexed', 'error', 'not_indexable']);

const day = z.iso.date();

export const documentSummarySchema = z.object({
  id: z.uuid(),
  title: z.string(),
  category: documentCategorySchema,
  /** Date of the document (e.g. the meeting of the minutes), YYYY-MM-DD. */
  documentDate: day,
  status: documentStatusSchema,
  /** Size of the current version, in bytes. */
  size: z.number().int(),
  /** Only with manage access; null with read access. */
  indexingStatus: indexingStatusSchema.nullable(),
});

/** GET /cooperatives/{id}/documents?category=…&q=…: by date descending (US-DOC-02). */
export const listDocumentsQuerySchema = z.object({
  category: documentCategorySchema.optional(),
  q: z.string().max(150).optional(),
});

export const listDocumentsResponseSchema = z.object({ items: z.array(documentSummarySchema) });

/** GET /cooperatives/{id}/documents/{documentId}: the current version (US-DOC-03). */
export const documentDetailSchema = documentSummarySchema.extend({
  fileName: z.string(),
  updatedAt: z.iso.datetime(),
  /** Signed URL that expires after 5 minutes (NFR-DOC-02): requested again on open. */
  url: z.url(),
  /** Reason for the error or for not being indexable; only with manage access. */
  indexingError: z.string().nullable(),
});

/** Text fields of POST /cooperatives/{id}/documents (multipart, next to the `file` field). */
export const uploadDocumentFieldsSchema = z.object({
  title: z.string().trim().min(1).max(150),
  category: documentCategorySchema,
  documentDate: day,
});

/** GET /cooperatives/{id}/documents/{documentId}/versions (US-DOC-04). */
export const documentVersionSchema = z.object({
  id: z.uuid(),
  fileName: z.string(),
  size: z.number().int(),
  isCurrent: z.boolean(),
  indexingStatus: indexingStatusSchema,
  uploadedAt: z.iso.datetime(),
  uploadedByName: z.string().nullable(),
});

export const listDocumentVersionsResponseSchema = z.object({
  versions: z.array(documentVersionSchema),
});

export type DocumentCategory = z.infer<typeof documentCategorySchema>;
export type IndexingStatus = z.infer<typeof indexingStatusSchema>;
export type DocumentSummary = z.infer<typeof documentSummarySchema>;
export type ListDocumentsResponse = z.infer<typeof listDocumentsResponseSchema>;
export type DocumentDetail = z.infer<typeof documentDetailSchema>;
export type UploadDocumentFields = z.infer<typeof uploadDocumentFieldsSchema>;
export type DocumentVersion = z.infer<typeof documentVersionSchema>;
export type ListDocumentVersionsResponse = z.infer<typeof listDocumentVersionsResponseSchema>;

/** GET /cooperatives/{id}/documents/search?q=…: content search (US-DOC-07). */
export const searchDocumentsQuerySchema = z.object({
  q: z.string().trim().min(3).max(300),
});

export const documentSearchHitSchema = z.object({
  documentId: z.uuid(),
  title: z.string(),
  category: documentCategorySchema,
  /** Page where the excerpt appears, to cite it and open the viewer on it. */
  page: z.number().int().min(1),
  excerpt: z.string(),
  /** Similarity from 0 to 1: the higher, the more relevant. */
  score: z.number(),
});

export const searchDocumentsResponseSchema = z.object({ items: z.array(documentSearchHitSchema) });

export type DocumentSearchHit = z.infer<typeof documentSearchHitSchema>;
export type SearchDocumentsResponse = z.infer<typeof searchDocumentsResponseSchema>;
