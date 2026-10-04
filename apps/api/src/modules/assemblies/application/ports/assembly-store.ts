import type { AssemblyState, AssemblyStatus, PointState } from '../../domain/assembly';

export interface AttachmentRecord {
  id: string;
  name: string;
  fileKey: string;
  size: number;
}

export interface PointRecord extends PointState {
  id: string;
  attachments: AttachmentRecord[];
}

export interface AssemblyRecord extends Omit<AssemblyState, 'points'> {
  id: string;
  cooperativeId: string;
  createdAt: Date;
  points: PointRecord[];
}

export interface AssemblySummary {
  id: string;
  type: AssemblyState['type'];
  status: AssemblyStatus;
  firstCallAt: Date;
  secondCallAt: Date | null;
  place: string;
  pointCount: number;
  openVotings: number;
}

export interface PointContext {
  point: PointRecord;
  assembly: { id: string; status: AssemblyStatus; secondCallAt: Date | null };
}

/** Every method is scoped to one cooperative (ADR-003). */
export interface AssemblyStore {
  list(cooperativeId: string, query: { includeDrafts: boolean }): Promise<AssemblySummary[]>;
  find(cooperativeId: string, id: string): Promise<AssemblyRecord | null>;
  create(cooperativeId: string, state: AssemblyState): Promise<AssemblyRecord>;
  /**
   * Locked read-modify-write. Points keep their id when the new state names it;
   * the rest are created; missing ones are removed with their attachments,
   * whose file keys come back so the caller can delete the files.
   */
  update(
    cooperativeId: string,
    id: string,
    decide: (current: AssemblyRecord, openVotings: number) => AssemblyState,
  ): Promise<{ assembly: AssemblyRecord; removedFileKeys: string[] } | null>;
  findPoint(cooperativeId: string, pointId: string): Promise<PointContext | null>;
  /** Locked on the assembly: `check` sees its current status and may refuse. */
  addAttachment(
    cooperativeId: string,
    pointId: string,
    check: (assemblyStatus: AssemblyStatus) => void,
    attachment: { name: string; fileKey: string; size: number },
  ): Promise<AttachmentRecord | null>;
}
