import type { ThirdPartyState } from '../../domain/documents';

export interface ThirdPartyRecord extends ThirdPartyState {
  id: string;
  cooperativeId: string;
  createdAt: Date;
}

/** Every method is scoped to one cooperative (RN-FAC-01). */
export interface ThirdPartyStore {
  list(
    cooperativeId: string,
    query: { role?: 'proveedor' | 'cliente'; search?: string; includeInactive: boolean },
  ): Promise<ThirdPartyRecord[]>;
  find(cooperativeId: string, id: string): Promise<ThirdPartyRecord | null>;
  findByNif(cooperativeId: string, nif: string): Promise<ThirdPartyRecord | null>;
  /** The unique (cooperative, NIF) key settles races: the existing one comes back. */
  create(
    cooperativeId: string,
    state: ThirdPartyState,
  ): Promise<{ created: ThirdPartyRecord } | { existing: ThirdPartyRecord }>;
  update(
    cooperativeId: string,
    id: string,
    decide: (current: ThirdPartyRecord) => ThirdPartyState,
  ): Promise<ThirdPartyRecord | null>;
}
