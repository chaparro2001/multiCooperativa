export interface BrandingRecord {
  primaryColor: string | null;
  updatedAt: Date;
}

/** Every operation names the cooperative: a read or write cannot cross cooperatives (ADR-003). */
export interface BrandingStore {
  find(cooperativeId: string): Promise<BrandingRecord | null>;
  save(cooperativeId: string, record: BrandingRecord): Promise<void>;
}

/** Leaves a trace in the cooperative's audit log; provided by the access module (US-ACC-12). */
export type AuditRecorder = (
  cooperativeId: string,
  event: { actorUserId: string; action: string; detail: Record<string, unknown> },
) => Promise<void>;
