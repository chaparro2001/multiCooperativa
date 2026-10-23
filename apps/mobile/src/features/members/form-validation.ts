import { inviteMemberRequestSchema } from '@multicooperativa/contracts';

import { collect, type FieldErrors, mergeErrors, required, zodFieldErrors } from '@/forms/errors';
import { EMAIL_ERROR, isEmail } from '@/forms/rules';
import type { ServerMapping } from '@/forms/server-errors';

export interface InviteDraft {
  email: string;
  name: string;
  profileId: string | null;
  isPartner: boolean;
  partnerNumber: string;
  /** Optional tax id of the partner (ADR-025); the server checks its control character. */
  nif: string;
}

/** Fields the invitation form renders. */
export const INVITE_FIELDS = ['email', 'name', 'profileId', 'partnerNumber', 'nif'] as const;

export const INVITE_SERVER_MAPPING: ServerMapping = {
  codes: {
    member_already_exists: 'email',
    profile_not_found: 'profileId',
    invalid_member_nif: 'nif',
    member_nif_taken: 'nif',
  },
};

/** US-ACC-08: email, name, profile and (for partners) the partner number. */
export function validateInvite(draft: InviteDraft): FieldErrors {
  const own = collect({
    email: !draft.email.trim() ? required : !isEmail(draft.email) ? EMAIL_ERROR : undefined,
    name: draft.name.trim() ? undefined : required,
    profileId: draft.profileId ? undefined : { key: 'members.invite.errors.profileRequired' },
  });
  const parsed = inviteMemberRequestSchema.safeParse({
    email: draft.email,
    name: draft.name,
    profileId: draft.profileId ?? undefined,
    isPartner: draft.isPartner,
    partnerNumber: draft.isPartner ? draft.partnerNumber : null,
    nif: draft.isPartner ? draft.nif.trim() || null : null,
  });
  return mergeErrors(own, parsed.success ? {} : zodFieldErrors(parsed.error));
}
