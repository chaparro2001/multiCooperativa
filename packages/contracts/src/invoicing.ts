import { z } from 'zod';

/** Importes en euros como cadena con 2 decimales como máximo: nunca number (RN-FAC-13). */
export const moneySchema = z.string().regex(/^-?\d+(\.\d{1,2})?$/, 'Importe con hasta 2 decimales');
/** Cantidades con hasta 3 decimales, como cadena. */
export const quantitySchema = z
  .string()
  .regex(/^\d+(\.\d{1,3})?$/, 'Cantidad con hasta 3 decimales');
export const vatRateSchema = z.string().regex(/^\d{1,3}(\.\d{1,2})?$/, 'Tipo de IVA');
const day = z.iso.date();

export const operationSchema = z.enum(['compra', 'venta']);

// ── Terceros (HU-FAC-01) ──

export const thirdPartySchema = z.object({
  id: z.uuid(),
  nif: z.string(),
  name: z.string(),
  isSupplier: z.boolean(),
  isCustomer: z.boolean(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  active: z.boolean(),
});

export const thirdPartyInputSchema = z.object({
  nif: z.string().trim().min(1).max(20),
  name: z.string().max(200),
  isSupplier: z.boolean(),
  isCustomer: z.boolean(),
  email: z.string().trim().max(200).nullable().default(null),
  phone: z.string().trim().max(30).nullable().default(null),
});

/** PATCH /terceros/{id}: el NIF no se edita; `active: false` lo desactiva (RN-FAC-14). */
export const thirdPartyUpdateSchema = thirdPartyInputSchema.omit({ nif: true }).extend({
  active: z.boolean(),
});

/** GET /terceros?tipo=proveedor|cliente&q=…&inactivos=true */
export const listThirdPartiesQuerySchema = z.object({
  tipo: z.enum(['proveedor', 'cliente']).optional(),
  q: z.string().max(100).optional(),
  inactivos: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});

export const listThirdPartiesResponseSchema = z.object({ items: z.array(thirdPartySchema) });

export type Operation = z.infer<typeof operationSchema>;
export type ThirdParty = z.infer<typeof thirdPartySchema>;
export type ThirdPartyInput = z.infer<typeof thirdPartyInputSchema>;
export type ThirdPartyUpdate = z.infer<typeof thirdPartyUpdateSchema>;
export type ListThirdPartiesResponse = z.infer<typeof listThirdPartiesResponseSchema>;
export { day as daySchema };

// ── Albaranes y facturas (HU-FAC-02, HU-FAC-03, HU-FAC-06, HU-FAC-07) ──

export const deliveryNoteStatusSchema = z.enum(['pendiente_facturar', 'facturado', 'anulado']);
export const paymentStatusSchema = z.enum(['pendiente', 'vencida', 'liquidada', 'anulada']);
export const reconciliationStatusSchema = z.enum([
  'sin_albaranes',
  'conciliada',
  'con_discrepancia',
]);

export const lineSchema = z.object({
  concept: z.string().max(200),
  quantity: quantitySchema,
  unit: z.string().max(20),
});

const partyRefSchema = z.object({ id: z.uuid(), name: z.string(), nif: z.string() });

/** Campo `datos` (JSON) de POST /albaranes, junto al fichero opcional en `fichero`. */
export const deliveryNoteInputSchema = z.object({
  thirdPartyId: z.uuid(),
  operation: operationSchema,
  number: z.string().max(50),
  date: day,
  lines: z.array(lineSchema).min(1).max(100),
});

export const deliveryNoteSchema = z.object({
  id: z.uuid(),
  thirdParty: partyRefSchema,
  operation: operationSchema,
  number: z.string(),
  date: day,
  status: deliveryNoteStatusSchema,
  invoiceId: z.uuid().nullable(),
  lines: z.array(lineSchema),
  fileName: z.string().nullable(),
});

export const deliveryNoteDetailSchema = deliveryNoteSchema.extend({
  /** Original (foto o PDF) con URL firmada de 5 minutos (RNF-FAC-02). */
  fileUrl: z.url().nullable(),
});

/** Campo `datos` (JSON) de POST /facturas, junto al PDF opcional en `fichero`. */
export const invoiceInputSchema = z.object({
  thirdPartyId: z.uuid(),
  operation: operationSchema,
  number: z.string().max(50),
  issueDate: day,
  dueDate: day,
  base: moneySchema,
  vatRate: vatRateSchema,
  total: moneySchema,
  /** Necesarias si agrupa albaranes, para conciliar por concepto (RN-FAC-08). */
  lines: z.array(lineSchema).max(100).default([]),
  deliveryNoteIds: z.array(z.uuid()).max(100).default([]),
});

export const invoiceSchema = z.object({
  id: z.uuid(),
  thirdParty: partyRefSchema,
  operation: operationSchema,
  number: z.string(),
  issueDate: day,
  dueDate: day,
  base: moneySchema,
  vatRate: vatRateSchema,
  total: moneySchema,
  paymentStatus: paymentStatusSchema,
  reconciliationStatus: reconciliationStatusSchema,
  settledAt: day.nullable(),
  discrepancyCount: z.number().int(),
});

export const invoiceDetailSchema = invoiceSchema.extend({
  lines: z.array(lineSchema),
  deliveryNotes: z.array(z.object({ id: z.uuid(), number: z.string(), date: day })),
  /** Detalle numérico por concepto, que es el que manda; la explicación la redacta la IA (RN-FAC-12). */
  discrepancies: z.array(
    z.object({
      id: z.uuid(),
      concept: z.string(),
      unit: z.string(),
      deliveredQuantity: quantitySchema,
      invoicedQuantity: quantitySchema,
      explanation: z.string().nullable(),
    }),
  ),
  fileUrl: z.url().nullable(),
});

/** POST /facturas/{id}/liquidar: pagada (compra) o cobrada (venta) en una fecha. */
export const settleInvoiceRequestSchema = z.object({ date: day });

/** Filtros de los listados: ?operacion=&tercero=&estado=&conciliacion=&desde=&hasta= */
export const documentFilterQuerySchema = z.object({
  operacion: operationSchema.optional(),
  tercero: z.uuid().optional(),
  desde: day.optional(),
  hasta: day.optional(),
});

export const listDeliveryNotesQuerySchema = documentFilterQuerySchema.extend({
  estado: deliveryNoteStatusSchema.optional(),
});

export const listInvoicesQuerySchema = documentFilterQuerySchema.extend({
  estado: paymentStatusSchema.optional(),
  conciliacion: reconciliationStatusSchema.optional(),
});

export const listDeliveryNotesResponseSchema = z.object({ items: z.array(deliveryNoteSchema) });
export const listInvoicesResponseSchema = z.object({ items: z.array(invoiceSchema) });

/** «Pendiente» incluye lo vencido: todo lo que queda por pagar o cobrar. */
export const amountsSchema = z.object({
  pending: moneySchema,
  overdue: moneySchema,
  pendingCount: z.number().int(),
  overdueCount: z.number().int(),
});

/** GET /facturas/resumen (HU-FAC-07, HU-FAC-09). */
export const invoicingSummarySchema = z.object({
  toPay: amountsSchema,
  toCollect: amountsSchema,
  openDiscrepancies: z.number().int(),
  /** Albaranes pendientes de facturar con más de 30 días. */
  staleDeliveryNotes: z.number().int(),
});

/** GET /terceros/{id}: ficha con documentos y saldo (HU-FAC-06). */
export const thirdPartySheetSchema = thirdPartySchema.extend({
  deliveryNotes: z.array(deliveryNoteSchema),
  invoices: z.array(invoiceSchema),
  balance: z.object({ toPay: amountsSchema, toCollect: amountsSchema }),
});

export type Line = z.infer<typeof lineSchema>;
export type DeliveryNoteInput = z.infer<typeof deliveryNoteInputSchema>;
export type DeliveryNote = z.infer<typeof deliveryNoteSchema>;
export type DeliveryNoteDetail = z.infer<typeof deliveryNoteDetailSchema>;
export type InvoiceInput = z.infer<typeof invoiceInputSchema>;
export type Invoice = z.infer<typeof invoiceSchema>;
export type InvoiceDetail = z.infer<typeof invoiceDetailSchema>;
export type InvoicingSummary = z.infer<typeof invoicingSummarySchema>;
export type ThirdPartySheet = z.infer<typeof thirdPartySheetSchema>;
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;
export type ReconciliationStatus = z.infer<typeof reconciliationStatusSchema>;
export type DeliveryNoteStatus = z.infer<typeof deliveryNoteStatusSchema>;
export type ListDeliveryNotesResponse = z.infer<typeof listDeliveryNotesResponseSchema>;
export type ListInvoicesResponse = z.infer<typeof listInvoicesResponseSchema>;
