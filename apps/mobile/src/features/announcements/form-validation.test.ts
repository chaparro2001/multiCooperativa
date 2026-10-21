import { describe, expect, it } from 'vitest';

import { ApiError } from '@/api/api-error';
import { routeServerError } from '@/forms/server-errors';

import {
  ANNOUNCEMENT_FIELDS,
  ANNOUNCEMENT_SERVER_MAPPING,
  BODY_MAX,
  TITLE_MAX,
  validateAnnouncement,
} from './form-validation';

describe('validateAnnouncement (US-ANN-01, BR-ANN-04)', () => {
  it('lets a draft be saved incomplete', () => {
    expect(validateAnnouncement({ title: '', body: '' }, 'draft')).toEqual({});
  });

  it('marks the missing title and body when publishing', () => {
    const errors = validateAnnouncement({ title: ' ', body: '' }, 'publish');
    expect(Object.keys(errors).sort()).toEqual(['body', 'title']);
    expect(errors.title?.key).toBe('forms.errors.required');
  });

  it('marks texts over the limits in any mode', () => {
    const errors = validateAnnouncement(
      { title: 'T'.repeat(TITLE_MAX + 1), body: 'B'.repeat(BODY_MAX + 1) },
      'draft',
    );
    expect(errors.title).toEqual({ key: 'forms.errors.tooLong', params: { max: TITLE_MAX } });
    expect(errors.body).toEqual({ key: 'forms.errors.tooLong', params: { max: BODY_MAX } });
  });

  it('accepts a complete announcement', () => {
    expect(validateAnnouncement({ title: 'Meeting', body: 'Details' }, 'publish')).toEqual({});
  });
});

describe('API errors on the announcement form', () => {
  const route = (error: ApiError) =>
    routeServerError(error, ANNOUNCEMENT_SERVER_MAPPING, (f) =>
      (ANNOUNCEMENT_FIELDS as readonly string[]).includes(f),
    );

  it('puts the issues of invalid_announcement on title and body', () => {
    const { fields, banner } = route(
      new ApiError(400, 'invalid_announcement', '', {
        issues: ['title_missing', 'body_too_long'],
      }),
    );
    expect(fields.title?.key).toBe('forms.errors.required');
    expect(fields.body?.key).toBe('forms.errors.tooLong');
    expect(banner).toBeNull();
  });

  it('keeps the banner when the code carries no known issue', () => {
    expect(
      route(new ApiError(400, 'invalid_announcement', '', { issues: [] })).banner,
    ).toBeTruthy();
  });
});
