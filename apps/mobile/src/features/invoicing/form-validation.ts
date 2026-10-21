import { deliveryNoteInputSchema, invoiceInputSchema } from '@multicooperativa/contracts';

import {
  type FieldErrors,
  hasErrors,
  invalid,
  mergeErrors,
  required,
  zodFieldErrors,
} from '@/forms/errors';
import { dayMessage } from '@/forms/rules';
import type { ServerMapping } from '@/forms/server-errors';

import {
  computeTotal,
  normalizeAmountInput,
  normalizeQuantityInput,
  normalizeVatInput,
} from './amounts';
import type { RegistrationDraft } from './draft';

const NUMBER_MAX = 50;
const CONCEPT_MAX = 200;
const UNIT_MAX = 20;

const tooLong = (max: number) => ({ key: 'forms.errors.tooLong', params: { max } });

/** Contract fields the form names differently. */
const FORM_FIELD: Record<string, string> = { issueDate: 'date' };

/** Fields the registration form renders: any other server error goes to the banner. */
export function isRegistrationField(name: string): boolean {
  return /^(thirdPartyId|number|date|dueDate|base|vatRate|total|lines|deliveryNoteIds)(\.|$)/.test(
    name,
  );
}

/** Where the API's errors land on the registration form (US-INV-02, US-INV-03). */
export const REGISTRATION_SERVER_MAPPING: ServerMapping = {
  fields: FORM_FIELD,
  codes: {
    duplicate_number: 'number',
    total_mismatch: 'total',
  },
};

function lineErrors(draft: RegistrationDraft): FieldErrors {
  const errors: FieldErrors = {};
  draft.lines.forEach((line, index) => {
    const concept = line.concept.trim();
    if (!concept) errors[`lines.${index}.concept`] = required;
    else if (concept.length > CONCEPT_MAX) errors[`lines.${index}.concept`] = tooLong(CONCEPT_MAX);

    const quantity = normalizeQuantityInput(line.quantity);
    if (!line.quantity.trim()) errors[`lines.${index}.quantity`] = required;
    else if (quantity === null) errors[`lines.${index}.quantity`] = invalid;
    else if (Number(quantity) <= 0) {
      errors[`lines.${index}.quantity`] = { key: 'forms.errors.mustBePositive' };
    }

    const unit = line.unit.trim();
    if (!unit) errors[`lines.${index}.unit`] = required;
    else if (unit.length > UNIT_MAX) errors[`lines.${index}.unit`] = tooLong(UNIT_MAX);
  });
  return errors;
}

const dayError = (value: string) => dayMessage(value) ?? null;

/** The record the API would receive, with values that do not parse left as typed so that the contract flags them. */
function candidate(draft: RegistrationDraft) {
  const lines = draft.lines.map((line) => ({
    concept: line.concept.trim(),
    quantity: normalizeQuantityInput(line.quantity) ?? line.quantity.trim(),
    unit: line.unit.trim(),
  }));
  const base = normalizeAmountInput(draft.base) ?? draft.base.trim();
  const vatRate = normalizeVatInput(draft.vatRate) ?? draft.vatRate.trim();
  const total =
    normalizeAmountInput(draft.total) ??
    (computeTotal(draft.base, draft.vatRate) || draft.total.trim());
  return draft.kind === 'invoice'
    ? {
        thirdPartyId: draft.thirdPartyId ?? undefined,
        operation: draft.operation,
        number: draft.number.trim(),
        issueDate: draft.date.trim(),
        dueDate: draft.dueDate.trim(),
        base,
        vatRate,
        total,
        lines,
        deliveryNoteIds: draft.deliveryNoteIds,
      }
    : {
        thirdPartyId: draft.thirdPartyId ?? undefined,
        operation: draft.operation,
        number: draft.number.trim(),
        date: draft.date.trim(),
        lines,
      };
}

/**
 * Every field that is missing or wrong in the registration draft (US-INV-02, US-INV-03):
 * the form's own rules (required, readable amounts, due date order, lines to reconcile) first,
 * then the same Zod contract the API enforces, run on the record the draft would become.
 */
export function validateRegistration(draft: RegistrationDraft): FieldErrors {
  const own: FieldErrors = {};
  const isInvoice = draft.kind === 'invoice';

  if (!draft.thirdPartyId) own.thirdPartyId = required;

  const number = draft.number.trim();
  if (!number) own.number = required;
  else if (number.length > NUMBER_MAX) own.number = tooLong(NUMBER_MAX);

  const date = dayError(draft.date);
  if (date) own.date = date;

  if (isInvoice) {
    const due = dayError(draft.dueDate);
    if (due) own.dueDate = due;
    else if (!date && draft.dueDate.trim() < draft.date.trim()) {
      own.dueDate = { key: 'invoicing.form.errors.dueBeforeIssue' };
    }

    if (!draft.base.trim()) own.base = required;
    else if (normalizeAmountInput(draft.base) === null) {
      own.base = { key: 'invoicing.form.errors.amount' };
    }

    if (!draft.vatRate.trim()) own.vatRate = required;
    else {
      const vat = normalizeVatInput(draft.vatRate);
      if (vat === null || Number(vat) > 100) own.vatRate = { key: 'invoicing.form.errors.vat' };
    }

    const typedTotal = draft.total.trim();
    if (typedTotal && normalizeAmountInput(typedTotal) === null) {
      own.total = { key: 'invoicing.form.errors.amount' };
    } else if (!typedTotal && !computeTotal(draft.base, draft.vatRate)) own.total = required;
  }

  // Delivery notes need lines; so does an invoice that groups delivery notes (BR-INV-08).
  if (draft.lines.length === 0 && (!isInvoice || draft.deliveryNoteIds.length > 0)) {
    own.lines = {
      key: isInvoice
        ? 'invoicing.form.errors.linesToReconcile'
        : 'invoicing.form.errors.linesRequired',
    };
  }
  Object.assign(own, lineErrors(draft));

  const parsed = (isInvoice ? invoiceInputSchema : deliveryNoteInputSchema).safeParse(
    candidate(draft),
  );
  const contract = parsed.success
    ? {}
    : zodFieldErrors(parsed.error, (path) => {
        const joined = path.map(String).join('.');
        return FORM_FIELD[joined] ?? joined;
      });
  return mergeErrors(own, contract);
}

/** True when the draft has no error: the registration can be sent. */
export const isRegistrationValid = (draft: RegistrationDraft): boolean =>
  !hasErrors(validateRegistration(draft));
