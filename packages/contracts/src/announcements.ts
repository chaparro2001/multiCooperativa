import { z } from 'zod';

export const announcementStatusSchema = z.enum(['borrador', 'publicado', 'retirado']);

const isoDate = z.iso.datetime();

/** Lo que devuelven crear, editar, publicar y retirar. */
export const announcementSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  /** Texto plano: la app lo muestra tal cual, sin interpretar HTML (RNF-COM-02). */
  body: z.string(),
  status: announcementStatusSchema,
  pinned: z.boolean(),
  createdAt: isoDate,
  publishedAt: isoDate.nullable(),
  /** Si no es nulo, la app lo muestra como «editado» (HU-COM-05). */
  editedAt: isoDate.nullable(),
});

export const announcementSummarySchema = announcementSchema.omit({ body: true }).extend({
  authorName: z.string().nullable(),
  attachmentCount: z.number().int().min(0),
  /** HU-COM-02: leído por quien consulta. */
  read: z.boolean(),
});

/** GET /cooperativas/{id}/comunicados?offset=N: páginas de 20 (HU-COM-02). */
export const listAnnouncementsQuerySchema = z.object({
  offset: z.coerce.number().int().min(0).default(0),
});

export const listAnnouncementsResponseSchema = z.object({
  items: z.array(announcementSummarySchema),
  /** Offset de la página siguiente, o nulo si no hay más. */
  nextOffset: z.number().int().nullable(),
});

export const announcementAttachmentSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  size: z.number().int(),
});

/** GET /cooperativas/{id}/comunicados/{comunicadoId}: registra la lectura (HU-COM-03). */
export const announcementDetailSchema = announcementSchema.extend({
  authorName: z.string().nullable(),
  /** `url` firmada que caduca a los 5 minutos (RNF-COM-03): se pide de nuevo al abrir. */
  attachments: z.array(announcementAttachmentSchema.extend({ url: z.url() })),
  /** HU-COM-07: solo con gestión y una vez publicado. */
  readStats: z.object({ readCount: z.number().int(), activeMembers: z.number().int() }).nullable(),
});

/** POST /cooperativas/{id}/comunicados: un borrador puede ir incompleto (RN-COM-04 se exige al publicar). */
export const createAnnouncementRequestSchema = z.object({
  title: z.string().max(120),
  body: z.string().max(5000),
});

/** PATCH /cooperativas/{id}/comunicados/{comunicadoId}: editar (HU-COM-05) y fijar (HU-COM-06). */
export const updateAnnouncementRequestSchema = z
  .strictObject({
    title: z.string().max(120).optional(),
    body: z.string().max(5000).optional(),
    pinned: z.boolean().optional(),
  })
  .refine((changes) => Object.keys(changes).length > 0, { message: 'Nada que cambiar' });

export type AnnouncementStatus = z.infer<typeof announcementStatusSchema>;
export type Announcement = z.infer<typeof announcementSchema>;
export type AnnouncementSummary = z.infer<typeof announcementSummarySchema>;
export type ListAnnouncementsResponse = z.infer<typeof listAnnouncementsResponseSchema>;
export type AnnouncementAttachment = z.infer<typeof announcementAttachmentSchema>;
export type AnnouncementDetail = z.infer<typeof announcementDetailSchema>;
export type CreateAnnouncementRequest = z.infer<typeof createAnnouncementRequestSchema>;
export type UpdateAnnouncementRequest = z.infer<typeof updateAnnouncementRequestSchema>;
