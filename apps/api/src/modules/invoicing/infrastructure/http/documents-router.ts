import {
  type DeliveryNoteDetail,
  deliveryNoteInputSchema,
  type InvoiceDetail,
  invoiceInputSchema,
  type InvoicingSummary,
  listDeliveryNotesQuerySchema,
  type ListDeliveryNotesResponse,
  listInvoicesQuerySchema,
  type ListInvoicesResponse,
  settleInvoiceRequestSchema,
  type ThirdPartySheet,
} from '@multicooperativa/contracts';
import { type Request, type RequestHandler, Router } from 'express';
import multer from 'multer';
import type { z } from 'zod';

import { getCooperativeContext, requirePermission } from '../../../access';
import { InvalidRequestError, parseBody } from '../../../../shared/infrastructure/http/validation';
import * as useCases from '../../application/documents';
import { formatQuantity } from '../../domain/money';
import { toAmounts, toDeliveryNote, toInvoice, toLine } from './mappers';
import { toThirdParty } from './third-parties-router';

/** multipart/form-data: the record as JSON in “data”, the original (PDF or photo) in “file”. */
function multipartRecord<T extends z.ZodType>(
  req: Request,
  schema: T,
): { data: z.infer<T>; file: useCases.UploadedFile | null } {
  let raw: unknown;
  try {
    raw = JSON.parse(String(req.body?.data ?? ''));
  } catch {
    throw new InvalidRequestError();
  }
  const file = req.file
    ? {
        name:
          Buffer.from(req.file.originalname, 'latin1')
            .toString('utf8')
            .split(/[\\/]/)
            .pop()
            ?.trim()
            .slice(0, 150) || 'document',
        content: new Uint8Array(req.file.buffer),
      }
    : null;
  return { data: parseBody(schema, raw), file };
}

function query<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new InvalidRequestError();
  return parsed.data;
}

/** US-INV-02/03/06/07 (requirements/05, section 8). */
export function createInvoicingDocumentsRouter(
  deps: useCases.InvoicingDeps,
  requireCooperative: RequestHandler,
): Router {
  const router = Router();
  const coop = '/cooperatives/:cooperativeId';
  const read = [requireCooperative, requirePermission('invoicing', 'read')];
  const manage = [requireCooperative, requirePermission('invoicing', 'manage')];
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: useCases.MAX_FILE_BYTES, files: 1, fields: 1, fieldSize: 512 * 1024 },
  }).single('file');
  const id = (req: Request, name: string) => String(req.params[name]);

  // ── Delivery notes ──

  router.get(`${coop}/delivery-notes`, ...read, async (req, res) => {
    const q = query(listDeliveryNotesQuerySchema, req.query);
    const notes = await useCases.listDeliveryNotes(deps, getCooperativeContext(res), {
      operation: q.operation,
      thirdPartyId: q.thirdParty,
      from: q.from,
      to: q.to,
      status: q.status,
    });
    res.json({ items: notes.map(toDeliveryNote) } satisfies ListDeliveryNotesResponse);
  });

  router.get(`${coop}/delivery-notes/:noteId`, ...read, async (req, res) => {
    const note = await useCases.getDeliveryNote(
      deps,
      getCooperativeContext(res),
      id(req, 'noteId'),
    );
    res.json({ ...toDeliveryNote(note), fileUrl: note.fileUrl } satisfies DeliveryNoteDetail);
  });

  router.post(`${coop}/delivery-notes`, ...manage, upload, async (req, res) => {
    const { data, file } = multipartRecord(req, deliveryNoteInputSchema);
    const note = await useCases.registerDeliveryNote(deps, getCooperativeContext(res), data, file);
    res.status(201).json(toDeliveryNote(note));
  });

  router.post(`${coop}/delivery-notes/:noteId/void`, ...manage, async (req, res) => {
    res.json(
      toDeliveryNote(
        await useCases.cancelNote(deps, getCooperativeContext(res), id(req, 'noteId')),
      ),
    );
  });

  // ── Invoices ──

  router.get(`${coop}/invoices`, ...read, async (req, res) => {
    const q = query(listInvoicesQuerySchema, req.query);
    const invoices = await useCases.listInvoices(deps, getCooperativeContext(res), {
      operation: q.operation,
      thirdPartyId: q.thirdParty,
      from: q.from,
      to: q.to,
      paymentStatus: q.status,
      reconciliationStatus: q.reconciliation,
    });
    res.json({ items: invoices.map(toInvoice) } satisfies ListInvoicesResponse);
  });

  // Before `/:invoiceId`, which would otherwise take “summary” as an id.
  router.get(`${coop}/invoices/summary`, ...read, async (_req, res) => {
    const result = await useCases.summary(deps, getCooperativeContext(res));
    res.json({
      toPay: toAmounts(result.toPay),
      toCollect: toAmounts(result.toCollect),
      openDiscrepancies: result.openDiscrepancies,
      staleDeliveryNotes: result.staleDeliveryNotes,
    } satisfies InvoicingSummary);
  });

  router.get(`${coop}/invoices/:invoiceId`, ...read, async (req, res) => {
    const invoice = await useCases.getInvoice(
      deps,
      getCooperativeContext(res),
      id(req, 'invoiceId'),
    );
    res.json({
      ...toInvoice(invoice),
      lines: invoice.lines.map(toLine),
      deliveryNotes: invoice.deliveryNotes,
      discrepancies: invoice.discrepancies.map((d) => ({
        id: d.id,
        concept: d.concept,
        unit: d.unit,
        deliveredQuantity: formatQuantity(d.deliveredQuantity),
        invoicedQuantity: formatQuantity(d.invoicedQuantity),
        explanation: d.explanation,
      })),
      fileUrl: invoice.fileUrl,
    } satisfies InvoiceDetail);
  });

  router.post(`${coop}/invoices`, ...manage, upload, async (req, res) => {
    const { data, file } = multipartRecord(req, invoiceInputSchema);
    const invoice = await useCases.registerInvoice(deps, getCooperativeContext(res), data, file);
    res.status(201).json(toInvoice(invoice));
  });

  router.post(`${coop}/invoices/:invoiceId/settle`, ...manage, async (req, res) => {
    const { date } = parseBody(settleInvoiceRequestSchema, req.body);
    res.json(
      toInvoice(
        await useCases.settleInvoice(deps, getCooperativeContext(res), id(req, 'invoiceId'), date),
      ),
    );
  });

  router.post(`${coop}/invoices/:invoiceId/void`, ...manage, async (req, res) => {
    res.json(
      toInvoice(
        await useCases.cancelInvoiceById(deps, getCooperativeContext(res), id(req, 'invoiceId')),
      ),
    );
  });

  // ── Third-party sheet (US-INV-06) ──

  router.get(`${coop}/third-parties/:thirdPartyId`, ...read, async (req, res) => {
    const sheet = await useCases.thirdPartySheet(
      deps,
      getCooperativeContext(res),
      id(req, 'thirdPartyId'),
    );
    res.json({
      ...toThirdParty(sheet.party),
      deliveryNotes: sheet.deliveryNotes.map(toDeliveryNote),
      invoices: sheet.invoices.map(toInvoice),
      balance: {
        toPay: toAmounts(sheet.balance.toPay),
        toCollect: toAmounts(sheet.balance.toCollect),
      },
    } satisfies ThirdPartySheet);
  });

  return router;
}
