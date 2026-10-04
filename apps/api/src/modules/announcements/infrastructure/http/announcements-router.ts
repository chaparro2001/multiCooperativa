import {
  type Announcement,
  type AnnouncementDetail,
  type AnnouncementAttachment,
  createAnnouncementRequestSchema,
  listAnnouncementsQuerySchema,
  type ListAnnouncementsResponse,
  updateAnnouncementRequestSchema,
} from '@multicooperativa/contracts';
import { type RequestHandler, Router } from 'express';
import multer from 'multer';

import { getCooperativeContext, requirePermission } from '../../../access';
import { InvalidRequestError, parseBody } from '../../../../shared/infrastructure/http/validation';
import type { AnnouncementDeps } from '../../application/announcements';
import * as useCases from '../../application/announcements';
import type { AnnouncementRecord } from '../../application/ports/announcement-store';
import { MAX_ATTACHMENT_BYTES } from '../../domain/announcement';

const iso = (date: Date | null) => date?.toISOString() ?? null;

function toAnnouncement(record: AnnouncementRecord): Announcement {
  return {
    id: record.id,
    title: record.title,
    body: record.body,
    status: record.status,
    pinned: record.pinned,
    createdAt: record.createdAt.toISOString(),
    publishedAt: iso(record.publishedAt),
    editedAt: iso(record.editedAt),
  };
}

/** Busboy reads multipart file names as latin1; the app sends UTF-8 («Acta de año.pdf»). */
function originalName(name: string): string {
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  const base = decoded.split(/[\\/]/).pop()?.trim() || 'adjunto.pdf';
  return base.slice(0, 200);
}

/** HTTP adapter of the announcements module (requisitos/02, section 6). */
export function createAnnouncementsRouter(
  deps: AnnouncementDeps,
  requireCooperative: RequestHandler,
): Router {
  const router = Router();
  const base = '/cooperativas/:cooperativeId/comunicados';
  const read = [requireCooperative, requirePermission('comunicados', 'consulta')];
  const manage = [requireCooperative, requirePermission('comunicados', 'gestion')];
  // In memory with a hard limit: RN-COM-05 caps attachments at 10 MB.
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_ATTACHMENT_BYTES, files: 1, fields: 0 },
  });

  router.get(base, ...read, async (req, res) => {
    const { offset } = listAnnouncementsQuerySchema.parse(req.query);
    const page = await useCases.listAnnouncements(deps, getCooperativeContext(res), offset);
    res.json({
      items: page.items.map((item) => ({
        id: item.id,
        title: item.title,
        status: item.status,
        pinned: item.pinned,
        createdAt: item.createdAt.toISOString(),
        publishedAt: iso(item.publishedAt),
        editedAt: iso(item.editedAt),
        authorName: item.authorName,
        attachmentCount: item.attachmentCount,
        read: item.read,
      })),
      nextOffset: page.nextOffset,
    } satisfies ListAnnouncementsResponse);
  });

  router.get(`${base}/:announcementId`, ...read, async (req, res) => {
    const detail = await useCases.getAnnouncement(
      deps,
      getCooperativeContext(res),
      String(req.params.announcementId),
    );
    res.json({
      ...toAnnouncement(detail),
      authorName: detail.authorName,
      attachments: detail.attachments,
      readStats: detail.readStats,
    } satisfies AnnouncementDetail);
  });

  router.post(base, ...manage, async (req, res) => {
    const input = parseBody(createAnnouncementRequestSchema, req.body);
    const created = await useCases.createAnnouncement(deps, getCooperativeContext(res), input);
    res.status(201).json(toAnnouncement(created));
  });

  router.patch(`${base}/:announcementId`, ...manage, async (req, res) => {
    const changes = parseBody(updateAnnouncementRequestSchema, req.body);
    const updated = await useCases.updateAnnouncement(
      deps,
      getCooperativeContext(res),
      String(req.params.announcementId),
      changes,
    );
    res.json(toAnnouncement(updated));
  });

  router.post(`${base}/:announcementId/publicar`, ...manage, async (req, res) => {
    const published = await useCases.publishAnnouncement(
      deps,
      getCooperativeContext(res),
      String(req.params.announcementId),
    );
    res.json(toAnnouncement(published));
  });

  router.post(`${base}/:announcementId/retirar`, ...manage, async (req, res) => {
    const withdrawn = await useCases.withdrawAnnouncement(
      deps,
      getCooperativeContext(res),
      String(req.params.announcementId),
    );
    res.json(toAnnouncement(withdrawn));
  });

  // multipart/form-data with the PDF in the «fichero» field.
  router.post(
    `${base}/:announcementId/adjuntos`,
    ...manage,
    upload.single('fichero'),
    async (req, res) => {
      if (!req.file) throw new InvalidRequestError();
      const attachment = await useCases.addAttachment(
        deps,
        getCooperativeContext(res),
        String(req.params.announcementId),
        { name: originalName(req.file.originalname), content: new Uint8Array(req.file.buffer) },
      );
      res.status(201).json(attachment satisfies AnnouncementAttachment);
    },
  );

  return router;
}
