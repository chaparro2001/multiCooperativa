import { z } from 'zod';

/** Amounts in euros as a string with at most 2 decimals: never a number (BR-INV-13). */
export const moneySchema = z.string().regex(/^-?\d+(\.\d{1,2})?$/, 'Amount with up to 2 decimals');
/** Quantities with up to 3 decimals, as a string. */
export const quantitySchema = z
  .string()
  .regex(/^\d+(\.\d{1,3})?$/, 'Quantity with up to 3 decimals');
export const vatRateSchema = z.string().regex(/^\d{1,3}(\.\d{1,2})?$/, 'VAT rate');
const day = z.iso.date();

export const operationSchema = z.enum(['purchase', 'sale']);

// ── Third parties (US-INV-01) ──

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

/** PATCH /third-parties/{id}: the tax ID is not editable; `active: false` deactivates it (BR-INV-14). */
export const thirdPartyUpdateSchema = thirdPartyInputSchema.omit({ nif: true }).extend({
  active: z.boolean(),
});

/** GET /third-parties?type=supplier|customer&q=…&inactive=true */
export const listThirdPartiesQuerySchema = z.object({
  type: z.enum(['supplier', 'customer']).optional(),
  q: z.string().max(100).optional(),
  inactive: z
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

// ── Delivery notes and invoices (US-INV-02, US-INV-03, US-INV-06, US-INV-07) ──

export const deliveryNoteStatusSchema = z.enum(['pending_invoicing', 'invoiced', 'voided']);
export const paymentStatusSchema = z.enum(['pending', 'overdue', 'settled', 'voided']);
export const reconciliationStatusSchema = z.enum([
  'no_delivery_notes',
  'reconciled',
  'with_discrepancy',
]);

export const lineSchema = z.object({
  concept: z.string().max(200),
  quantity: quantitySchema,
  unit: z.string().max(20),
});

const partyRefSchema = z.object({ id: z.uuid(), name: z.string(), nif: z.string() });

/** `data` field (JSON) of POST /delivery-notes, next to the optional file in `file`. */
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
  /** Original (photo or PDF) with a signed 5-minute URL (NFR-INV-02). */
  fileUrl: z.url().nullable(),
});

/** `data` field (JSON) of POST /invoices, next to the optional PDF in `file`. */
export const invoiceInputSchema = z.object({
  thirdPartyId: z.uuid(),
  operation: operationSchema,
  number: z.string().max(50),
  issueDate: day,
  dueDate: day,
  base: moneySchema,
  vatRate: vatRateSchema,
  total: moneySchema,
  /** Required if it groups delivery notes, to reconcile by concept (BR-INV-08). */
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
  /** Numeric detail per concept, which is authoritative; the explanation is drafted by the AI (BR-INV-12). */
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

/** POST /invoices/{id}/settle: paid (purchase) or collected (sale) on a date. */
export const settleInvoiceRequestSchema = z.object({ date: day });

/** List filters: ?operation=&thirdParty=&status=&reconciliation=&from=&to= */
export const documentFilterQuerySchema = z.object({
  operation: operationSchema.optional(),
  thirdParty: z.uuid().optional(),
  from: day.optional(),
  to: day.optional(),
});

export const listDeliveryNotesQuerySchema = documentFilterQuerySchema.extend({
  status: deliveryNoteStatusSchema.optional(),
});

export const listInvoicesQuerySchema = documentFilterQuerySchema.extend({
  status: paymentStatusSchema.optional(),
  reconciliation: reconciliationStatusSchema.optional(),
});

export const listDeliveryNotesResponseSchema = z.object({ items: z.array(deliveryNoteSchema) });
export const listInvoicesResponseSchema = z.object({ items: z.array(invoiceSchema) });

/** "Pending" includes what is overdue: everything still to be paid or collected. */
export const amountsSchema = z.object({
  pending: moneySchema,
  overdue: moneySchema,
  pendingCount: z.number().int(),
  overdueCount: z.number().int(),
});

/** GET /invoices/summary (US-INV-07, US-INV-09). */
export const invoicingSummarySchema = z.object({
  toPay: amountsSchema,
  toCollect: amountsSchema,
  openDiscrepancies: z.number().int(),
  /** Delivery notes pending invoicing for more than 30 days. */
  staleDeliveryNotes: z.number().int(),
});

/** GET /third-parties/{id}: record with documents and balance (US-INV-06). */
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

// ── Vision extraction (US-INV-05) ──

export const extractionFieldSchema = z.enum([
  'documentType',
  'thirdParty',
  'number',
  'date',
  'dueDate',
  'base',
  'vatRate',
  'total',
  'lines',
]);

/**
 * POST /extractions (multipart, photo or PDF in `file`): a proposal to review.
 * Nothing is saved until it is confirmed through the normal registration (BR-INV-11).
 */
export const extractionResponseSchema = z.object({
  /** `no_data`: it could not be read; the form is filled in by hand. */
  status: z.enum(['proposal', 'no_data']),
  documentType: z.enum(['delivery_note', 'invoice']).nullable(),
  /** Deduced from the tax ID: if the cooperative itself issues it, it is a sale. */
  operation: operationSchema.nullable(),
  thirdParty: z.object({
    nif: z.string().nullable(),
    name: z.string().nullable(),
    /** Third party of this cooperative with that tax ID, preselected; if null, offer to create it. */
    match: thirdPartySchema.nullable(),
  }),
  number: z.string().nullable(),
  date: day.nullable(),
  dueDate: day.nullable(),
  base: moneySchema.nullable(),
  vatRate: vatRateSchema.nullable(),
  total: moneySchema.nullable(),
  lines: z.array(lineSchema),
  /** Fields to review: doubtful for the model or failing validation. */
  lowConfidence: z.array(extractionFieldSchema),
});

export type ExtractionResponse = z.infer<typeof extractionResponseSchema>;
export type ExtractionField = z.infer<typeof extractionFieldSchema>;
