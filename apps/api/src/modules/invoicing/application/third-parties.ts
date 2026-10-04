import type { CooperativeContext } from '../../access';
import {
  createThirdParty,
  deactivate,
  editThirdParty,
  reactivate,
  type ThirdPartyInput,
} from '../domain/documents';
import { normalizeNif } from '../domain/nif';
import { NotFoundError, ThirdPartyExistsError } from './errors';
import type { ThirdPartyRecord, ThirdPartyStore } from './ports/third-party-store';
import { canManage, requireManage, requireRead, UUID } from './shared';

export interface ThirdPartyDeps {
  thirdParties: ThirdPartyStore;
}

/** HU-FAC-01: active ones by default, which are the ones offered for new records. */
export async function listThirdParties(
  deps: ThirdPartyDeps,
  context: CooperativeContext,
  query: { role?: 'proveedor' | 'cliente'; search?: string; includeInactive?: boolean },
): Promise<ThirdPartyRecord[]> {
  requireRead(context);
  return deps.thirdParties.list(context.cooperativeId, {
    role: query.role,
    search: query.search?.trim() || undefined,
    includeInactive: Boolean(query.includeInactive) && canManage(context),
  });
}

export async function getThirdParty(
  deps: ThirdPartyDeps,
  context: CooperativeContext,
  id: string,
): Promise<ThirdPartyRecord> {
  requireRead(context);
  const party = UUID.test(id) ? await deps.thirdParties.find(context.cooperativeId, id) : null;
  if (!party) throw new NotFoundError();
  return party;
}

/** Same NIF in this cooperative: the existing one is offered, never duplicated (RN-FAC-02). */
export async function registerThirdParty(
  deps: ThirdPartyDeps,
  context: CooperativeContext,
  input: ThirdPartyInput,
): Promise<ThirdPartyRecord> {
  requireManage(context);
  const state = createThirdParty(input);
  const result = await deps.thirdParties.create(context.cooperativeId, state);
  if ('existing' in result)
    throw new ThirdPartyExistsError(result.existing.id, result.existing.name);
  return result.created;
}

/** Looks a party up by NIF in this cooperative only (requisitos/05, section 4, step 4). */
export async function findThirdPartyByNif(
  deps: ThirdPartyDeps,
  context: CooperativeContext,
  nif: string,
): Promise<ThirdPartyRecord | null> {
  requireRead(context);
  return deps.thirdParties.findByNif(context.cooperativeId, normalizeNif(nif));
}

/** HU-FAC-01: edit, and deactivate instead of deleting (RN-FAC-14). */
export async function updateThirdParty(
  deps: ThirdPartyDeps,
  context: CooperativeContext,
  id: string,
  changes: Omit<ThirdPartyInput, 'nif'> & { active: boolean },
): Promise<ThirdPartyRecord> {
  requireManage(context);
  const updated = UUID.test(id)
    ? await deps.thirdParties.update(context.cooperativeId, id, (current) => {
        const edited = editThirdParty(current, changes);
        return changes.active ? reactivate(edited) : deactivate(edited);
      })
    : null;
  if (!updated) throw new NotFoundError();
  return updated;
}
