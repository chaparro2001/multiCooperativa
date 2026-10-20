import { describe, expect, it } from 'vitest';

import {
  assertCanAttach,
  BODY_MAX_LENGTH,
  createDraft,
  edit,
  isVisible,
  MAX_ATTACHMENT_BYTES,
  publish,
  setPinned,
  TITLE_MAX_LENGTH,
  withdraw,
} from './announcement';
import {
  AttachmentRejectedError,
  InvalidAnnouncementError,
  InvalidAnnouncementTransitionError,
} from './errors';

const now = new Date('2026-10-10T10:00:00Z');
const later = new Date('2026-10-11T10:00:00Z');

const draft = () => createDraft({ title: 'General assembly', body: 'The assembly is convened.' });
const published = () => publish(draft(), now);

describe('draft (US-ANN-01)', () => {
  it('Given a valid title and body, when I save without publishing, then it is a draft', () => {
    expect(draft()).toEqual({
      status: 'draft',
      title: 'General assembly',
      body: 'The assembly is convened.',
      pinned: false,
      publishedAt: null,
      editedAt: null,
    });
  });

  it('a draft may be incomplete: completeness is required on publish', () => {
    expect(createDraft({ title: '', body: '' }).status).toBe('draft');
  });

  it('trims surrounding whitespace', () => {
    expect(createDraft({ title: '  Hello ', body: ' Text\n' })).toMatchObject({
      title: 'Hello',
      body: 'Text',
    });
  });

  it('BR-ANN-04: rejects a title or body that is too long, even as a draft', () => {
    const error = (() => {
      try {
        createDraft({
          title: 'x'.repeat(TITLE_MAX_LENGTH + 1),
          body: 'y'.repeat(BODY_MAX_LENGTH + 1),
        });
      } catch (e) {
        return e;
      }
    })();
    expect(error).toBeInstanceOf(InvalidAnnouncementError);
    expect((error as InvalidAnnouncementError).issues).toEqual(['title_too_long', 'body_too_long']);
  });

  it('accepts exactly the maximums', () => {
    expect(() =>
      createDraft({ title: 'x'.repeat(TITLE_MAX_LENGTH), body: 'y'.repeat(BODY_MAX_LENGTH) }),
    ).not.toThrow();
  });
});

describe('publish (US-ANN-01)', () => {
  it('Given a draft, when I publish it, then it becomes published with its date', () => {
    expect(published()).toMatchObject({ status: 'published', publishedAt: now, editedAt: null });
  });

  it('Given an announcement without title or body, when I try to publish it, then what is missing is reported', () => {
    try {
      publish(createDraft({ title: ' ', body: '' }), now);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidAnnouncementError);
      expect((error as InvalidAnnouncementError).issues).toEqual(['title_missing', 'body_missing']);
    }
  });

  it('is published only once (BR-ANN-07: the notice goes out once)', () => {
    expect(() => publish(published(), later)).toThrow(InvalidAnnouncementTransitionError);
  });

  it('a withdrawn announcement is not published again', () => {
    expect(() => publish(withdraw(published()), later)).toThrow(InvalidAnnouncementTransitionError);
  });
});

describe('edit (US-ANN-05)', () => {
  it('editing a draft does not mark it as edited', () => {
    expect(edit(draft(), { title: 'Other' }, later)).toMatchObject({
      title: 'Other',
      editedAt: null,
    });
  });

  it('Given a published announcement, when I edit it, then it is marked as edited with the date', () => {
    expect(edit(published(), { body: 'Fixed' }, later)).toMatchObject({
      status: 'published',
      body: 'Fixed',
      publishedAt: now,
      editedAt: later,
    });
  });

  it('a published announcement cannot end up without title or body', () => {
    expect(() => edit(published(), { body: '' }, later)).toThrow(InvalidAnnouncementError);
  });

  it('a withdrawn announcement cannot be edited', () => {
    expect(() => edit(withdraw(published()), { title: 'x' }, later)).toThrow(
      InvalidAnnouncementTransitionError,
    );
  });
});

describe('withdraw and pin (US-ANN-05, US-ANN-06)', () => {
  it('BR-ANN-02: a published announcement is withdrawn, not deleted', () => {
    expect(withdraw(published()).status).toBe('withdrawn');
  });

  it('only published announcements are withdrawn', () => {
    expect(() => withdraw(draft())).toThrow(InvalidAnnouncementTransitionError);
  });

  it('a published announcement is pinned and unpinned', () => {
    const pinned = setPinned(published(), true);
    expect(pinned.pinned).toBe(true);
    expect(setPinned(pinned, false).pinned).toBe(false);
  });

  it('a draft cannot be pinned', () => {
    expect(() => setPinned(draft(), true)).toThrow(InvalidAnnouncementTransitionError);
  });

  it('withdrawing removes the pin', () => {
    expect(withdraw(setPinned(published(), true)).pinned).toBe(false);
  });
});

describe('visibility (BR-ANN-03)', () => {
  it('with read access only published ones are visible', () => {
    expect(isVisible('published', false)).toBe(true);
    expect(isVisible('draft', false)).toBe(false);
    expect(isVisible('withdrawn', false)).toBe(false);
  });

  it('with manage access all are visible', () => {
    expect(isVisible('draft', true)).toBe(true);
    expect(isVisible('withdrawn', true)).toBe(true);
  });
});

describe('attachments (BR-ANN-05)', () => {
  const pdf = { size: 1000, isPdf: true };

  it('accepts up to 3 PDFs', () => {
    expect(() => assertCanAttach(draft(), 2, pdf)).not.toThrow();
    expect(() => assertCanAttach(draft(), 3, pdf)).toThrow(
      expect.objectContaining({ reason: 'too_many' }),
    );
  });

  it('PDF only', () => {
    expect(() => assertCanAttach(draft(), 0, { size: 1000, isPdf: false })).toThrow(
      expect.objectContaining({ reason: 'not_pdf' }),
    );
  });

  it('10 MB at most', () => {
    expect(() =>
      assertCanAttach(draft(), 0, { size: MAX_ATTACHMENT_BYTES, isPdf: true }),
    ).not.toThrow();
    expect(() =>
      assertCanAttach(draft(), 0, { size: MAX_ATTACHMENT_BYTES + 1, isPdf: true }),
    ).toThrow(AttachmentRejectedError);
  });

  it('cannot attach to a withdrawn announcement', () => {
    expect(() => assertCanAttach(withdraw(published()), 0, pdf)).toThrow(
      InvalidAnnouncementTransitionError,
    );
  });
});
