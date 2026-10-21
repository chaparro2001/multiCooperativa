import { z } from 'zod';

export const announcementStatusSchema = z.enum(['draft', 'published', 'withdrawn']);

const isoDate = z.iso.datetime();

/** What create, edit, publish and withdraw return. */
export const announcementSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  /** Plain text: the app shows it as is, without interpreting HTML (NFR-ANN-02). */
  body: z.string(),
  status: announcementStatusSchema,
  pinned: z.boolean(),
  createdAt: isoDate,
  publishedAt: isoDate.nullable(),
  /** If not null, the app shows it as "edited" (US-ANN-05). */
  editedAt: isoDate.nullable(),
});

export const announcementSummarySchema = announcementSchema.omit({ body: true }).extend({
  authorName: z.string().nullable(),
  attachmentCount: z.number().int().min(0),
  /** US-ANN-02: read by the requester. */
  read: z.boolean(),
});

/** GET /cooperatives/{id}/announcements?offset=N: pages of 20 (US-ANN-02). */
export const listAnnouncementsQuerySchema = z.object({
  offset: z.coerce.number().int().min(0).default(0),
});

export const listAnnouncementsResponseSchema = z.object({
  items: z.array(announcementSummarySchema),
  /** Offset of the next page, or null if there are no more. */
  nextOffset: z.number().int().nullable(),
});

export const announcementAttachmentSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  size: z.number().int(),
});

/** GET /cooperatives/{id}/announcements/{announcementId}: records the read (US-ANN-03). */
export const announcementDetailSchema = announcementSchema.extend({
  authorName: z.string().nullable(),
  /** Signed `url` that expires after 5 minutes (NFR-ANN-03): requested again on open. */
  attachments: z.array(announcementAttachmentSchema.extend({ url: z.url() })),
  /** US-ANN-07: only with manage access and once published. */
  readStats: z.object({ readCount: z.number().int(), activeMembers: z.number().int() }).nullable(),
});

/** POST /cooperatives/{id}/announcements: a draft may be incomplete (BR-ANN-04 is enforced on publish). */
export const createAnnouncementRequestSchema = z.object({
  title: z.string().max(120),
  body: z.string().max(5000),
});

/** PATCH /cooperatives/{id}/announcements/{announcementId}: edit (US-ANN-05) and pin (US-ANN-06). */
export const updateAnnouncementRequestSchema = z
  .strictObject({
    title: z.string().max(120).optional(),
    body: z.string().max(5000).optional(),
    pinned: z.boolean().optional(),
  })
  .refine((changes) => Object.keys(changes).length > 0, { message: 'Nothing to change' });

export type AnnouncementStatus = z.infer<typeof announcementStatusSchema>;
export type Announcement = z.infer<typeof announcementSchema>;
export type AnnouncementSummary = z.infer<typeof announcementSummarySchema>;
export type ListAnnouncementsResponse = z.infer<typeof listAnnouncementsResponseSchema>;
export type AnnouncementAttachment = z.infer<typeof announcementAttachmentSchema>;
export type AnnouncementDetail = z.infer<typeof announcementDetailSchema>;
export type CreateAnnouncementRequest = z.infer<typeof createAnnouncementRequestSchema>;
export type UpdateAnnouncementRequest = z.infer<typeof updateAnnouncementRequestSchema>;

/** GET /announcements/unread-count: published announcements the caller has not opened yet (US-ANN-08). */
export const announcementsUnreadSchema = z.object({ unread: z.number().int().min(0) });
export type AnnouncementsUnread = z.infer<typeof announcementsUnreadSchema>;
