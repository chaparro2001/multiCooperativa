import type { BrandingRecord, BrandingStore } from '../ports/branding-store';

export class InMemoryBrandingStore implements BrandingStore {
  readonly rows = new Map<string, BrandingRecord>();

  async find(cooperativeId: string) {
    return this.rows.get(cooperativeId) ?? null;
  }

  async save(cooperativeId: string, record: BrandingRecord) {
    this.rows.set(cooperativeId, { ...record });
  }
}
