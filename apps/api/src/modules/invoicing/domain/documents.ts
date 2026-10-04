import {
  InvalidDocumentError,
  InvalidInvoiceTransitionError,
  InvalidThirdPartyError,
} from './errors';
import { assertTotal, parseMoney, parseQuantity, parseVatRate } from './money';
import { isValidNif, normalizeNif } from './nif';

export type Operation = 'compra' | 'venta';

/** A calendar day, AAAA-MM-DD: compared as text, never through time zones. */
export type Day = string;

function assertDay(value: string, what: string): Day {
  const date = new Date(`${value}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(date.getTime()) ||
    !date.toISOString().startsWith(value)
  ) {
    throw new InvalidDocumentError(`${what} no es una fecha válida.`);
  }
  return value;
}

export function addDays(day: Day, days: number): Day {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function text(value: string, max: number, what: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new InvalidDocumentError(`Falta ${what}.`);
  if (trimmed.length > max) throw new InvalidDocumentError(`${what} supera los ${max} caracteres.`);
  return trimmed;
}

// ── Terceros (HU-FAC-01) ──

export interface ThirdPartyState {
  readonly nif: string;
  readonly name: string;
  readonly isSupplier: boolean;
  readonly isCustomer: boolean;
  readonly email: string | null;
  readonly phone: string | null;
  readonly active: boolean;
}

export interface ThirdPartyInput {
  nif: string;
  name: string;
  isSupplier: boolean;
  isCustomer: boolean;
  email: string | null;
  phone: string | null;
}

function validThirdParty(input: Omit<ThirdPartyInput, 'nif'>) {
  const name = input.name.trim();
  if (!name) throw new InvalidThirdPartyError('Falta la razón social.');
  if (name.length > 200) throw new InvalidThirdPartyError('La razón social es demasiado larga.');
  if (!input.isSupplier && !input.isCustomer) {
    throw new InvalidThirdPartyError('Indica si es proveedor, cliente o ambos.');
  }
  const email = input.email?.trim() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new InvalidThirdPartyError('El email no es válido.');
  }
  return {
    name,
    isSupplier: input.isSupplier,
    isCustomer: input.isCustomer,
    email,
    phone: input.phone?.trim() || null,
  };
}

export function createThirdParty(input: ThirdPartyInput): ThirdPartyState {
  const nif = normalizeNif(input.nif);
  if (!isValidNif(nif))
    throw new InvalidThirdPartyError(
      'El NIF no es válido: revisa la letra o el dígito de control.',
    );
  return { nif, ...validThirdParty(input), active: true };
}

/** The NIF identifies the party in the cooperative (RN-FAC-02): it is not edited. */
export function editThirdParty<T extends ThirdPartyState>(
  party: T,
  input: Omit<ThirdPartyInput, 'nif'>,
): T {
  return { ...party, ...validThirdParty(input) };
}

/** RN-FAC-14: never deleted; it stops being offered for new records. */
export const deactivate = <T extends ThirdPartyState>(party: T): T => ({ ...party, active: false });
export const reactivate = <T extends ThirdPartyState>(party: T): T => ({ ...party, active: true });

/** RN-FAC-03. */
export function assertCanOperate(party: ThirdPartyState, operation: Operation): void {
  if (!party.active) throw new InvalidThirdPartyError('El tercero está desactivado.');
  if (operation === 'compra' && !party.isSupplier) {
    throw new InvalidThirdPartyError('Una compra necesita un tercero dado de alta como proveedor.');
  }
  if (operation === 'venta' && !party.isCustomer) {
    throw new InvalidThirdPartyError('Una venta necesita un tercero dado de alta como cliente.');
  }
}

// ── Líneas ──

export interface Line {
  readonly concept: string;
  /** Thousandths (RN-FAC-13). */
  readonly quantity: bigint;
  readonly unit: string;
}

export interface LineInput {
  concept: string;
  quantity: string;
  unit: string;
}

function validLines(lines: LineInput[]): Line[] {
  return lines.map((line, i) => {
    const quantity = parseQuantity(line.quantity);
    if (quantity <= 0n)
      throw new InvalidDocumentError(`Línea ${i + 1}: la cantidad debe ser mayor que cero.`);
    return {
      concept: text(line.concept, 200, `el concepto de la línea ${i + 1}`),
      quantity,
      unit: text(line.unit, 20, `la unidad de la línea ${i + 1}`),
    };
  });
}

// ── Albaranes (HU-FAC-02) ──

export type DeliveryNoteStatus = 'pendiente_facturar' | 'facturado' | 'anulado';

export interface DeliveryNoteState {
  readonly operation: Operation;
  readonly number: string;
  readonly date: Day;
  readonly status: DeliveryNoteStatus;
  readonly lines: readonly Line[];
}

export function createDeliveryNote(input: {
  operation: Operation;
  number: string;
  date: string;
  lines: LineInput[];
}): DeliveryNoteState {
  const lines = validLines(input.lines);
  if (lines.length === 0) throw new InvalidDocumentError('El albarán necesita al menos una línea.');
  return {
    operation: input.operation,
    number: text(input.number, 50, 'el número de albarán'),
    date: assertDay(input.date, 'La fecha del albarán'),
    status: 'pendiente_facturar',
    lines,
  };
}

export function cancelDeliveryNote<T extends { status: DeliveryNoteStatus }>(note: T): T {
  if (note.status !== 'pendiente_facturar') {
    throw new InvalidInvoiceTransitionError('Solo se anula un albarán pendiente de facturar.');
  }
  return { ...note, status: 'anulado' };
}

// ── Facturas (HU-FAC-03, HU-FAC-07) ──

export type PaymentStatus = 'pendiente' | 'vencida' | 'liquidada' | 'anulada';

export interface InvoiceState {
  readonly operation: Operation;
  readonly number: string;
  readonly issueDate: Day;
  readonly dueDate: Day;
  /** Cents. */
  readonly base: bigint;
  /** Hundredths of a point. */
  readonly vatRate: bigint;
  /** Cents. */
  readonly total: bigint;
  readonly lines: readonly Line[];
  readonly paymentStatus: PaymentStatus;
  readonly settledAt: Day | null;
}

export interface InvoiceInput {
  operation: Operation;
  number: string;
  issueDate: string;
  dueDate: string;
  base: string;
  vatRate: string;
  total: string;
  lines: LineInput[];
}

export function createInvoice(input: InvoiceInput): InvoiceState {
  const issueDate = assertDay(input.issueDate, 'La fecha de emisión');
  const dueDate = assertDay(input.dueDate, 'La fecha de vencimiento');
  if (dueDate < issueDate)
    throw new InvalidDocumentError('El vencimiento no puede ser anterior a la emisión.');
  const base = parseMoney(input.base);
  const vatRate = parseVatRate(input.vatRate);
  const total = parseMoney(input.total);
  assertTotal(base, vatRate, total);
  return {
    operation: input.operation,
    number: text(input.number, 50, 'el número de factura'),
    issueDate,
    dueDate,
    base,
    vatRate,
    total,
    lines: validLines(input.lines),
    paymentStatus: 'pendiente',
    settledAt: null,
  };
}

/** RN-FAC-05 and RN-FAC-06: pending notes of the same party and operation. */
export function assertCanGroup(
  invoice: { operation: Operation; thirdPartyId: string; lines: readonly Line[] },
  notes: { thirdPartyId: string; operation: Operation; status: DeliveryNoteStatus }[],
): void {
  if (notes.length === 0) return;
  if (invoice.lines.length === 0) {
    throw new InvalidDocumentError('Para conciliar con albaranes, indica las líneas facturadas.');
  }
  for (const note of notes) {
    if (note.thirdPartyId !== invoice.thirdPartyId) {
      throw new InvalidDocumentError('Hay un albarán de otro tercero.');
    }
    if (note.operation !== invoice.operation)
      throw new InvalidDocumentError('Hay un albarán de otra operación.');
    if (note.status === 'facturado') throw new InvalidDocumentError('Hay un albarán ya facturado.');
    if (note.status === 'anulado') throw new InvalidDocumentError('Hay un albarán anulado.');
  }
}

/** RN-FAC-09; RN-FAC-10: a settled invoice never goes back. */
export function markOverdue<T extends { paymentStatus: PaymentStatus; dueDate: Day }>(
  invoice: T,
  today: Day,
): T {
  return invoice.paymentStatus === 'pendiente' && invoice.dueDate < today
    ? { ...invoice, paymentStatus: 'vencida' }
    : invoice;
}

export const DUE_SOON_DAYS = 3;

/** HU-FAC-07: «vence en 3 días». */
export function isDueSoon(
  invoice: { paymentStatus: PaymentStatus; dueDate: Day },
  today: Day,
): boolean {
  return invoice.paymentStatus === 'pendiente' && invoice.dueDate === addDays(today, DUE_SOON_DAYS);
}

/** Paid (purchase) or collected (sale), with its date. */
export function settle<T extends { paymentStatus: PaymentStatus; settledAt: Day | null }>(
  invoice: T,
  on: string,
): T {
  if (invoice.paymentStatus !== 'pendiente' && invoice.paymentStatus !== 'vencida') {
    throw new InvalidInvoiceTransitionError('Solo se liquida una factura pendiente o vencida.');
  }
  return { ...invoice, paymentStatus: 'liquidada', settledAt: assertDay(on, 'La fecha de pago') };
}

/** «Se registra la nueva y se anula la anterior»: its notes go back to pending. */
export function cancelInvoice<T extends { paymentStatus: PaymentStatus }>(invoice: T): T {
  if (invoice.paymentStatus !== 'pendiente' && invoice.paymentStatus !== 'vencida') {
    throw new InvalidInvoiceTransitionError('Solo se anula una factura pendiente o vencida.');
  }
  return { ...invoice, paymentStatus: 'anulada' };
}
