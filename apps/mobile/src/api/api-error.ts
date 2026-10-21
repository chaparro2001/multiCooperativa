import { apiErrorSchema } from '@multicooperativa/contracts';

import { i18n } from '../i18n';
import { joinList } from '../i18n/format';

/** An answer of the API other than 2xx, with the `error` code of its body. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    /** Extra data of the error for the UI, e.g. the vote already cast. */
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static async fromResponse(response: Response): Promise<ApiError> {
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      // Not JSON (a proxy error page, for instance).
    }
    const parsed = apiErrorSchema.safeParse(body);
    const code = parsed.success ? parsed.data.error : `http_${response.status}`;
    const message = parsed.success && parsed.data.message ? parsed.data.message : '';
    const details = parsed.success ? (parsed.data.details ?? {}) : {};
    return new ApiError(response.status, code, message, details);
  }
}

/** The request never reached the API (no network, server down). */
export class NetworkError extends Error {
  constructor(cause: unknown) {
    super('Cannot connect to the server.', { cause });
    this.name = 'NetworkError';
  }
}

/** Free-form lookup: API error codes are data, so they cannot be checked against the catalog. */
const lookup = i18n.t as unknown as (key: string, options?: Record<string, unknown>) => string;

/** Error codes whose text depends on the extra data (`details`) the API sends with them. */
function detailedMessage(error: ApiError): string | null {
  const reason = error.details.reason;
  switch (error.code) {
    case 'invalid_announcement': {
      const issues = Array.isArray(error.details.issues) ? error.details.issues : [];
      const texts = issues
        .map((issue) => String(issue))
        .filter((issue) => i18n.exists(`errors.announcementIssues.${issue}`));
      if (texts.length === 0) return null;
      return i18n.t('errors.codes.invalid_announcement', {
        issues: joinList(texts.map((issue) => lookup(`errors.announcementIssues.${issue}`))),
      });
    }
    case 'attachment_rejected':
    case 'file_rejected': {
      const key = `errors.rejections.${error.code}.${String(reason)}`;
      return i18n.exists(key) ? lookup(key) : null;
    }
    case 'insufficient_contrast': {
      const ratio = Number(error.details.ratio);
      const minimum = Number(error.details.minimum);
      if (!Number.isFinite(ratio) || !Number.isFinite(minimum)) return null;
      const format = (value: number) =>
        value.toLocaleString(i18n.language, { maximumFractionDigits: 2 });
      return i18n.t('errors.codes.insufficient_contrast', {
        ratio: format(ratio),
        minimum: format(minimum),
      });
    }
    case 'insufficient_notice': {
      const days = Number(error.details.minNoticeDays);
      return Number.isFinite(days)
        ? i18n.t('errors.codes.insufficient_notice', { count: days })
        : null;
    }
    default:
      return null;
  }
}

/**
 * The localized text to show the user for any failure. The `message` the API sends is for
 * developers (English) and is never shown: the stable `error` code selects the text.
 */
export function messageFor(error: unknown): string {
  if (error instanceof NetworkError) return i18n.t('errors.network');
  if (error instanceof ApiError) {
    const detailed = detailedMessage(error);
    if (detailed) return detailed;
    const key = `errors.codes.${error.code}`;
    if (i18n.exists(key)) return lookup(key);
  }
  return i18n.t('errors.generic');
}
