import { describe, expect, it } from 'vitest';

import { ApiError } from '@/api/api-error';
import { messageText } from '@/forms/errors';
import { routeServerError } from '@/forms/server-errors';

import {
  MAX_BYTES,
  UPLOAD_FIELDS,
  UPLOAD_SERVER_MAPPING,
  type UploadDraft,
  validateUpload,
} from './form-validation';

const draft = (overrides: Partial<UploadDraft> = {}): UploadDraft => ({
  title: 'Bylaws',
  category: 'bylaws',
  documentDate: '2026-03-15',
  file: { name: 'bylaws.pdf', size: 1000 },
  ...overrides,
});

describe('validateUpload (US-DOC-01)', () => {
  it('accepts a complete upload, also when the platform does not tell the size', () => {
    expect(validateUpload(draft())).toEqual({});
    expect(validateUpload(draft({ file: { name: 'a.pdf', size: null } }))).toEqual({});
  });

  it('marks the missing file, title and date', () => {
    const errors = validateUpload(draft({ file: null, title: '  ', documentDate: '' }));
    expect(Object.keys(errors).sort()).toEqual(['date', 'file', 'title']);
    expect(errors.file?.key).toBe('documents.upload.errors.fileRequired');
  });

  it('marks a file over 20 MB and a title over 150 characters', () => {
    const errors = validateUpload(
      draft({ file: { name: 'big.pdf', size: MAX_BYTES + 1 }, title: 'T'.repeat(151) }),
    );
    expect(errors.file?.key).toBe('documents.upload.tooLarge');
    expect(errors.title?.key).toBe('forms.errors.tooLong');
  });

  it('marks a category the contract does not know', () => {
    expect(validateUpload(draft({ category: 'nope' })).category?.key).toBe('forms.errors.invalid');
  });
});

describe('API errors on the upload form (BR-DOC-02)', () => {
  const route = (error: ApiError) =>
    routeServerError(error, UPLOAD_SERVER_MAPPING, (f) =>
      (UPLOAD_FIELDS as readonly string[]).includes(f),
    );

  it('puts a rejected file on the file field with the reason', () => {
    const { fields } = route(new ApiError(400, 'file_rejected', '', { reason: 'not_pdf' }));
    expect(Object.keys(fields)).toEqual(['file']);
    expect(messageText(fields.file!)).toMatch(/PDF/);
  });

  it('puts document rules on title and date (documentDate is the date field)', () => {
    expect(
      Object.keys(route(new ApiError(400, 'invalid_document', '', { field: 'title' })).fields),
    ).toEqual(['title']);
    expect(
      Object.keys(
        route(new ApiError(400, 'invalid_document', '', { field: 'documentDate' })).fields,
      ),
    ).toEqual(['date']);
  });
});
