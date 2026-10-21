import { describe, expect, it } from 'vitest';

import {
  type AssemblyInput,
  assertCanAttach,
  cancel,
  close,
  convene,
  createDraft,
  editDraft,
  isVisible,
  orderForListing,
} from './assembly';
import {
  InsufficientNoticeError,
  InvalidAssemblyError,
  InvalidAssemblyTransitionError,
} from './errors';

const now = new Date('2026-10-01T10:00:00Z');
const inDays = (days: number) => new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

const input = (overrides: Partial<AssemblyInput> = {}): AssemblyInput => ({
  type: 'ordinary',
  firstCallAt: inDays(20),
  secondCallAt: null,
  place: ' Social hall ',
  points: [
    { title: 'Approval of accounts', description: '', votable: true, majority: 'simple' },
    {
      title: 'Chairman report',
      description: 'Year summary',
      votable: false,
      majority: null,
    },
  ],
  ...overrides,
});

describe('draft call (US-ASM-01, US-ASM-02)', () => {
  it('numbers the items in order and normalizes the texts', () => {
    const draft = createDraft(input());

    expect(draft).toMatchObject({ status: 'draft', place: 'Social hall' });
    expect(draft.points.map((p) => [p.position, p.title, p.majority])).toEqual([
      [1, 'Approval of accounts', 'simple'],
      [2, 'Chairman report', null],
    ]);
  });

  it('Given a votable item, then it requires a simple or reinforced majority', () => {
    expect(() =>
      createDraft(
        input({ points: [{ title: 'X', description: '', votable: true, majority: null }] }),
      ),
    ).toThrow(InvalidAssemblyError);
  });

  it('an informative item carries no majority', () => {
    const draft = createDraft(
      input({ points: [{ title: 'X', description: '', votable: false, majority: 'reinforced' }] }),
    );
    expect(draft.points[0]?.majority).toBeNull();
  });

  it('the second call is after the first', () => {
    expect(() => createDraft(input({ secondCallAt: inDays(19) }))).toThrow(InvalidAssemblyError);
  });

  it('requires the place and titles in all items', () => {
    expect(() => createDraft(input({ place: ' ' }))).toThrow(InvalidAssemblyError);
    expect(() =>
      createDraft(
        input({ points: [{ title: ' ', description: '', votable: false, majority: null }] }),
      ),
    ).toThrow(/Item 1/);
  });

  it('Given a draft, when I edit it, then I can add, remove and reorder items', () => {
    const edited = editDraft(
      createDraft(input()),
      input({
        points: [
          { title: 'New first', description: '', votable: false, majority: null },
          {
            id: 'p-1',
            title: 'Approval of accounts',
            description: '',
            votable: true,
            majority: 'reinforced',
          },
        ],
      }),
    );
    expect(edited.points.map((p) => [p.position, p.title, p.id])).toEqual([
      [1, 'New first', undefined],
      [2, 'Approval of accounts', 'p-1'],
    ]);
  });
});

describe('convene (US-ASM-01)', () => {
  it('Given a future date with enough notice and at least one item, then it becomes convened', () => {
    expect(convene(createDraft(input()), now, 15).status).toBe('convened');
  });

  it('Given a date with less notice than configured, then it is rejected stating the minimum notice', () => {
    const error = (() => {
      try {
        convene(createDraft(input({ firstCallAt: inDays(10) })), now, 15);
      } catch (e) {
        return e;
      }
    })();
    expect(error).toBeInstanceOf(InsufficientNoticeError);
    expect((error as InsufficientNoticeError).message).toContain('15 days');
  });

  it('exactly the minimum notice is valid', () => {
    expect(() => convene(createDraft(input({ firstCallAt: inDays(15) })), now, 15)).not.toThrow();
  });

  it('without items it is not convened', () => {
    expect(() => convene(createDraft(input({ points: [] })), now, 15)).toThrow(
      InvalidAssemblyError,
    );
  });

  it('a convened one is not convened again nor edited (BR-ASM-10)', () => {
    const convened = convene(createDraft(input()), now, 15);
    expect(() => convene(convened, now, 15)).toThrow(InvalidAssemblyTransitionError);
    expect(() => editDraft(convened, input())).toThrow(InvalidAssemblyTransitionError);
  });
});

describe('cancel and close', () => {
  const convened = () => convene(createDraft(input()), now, 15);

  it('a convened one is cancelled', () => {
    expect(cancel(convened()).status).toBe('cancelled');
    expect(() => cancel(createDraft(input()))).toThrow(InvalidAssemblyTransitionError);
  });

  it('it is closed (held) when no open votings remain', () => {
    expect(close(convened(), 0).status).toBe('held');
    expect(() => close(convened(), 1)).toThrow(/open votings/);
  });

  it('BR-ASM-10: held or cancelled admits no changes or documentation', () => {
    expect(() => editDraft(close(convened(), 0), input())).toThrow(InvalidAssemblyTransitionError);
    expect(() => assertCanAttach('cancelled')).toThrow(InvalidAssemblyTransitionError);
    expect(() => assertCanAttach('convened')).not.toThrow();
  });

  it('drafts are visible only with manage access', () => {
    expect(isVisible('draft', false)).toBe(false);
    expect(isVisible('convened', false)).toBe(true);
    expect(isVisible('draft', true)).toBe(true);
  });
});

describe('listing order (US-ASM-03)', () => {
  it('upcoming ones first by date and then the held ones, most recent first', () => {
    const at = (day: number) => new Date(Date.UTC(2026, 9, day));
    const ordered = orderForListing([
      { id: 'held-1', status: 'held', firstCallAt: at(1) },
      { id: 'upcoming-25', status: 'convened', firstCallAt: at(25) },
      { id: 'cancelled-5', status: 'cancelled', firstCallAt: at(5) },
      { id: 'upcoming-20', status: 'convened', firstCallAt: at(20) },
      { id: 'draft', status: 'draft', firstCallAt: at(30) },
    ] as const);

    expect(ordered.map((a) => a.id)).toEqual([
      'draft',
      'upcoming-20',
      'upcoming-25',
      'cancelled-5',
      'held-1',
    ]);
  });
});

describe('the field of a rule violation (usability of forms: details.field)', () => {
  const fieldOf = (run: () => unknown) => {
    try {
      run();
    } catch (error) {
      return (error as { field?: string }).field;
    }
    return 'no error';
  };

  it('names the place, the second call and the agenda item', () => {
    expect(fieldOf(() => createDraft(input({ place: ' ' })))).toBe('place');
    expect(fieldOf(() => createDraft(input({ secondCallAt: inDays(1) })))).toBe('secondCallAt');
    expect(
      fieldOf(() =>
        createDraft(
          input({
            points: [
              { title: 'A', description: '', votable: false, majority: null },
              { title: ' ', description: '', votable: false, majority: null },
            ],
          }),
        ),
      ),
    ).toBe('points.1.title');
  });
});
