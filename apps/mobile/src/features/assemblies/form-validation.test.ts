import { describe, expect, it } from 'vitest';

import { ApiError } from '@/api/api-error';
import { routeServerError } from '@/forms/server-errors';

import { newPoint } from './agenda';
import {
  ASSEMBLY_SERVER_MAPPING,
  type AssemblyDraft,
  isAssemblyField,
  isRescheduleField,
  RESCHEDULE_SERVER_MAPPING,
  type RescheduleDraft,
  validateAssembly,
  validateReschedule,
} from './form-validation';

const first = new Date('2026-11-20T19:00:00Z');

const draft = (overrides: Partial<AssemblyDraft> = {}): AssemblyDraft => ({
  type: 'ordinary',
  firstCall: first,
  secondCall: null,
  place: 'Social hall',
  points: [{ ...newPoint(), title: 'Approval of accounts' }],
  ...overrides,
});

describe('validateAssembly (US-ASM-01, US-ASM-02)', () => {
  it('accepts a complete draft', () => {
    expect(validateAssembly(draft())).toEqual({});
  });

  it('marks the missing place and every agenda item without a title', () => {
    const errors = validateAssembly(
      draft({ place: ' ', points: [newPoint(), { ...newPoint(), title: 'Ok' }, newPoint()] }),
    );
    expect(Object.keys(errors).sort()).toEqual(['place', 'points.0.title', 'points.2.title']);
    expect(errors.place?.key).toBe('forms.errors.required');
  });

  it('marks a second call that is not after the first', () => {
    const errors = validateAssembly(draft({ secondCall: first }));
    expect(errors.secondCall?.key).toBe('assemblies.editor.errors.secondBeforeFirst');
    expect(validateAssembly(draft({ secondCall: new Date(first.getTime() + 1800000) }))).toEqual(
      {},
    );
  });

  it('marks texts over the contract limits on their rows', () => {
    const errors = validateAssembly(
      draft({
        place: 'P'.repeat(201),
        points: [{ ...newPoint(), title: 'T'.repeat(201), description: 'D'.repeat(5001) }],
      }),
    );
    expect(errors.place?.key).toBe('forms.errors.tooLong');
    expect(errors['points.0.title']?.key).toBe('forms.errors.tooLong');
    expect(errors['points.0.description']?.key).toBe('forms.errors.tooLong');
  });

  it('marks an invalid first call date', () => {
    expect(validateAssembly(draft({ firstCall: new Date('nope') })).firstCall?.key).toBe(
      'forms.errors.required',
    );
  });
});

describe('API errors on the assembly editor', () => {
  const route = (error: ApiError) =>
    routeServerError(error, ASSEMBLY_SERVER_MAPPING, isAssemblyField);

  it('puts the date rules on the date fields', () => {
    expect(
      Object.keys(
        route(new ApiError(400, 'invalid_assembly', '', { field: 'secondCallAt' })).fields,
      ),
    ).toEqual(['secondCall']);
    expect(
      Object.keys(
        route(new ApiError(400, 'invalid_assembly', '', { field: 'firstCallAt' })).fields,
      ),
    ).toEqual(['firstCall']);
  });

  it('puts an agenda item rule on its row', () => {
    expect(
      Object.keys(
        route(new ApiError(400, 'invalid_assembly', '', { field: 'points.1.title' })).fields,
      ),
    ).toEqual(['points.1.title']);
  });

  it('maps the Zod issues of invalid_request', () => {
    const { fields } = route(
      new ApiError(400, 'invalid_request', '', {
        issues: [{ path: 'place', code: 'too_big' }],
      }),
    );
    expect(Object.keys(fields)).toEqual(['place']);
  });
});

describe('validateReschedule (US-ASM-09)', () => {
  const now = new Date('2026-10-01T10:00:00Z');
  const change = (overrides: Partial<RescheduleDraft> = {}): RescheduleDraft => ({
    firstCall: new Date('2026-11-20T19:00:00Z'),
    secondCall: null,
    place: 'Social hall',
    reason: '',
    notifyMembers: true,
    ...overrides,
  });

  it('accepts a future date with a place; the reason is optional', () => {
    expect(validateReschedule(change(), now)).toEqual({});
  });

  it('marks a past date, a second call before the first, a missing place and a long reason', () => {
    const past = change({ firstCall: new Date('2026-09-01T10:00:00Z') });
    expect(validateReschedule(past, now)).toHaveProperty('firstCall');
    const early = change({ secondCall: new Date('2026-11-20T19:00:00Z') });
    expect(validateReschedule(early, now)).toHaveProperty('secondCall');
    expect(validateReschedule(change({ place: ' ' }), now)).toHaveProperty('place');
    expect(validateReschedule(change({ reason: 'x'.repeat(501) }), now)).toHaveProperty('reason');
  });

  it('places the notice error of the API on the first call field with the minimum days', () => {
    const routed = routeServerError(
      new ApiError(400, 'insufficient_notice', '', { field: 'firstCallAt', minNoticeDays: 15 }),
      RESCHEDULE_SERVER_MAPPING,
      isRescheduleField,
    );
    expect(routed.banner).toBeNull();
    expect(routed.fields.firstCall).toEqual({
      key: 'forms.serverField.insufficient_notice.firstCallAt',
      params: { field: 'firstCallAt', minNoticeDays: 15 },
    });
  });
});
