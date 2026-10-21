import {
  type DeliveryNoteInput,
  deliveryNoteInputSchema,
  type ExtractionField,
  type ExtractionResponse,
  type InvoiceInput,
  invoiceInputSchema,
  type Operation,
} from '@multicooperativa/contracts';

import type { ScanFile } from '@/features/shared/scan-file';
import { today } from '@/i18n/format';

import {
  computeTotal,
  normalizeAmountInput,
  normalizeQuantityInput,
  normalizeVatInput,
} from './amounts';

export interface LineDraft {
  concept: string;
  quantity: string;
  unit: string;
}

/** What the registration form edits: all text, validated only when building the record. */
export interface RegistrationDraft {
  kind: 'invoice' | 'delivery_note';
  operation: Operation;
  thirdPartyId: string | null;
  /** From a scan, when the party is not registered yet: offered to be created with these. */
  suggestedParty: { nif: string; name: string } | null;
  number: string;
  date: string;
  dueDate: string;
  base: string;
  vatRate: string;
  total: string;
  lines: LineDraft[];
  deliveryNoteIds: string[];
  /** Fields the model was unsure about, to review (US-INV-05). */
  lowConfidence: ExtractionField[];
  scan: ScanFile | null;
}

export function emptyDraft(
  operation: Operation = 'purchase',
  kind: RegistrationDraft['kind'] = 'invoice',
): RegistrationDraft {
  return {
    kind,
    operation,
    thirdPartyId: null,
    suggestedParty: null,
    number: '',
    // A typed record is usually from today; the native picker opens on it.
    date: today(),
    dueDate: '',
    base: '',
    vatRate: '21',
    total: '',
    lines: [],
    deliveryNoteIds: [],
    lowConfidence: [],
    scan: null,
  };
}

/** US-INV-05: the model's proposal becomes an editable draft; nothing is saved yet (BR-INV-11). */
export function draftFromExtraction(
  extraction: ExtractionResponse,
  scan: ScanFile,
  fallbackOperation: Operation,
  fallbackKind: RegistrationDraft['kind'] = 'invoice',
): RegistrationDraft {
  const draft = emptyDraft(
    extraction.operation ?? fallbackOperation,
    extraction.documentType ?? fallbackKind,
  );
  draft.scan = scan;
  if (extraction.status === 'no_data') return draft;

  const { thirdParty } = extraction;
  draft.thirdPartyId = thirdParty.match?.id ?? null;
  if (!thirdParty.match && thirdParty.nif) {
    draft.suggestedParty = { nif: thirdParty.nif, name: thirdParty.name ?? '' };
  }
  draft.number = extraction.number ?? '';
  draft.date = extraction.date ?? '';
  draft.dueDate = extraction.dueDate ?? '';
  draft.base = extraction.base ?? '';
  draft.vatRate = extraction.vatRate ?? draft.vatRate;
  draft.total = extraction.total ?? '';
  draft.lines = extraction.lines.map((line) => ({ ...line }));
  draft.lowConfidence = extraction.lowConfidence;
  return draft;
}

function normalizedLines(lines: LineDraft[]): LineDraft[] | null {
  const result: LineDraft[] = [];
  for (const line of lines) {
    const quantity = normalizeQuantityInput(line.quantity);
    if (quantity === null || Number(quantity) <= 0 || !line.concept.trim() || !line.unit.trim()) {
      return null;
    }
    result.push({ concept: line.concept.trim(), quantity, unit: line.unit.trim() });
  }
  return result;
}

/** Null when something does not pass the same contract the API enforces. */
export function buildDeliveryNoteInput(draft: RegistrationDraft): DeliveryNoteInput | null {
  const lines = normalizedLines(draft.lines);
  if (!lines || !draft.thirdPartyId) return null;
  const parsed = deliveryNoteInputSchema.safeParse({
    thirdPartyId: draft.thirdPartyId,
    operation: draft.operation,
    number: draft.number.trim(),
    date: draft.date.trim(),
    lines,
  });
  return parsed.success && parsed.data.number ? parsed.data : null;
}

export function buildInvoiceInput(draft: RegistrationDraft): InvoiceInput | null {
  const lines = normalizedLines(draft.lines);
  const base = normalizeAmountInput(draft.base);
  const vatRate = normalizeVatInput(draft.vatRate);
  const total = normalizeAmountInput(draft.total) ?? computeTotal(draft.base, draft.vatRate);
  if (!lines || !draft.thirdPartyId || !base || !vatRate || !total) return null;
  // Grouping delivery notes needs the lines to reconcile (BR-INV-08).
  if (draft.deliveryNoteIds.length > 0 && lines.length === 0) return null;
  const parsed = invoiceInputSchema.safeParse({
    thirdPartyId: draft.thirdPartyId,
    operation: draft.operation,
    number: draft.number.trim(),
    issueDate: draft.date.trim(),
    dueDate: draft.dueDate.trim(),
    base,
    vatRate,
    total,
    lines,
    deliveryNoteIds: draft.deliveryNoteIds,
  });
  return parsed.success && parsed.data.number ? parsed.data : null;
}

/**
 * A scanned draft travels from the capture screen to the form without touching
 * the server or the disk: it is only a proposal until a person confirms it.
 */
let pending: RegistrationDraft | null = null;

export function setPendingDraft(draft: RegistrationDraft | null): void {
  pending = draft;
}

/** Non-consuming read: React may build the initial state twice in development. */
export function peekPendingDraft(): RegistrationDraft | null {
  return pending;
}

export function takePendingDraft(): RegistrationDraft | null {
  const draft = pending;
  pending = null;
  return draft;
}
