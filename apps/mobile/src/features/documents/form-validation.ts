import { uploadDocumentFieldsSchema } from '@multicooperativa/contracts';

import { collect, type FieldErrors, mergeErrors, required, zodFieldErrors } from '@/forms/errors';
import { dayMessage } from '@/forms/rules';
import type { ServerMapping } from '@/forms/server-errors';

export const MAX_MB = 20;
export const MAX_BYTES = MAX_MB * 1024 * 1024;

export interface UploadDraft {
  title: string;
  category: string;
  /** `YYYY-MM-DD`. */
  documentDate: string;
  /** The chosen PDF: null until one is picked; size is unknown on some platforms. */
  file: { name: string; size: number | null } | null;
}

export const UPLOAD_FIELDS = ['file', 'title', 'category', 'date'] as const;

/** The API calls the date `documentDate`; the form calls it `date`. */
export const UPLOAD_SERVER_MAPPING: ServerMapping = {
  fields: { documentDate: 'date' },
  codes: { file_rejected: 'file' },
};

/** US-DOC-01: PDF of up to 20 MB with title, category and date. */
export function validateUpload(draft: UploadDraft): FieldErrors {
  const own = collect({
    file: !draft.file
      ? { key: 'documents.upload.errors.fileRequired' }
      : draft.file.size !== null && draft.file.size > MAX_BYTES
        ? { key: 'documents.upload.tooLarge', params: { max: MAX_MB } }
        : undefined,
    title: draft.title.trim() ? undefined : required,
    date: dayMessage(draft.documentDate),
  });
  const parsed = uploadDocumentFieldsSchema.safeParse({
    title: draft.title,
    category: draft.category,
    documentDate: draft.documentDate,
  });
  const contract = parsed.success
    ? {}
    : zodFieldErrors(parsed.error, (path) =>
        path[0] === 'documentDate' ? 'date' : String(path[0]),
      );
  return mergeErrors(own, contract);
}
