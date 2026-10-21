import { createAnnouncementRequestSchema } from '@multicooperativa/contracts';

import { collect, type FieldErrors, mergeErrors, required, zodFieldErrors } from '@/forms/errors';
import type { ServerMapping } from '@/forms/server-errors';
import { tooLong } from '@/forms/rules';

export const TITLE_MAX = 120;
export const BODY_MAX = 5000;

export interface AnnouncementDraft {
  title: string;
  body: string;
}

/** What the person is doing: a draft may be incomplete, publishing (or editing a published one) may not (BR-ANN-04). */
export type AnnouncementMode = 'draft' | 'publish';

export const ANNOUNCEMENT_FIELDS = ['title', 'body'] as const;

export function validateAnnouncement(
  draft: AnnouncementDraft,
  mode: AnnouncementMode,
): FieldErrors {
  const complete = mode === 'publish';
  const own = collect({
    title: complete && !draft.title.trim() ? required : undefined,
    body: complete && !draft.body.trim() ? required : undefined,
  });
  const parsed = createAnnouncementRequestSchema.safeParse(draft);
  return mergeErrors(own, parsed.success ? {} : zodFieldErrors(parsed.error));
}

/** `details.issues` of an invalid_announcement (BR-ANN-04) → the title and body fields. */
export const ANNOUNCEMENT_SERVER_MAPPING: ServerMapping = {
  codes: {
    invalid_announcement: (error) => {
      const issues = Array.isArray(error.details.issues) ? error.details.issues : [];
      return collect({
        title: issues.includes('title_missing')
          ? required
          : issues.includes('title_too_long')
            ? tooLong(TITLE_MAX)
            : undefined,
        body: issues.includes('body_missing')
          ? required
          : issues.includes('body_too_long')
            ? tooLong(BODY_MAX)
            : undefined,
      });
    },
  },
};
