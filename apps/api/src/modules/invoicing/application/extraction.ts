import type { CooperativeContext } from '../../access';
import { detectFileType } from '../../../shared/domain/file-type';
import type { LineInput, Operation } from '../domain/documents';
import { normalizeDecimal } from '../domain/decimal-text';
import { InvalidDocumentError } from '../domain/errors';
import {
  formatMoney,
  formatQuantity,
  formatVatRate,
  parseMoney,
  parseQuantity,
  parseVatRate,
} from '../domain/money';
import { isValidNif, normalizeNif } from '../domain/nif';
import { MAX_FILE_BYTES } from './documents';
import type { DocumentExtractor, ExtractionField } from './ports/document-extractor';
import type { ThirdPartyRecord, ThirdPartyStore } from './ports/third-party-store';
import { requireManage } from './shared';

export interface ExtractionDeps {
  extractor: DocumentExtractor;
  thirdParties: ThirdPartyStore;
  /** From the access module: the cooperative's own tax id. */
  cooperativeTaxId(cooperativeId: string): Promise<string | null>;
}

/** A proposal to review: nothing is stored until a person confirms it (BR-INV-11). */
export interface ExtractionProposal {
  status: 'proposal' | 'no_data';
  documentType: 'delivery_note' | 'invoice' | null;
  operation: Operation | null;
  thirdParty: {
    nif: string | null;
    name: string | null;
    /** Existing party of this cooperative with that NIF, preselected (US-INV-05). */
    match: ThirdPartyRecord | null;
  };
  number: string | null;
  date: string | null;
  dueDate: string | null;
  base: string | null;
  vatRate: string | null;
  total: string | null;
  lines: LineInput[];
  /** Fields to review: flagged by the model or failing validation. */
  lowConfidence: ExtractionField[];
}

const isDay = (value: string | null): value is string => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
};

/** Through the same parsers as manual registration; null when it does not pass. */
function validated(
  raw: string | null,
  parse: (value: string) => bigint,
  format: (value: bigint) => string,
): string | null {
  const text = normalizeDecimal(raw);
  if (text === null) return null;
  try {
    return format(parse(text));
  } catch {
    return null;
  }
}

/** US-INV-05: photo or PDF → proposal with the party resolved in this cooperative only. */
export async function extractDocument(
  deps: ExtractionDeps,
  context: CooperativeContext,
  file: { content: Uint8Array },
): Promise<ExtractionProposal> {
  requireManage(context);
  const mediaType = detectFileType(file.content);
  if (!mediaType) throw new InvalidDocumentError('Send a photo (JPEG or PNG) or a PDF.');
  if (file.content.byteLength > MAX_FILE_BYTES)
    throw new InvalidDocumentError('The file can be at most 10 MB.');

  const raw = await deps.extractor.extract({ content: file.content, mediaType });
  const empty: ExtractionProposal = {
    status: 'no_data',
    documentType: null,
    operation: null,
    thirdParty: { nif: null, name: null, match: null },
    number: null,
    date: null,
    dueDate: null,
    base: null,
    vatRate: null,
    total: null,
    lines: [],
    lowConfidence: [],
  };
  if (!raw || raw.documentType === 'other') return empty;

  const low = new Set<ExtractionField>(raw.lowConfidence);
  const flag = <T>(field: ExtractionField, value: T | null, rawValue: unknown): T | null => {
    if (value === null && rawValue !== null) low.add(field);
    return value;
  };

  // Requisitos/05, section 4, step 3: issued by the cooperative itself → sale; otherwise a purchase.
  const own = normalizeNif((await deps.cooperativeTaxId(context.cooperativeId)) ?? '');
  const issuerNif = raw.issuer.nif ? normalizeNif(raw.issuer.nif) : null;
  const recipientNif = raw.recipient.nif ? normalizeNif(raw.recipient.nif) : null;
  let operation: Operation = 'purchase';
  let counterpart = raw.issuer;
  let counterpartNif = issuerNif;
  if (own && issuerNif === own) {
    operation = 'sale';
    counterpart = raw.recipient;
    counterpartNif = recipientNif;
  } else if (!(own && recipientNif === own)) {
    // Neither side is the cooperative's NIF: a purchase is the likely case, but say so.
    low.add('thirdParty');
  }

  const nif = counterpartNif && isValidNif(counterpartNif) ? counterpartNif : null;
  if (counterpartNif && !nif) low.add('thirdParty');
  // Step 4: looked up only in the active cooperative.
  const match = nif ? await deps.thirdParties.findByNif(context.cooperativeId, nif) : null;

  const lines: LineInput[] = [];
  for (const line of raw.lines) {
    const quantity = validated(line.quantity, parseQuantity, formatQuantity);
    if (quantity && line.concept.trim() && line.unit.trim() && parseQuantity(quantity) > 0n) {
      lines.push({ concept: line.concept.trim(), quantity, unit: line.unit.trim() });
    } else {
      low.add('lines');
    }
  }

  const proposal: ExtractionProposal = {
    status: 'proposal',
    documentType: raw.documentType,
    operation,
    thirdParty: {
      nif: nif ?? counterpartNif,
      name: match?.name ?? counterpart.name?.trim() ?? null,
      match,
    },
    number: raw.number?.trim() || null,
    date: flag('date', isDay(raw.date) ? raw.date : null, raw.date),
    dueDate: flag('dueDate', isDay(raw.dueDate) ? raw.dueDate : null, raw.dueDate),
    base: flag('base', validated(raw.base, parseMoney, formatMoney), raw.base),
    vatRate: flag('vatRate', validated(raw.vatRate, parseVatRate, formatVatRate), raw.vatRate),
    total: flag('total', validated(raw.total, parseMoney, formatMoney), raw.total),
    lines,
    lowConfidence: [],
  };
  proposal.lowConfidence = [...low];
  const nothingRead =
    !proposal.number && !proposal.total && lines.length === 0 && !proposal.thirdParty.nif;
  return nothingRead ? empty : proposal;
}
