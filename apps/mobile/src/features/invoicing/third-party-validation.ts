import { thirdPartyInputSchema } from '@multicooperativa/contracts';

import { type FieldErrors, mergeErrors, required, zodFieldErrors } from '@/forms/errors';
import { EMAIL_ERROR, isEmail, isPhone, PHONE_ERROR } from '@/forms/rules';
import type { ServerMapping } from '@/forms/server-errors';

/** What the third party form edits (US-INV-01). */
export interface ThirdPartyDraft {
  nif: string;
  name: string;
  isSupplier: boolean;
  isCustomer: boolean;
  email: string;
  phone: string;
}

/** Fields the form renders. */
export const THIRD_PARTY_FIELDS = ['nif', 'name', 'roles', 'email', 'phone'] as const;

/**
 * The NIF is validated by the server (letter and check digit, NFR-INV-06): an invalid or
 * duplicate one comes back as an error on that field.
 */
export const THIRD_PARTY_SERVER_MAPPING: ServerMapping = {
  codes: { third_party_exists: 'nif' },
};

export function validateThirdParty(draft: ThirdPartyDraft, isNew: boolean): FieldErrors {
  const own: FieldErrors = {};
  if (isNew && !draft.nif.trim()) own.nif = required;
  if (!draft.name.trim()) own.name = required;
  if (!draft.isSupplier && !draft.isCustomer)
    own.roles = { key: 'invoicing.thirdParties.errors.roles' };
  const email = draft.email.trim();
  if (email && !isEmail(email)) own.email = EMAIL_ERROR;
  const phone = draft.phone.trim();
  if (phone && !isPhone(phone)) own.phone = PHONE_ERROR;

  const parsed = thirdPartyInputSchema.safeParse({
    // Editing keeps the NIF: it is not part of the update, so any valid text stands in.
    nif: isNew ? draft.nif.trim() : 'x',
    name: draft.name.trim(),
    isSupplier: draft.isSupplier,
    isCustomer: draft.isCustomer,
    email: email || null,
    phone: phone || null,
  });
  const contract = parsed.success ? {} : zodFieldErrors(parsed.error);
  return mergeErrors(own, contract);
}
