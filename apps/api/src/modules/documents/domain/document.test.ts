import { describe, expect, it } from 'vitest';

import {
  assertCanAddVersion,
  assertValidFile,
  createDocument,
  isVisible,
  MAX_FILE_BYTES,
  TITLE_MAX_LENGTH,
  withdraw,
} from './document';
import {
  DocumentFileRejectedError,
  InvalidDocumentError,
  InvalidDocumentTransitionError,
} from './errors';

const valid = {
  title: 'Corporate bylaws',
  category: 'bylaws',
  documentDate: '2026-03-15',
} as const;

describe('uploading a document (US-DOC-01)', () => {
  it('is published with its title, category and date', () => {
    expect(createDocument({ ...valid, title: '  Corporate bylaws ' })).toEqual({
      status: 'published',
      title: 'Corporate bylaws',
      category: 'bylaws',
      documentDate: '2026-03-15',
    });
  });

  it('requires a title of at most 150 characters', () => {
    expect(() => createDocument({ ...valid, title: ' ' })).toThrow(InvalidDocumentError);
    expect(() => createDocument({ ...valid, title: 'x'.repeat(TITLE_MAX_LENGTH + 1) })).toThrow(
      InvalidDocumentError,
    );
    expect(() => createDocument({ ...valid, title: 'x'.repeat(TITLE_MAX_LENGTH) })).not.toThrow();
  });

  it('requires a valid calendar date', () => {
    for (const documentDate of ['2026-02-30', '15/03/2026', '2026-3-5', '']) {
      expect(() => createDocument({ ...valid, documentDate })).toThrow(InvalidDocumentError);
    }
  });

  it('requires a known category', () => {
    expect(() => createDocument({ ...valid, category: 'invoices' as never })).toThrow(
      InvalidDocumentError,
    );
  });
});

describe('file (BR-DOC-02)', () => {
  it('Given a PDF of up to 20 MB, then it is accepted', () => {
    expect(() => assertValidFile({ isPdf: true, size: MAX_FILE_BYTES })).not.toThrow();
  });

  it('Given a file that is not a PDF, then it is rejected stating the reason', () => {
    expect(() => assertValidFile({ isPdf: false, size: 10 })).toThrow(
      expect.objectContaining({ reason: 'not_pdf' }),
    );
  });

  it('Given a PDF of more than 20 MB, then it is rejected stating the reason', () => {
    expect(() => assertValidFile({ isPdf: true, size: MAX_FILE_BYTES + 1 })).toThrow(
      expect.objectContaining({ reason: 'too_large' }),
    );
  });

  it('an empty file is not a document', () => {
    expect(() => assertValidFile({ isPdf: true, size: 0 })).toThrow(DocumentFileRejectedError);
  });
});

describe('versions and withdrawal (US-DOC-04, US-DOC-05)', () => {
  it('a version is added to a published document', () => {
    expect(() => assertCanAddVersion(createDocument(valid))).not.toThrow();
  });

  it('a withdrawn document accepts no versions', () => {
    expect(() => assertCanAddVersion(withdraw(createDocument(valid)))).toThrow(
      InvalidDocumentTransitionError,
    );
  });

  it('withdrawing is final', () => {
    const withdrawn = withdraw(createDocument(valid));
    expect(withdrawn.status).toBe('withdrawn');
    expect(() => withdraw(withdrawn)).toThrow(InvalidDocumentTransitionError);
  });
});

describe('visibility (US-DOC-03)', () => {
  it('with read access only published ones are visible; with manage access, all of them', () => {
    expect(isVisible('published', false)).toBe(true);
    expect(isVisible('withdrawn', false)).toBe(false);
    expect(isVisible('withdrawn', true)).toBe(true);
  });
});
