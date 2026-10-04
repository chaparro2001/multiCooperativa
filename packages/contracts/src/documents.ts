import { z } from 'zod';

export const documentCategorySchema = z.enum([
  'estatutos',
  'reglamento',
  'actas',
  'cuentas',
  'otros',
]);
export const documentStatusSchema = z.enum(['publicado', 'retirado']);
/** HU-DOC-06: si el asistente ya conoce el documento. */
export const indexingStatusSchema = z.enum(['pendiente', 'indexado', 'error', 'no_indexable']);

const day = z.iso.date();

export const documentSummarySchema = z.object({
  id: z.uuid(),
  title: z.string(),
  category: documentCategorySchema,
  /** Día del documento (p. ej. de la reunión de un acta), AAAA-MM-DD. */
  documentDate: day,
  status: documentStatusSchema,
  /** Tamaño de la versión vigente, en bytes. */
  size: z.number().int(),
  /** Solo con gestión; nulo con consulta. */
  indexingStatus: indexingStatusSchema.nullable(),
});

/** GET /cooperativas/{id}/documentos?categoria=…&q=…: por fecha descendente (HU-DOC-02). */
export const listDocumentsQuerySchema = z.object({
  categoria: documentCategorySchema.optional(),
  q: z.string().max(150).optional(),
});

export const listDocumentsResponseSchema = z.object({ items: z.array(documentSummarySchema) });

/** GET /cooperativas/{id}/documentos/{documentoId}: la versión vigente (HU-DOC-03). */
export const documentDetailSchema = documentSummarySchema.extend({
  fileName: z.string(),
  updatedAt: z.iso.datetime(),
  /** URL firmada que caduca a los 5 minutos (RNF-DOC-02): se pide de nuevo al abrir. */
  url: z.url(),
  /** Motivo del error o de por qué no es indexable; solo con gestión. */
  indexingError: z.string().nullable(),
});

/** Campos de texto de POST /cooperativas/{id}/documentos (multipart, junto al campo «fichero»). */
export const uploadDocumentFieldsSchema = z.object({
  title: z.string().trim().min(1).max(150),
  category: documentCategorySchema,
  documentDate: day,
});

/** GET /cooperativas/{id}/documentos/{documentoId}/versiones (HU-DOC-04). */
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

/** GET /cooperativas/{id}/documentos/buscar?q=…: búsqueda por contenido (HU-DOC-07). */
export const searchDocumentsQuerySchema = z.object({
  q: z.string().trim().min(3).max(300),
});

export const documentSearchHitSchema = z.object({
  documentId: z.uuid(),
  title: z.string(),
  category: documentCategorySchema,
  /** Página donde aparece el fragmento, para citarla y abrir el visor en ella. */
  page: z.number().int().min(1),
  excerpt: z.string(),
  /** Similitud de 0 a 1: más alto, más relevante. */
  score: z.number(),
});

export const searchDocumentsResponseSchema = z.object({ items: z.array(documentSearchHitSchema) });

export type DocumentSearchHit = z.infer<typeof documentSearchHitSchema>;
export type SearchDocumentsResponse = z.infer<typeof searchDocumentsResponseSchema>;
