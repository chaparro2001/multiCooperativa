import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  hasErrors,
  issueMessage,
  mergeErrors,
  messageText,
  serverIssueErrors,
  zodFieldErrors,
} from './errors';

const schema = z.object({
  name: z.string().min(1).max(5),
  email: z.email(),
  qty: z.number().min(0),
  code: z.string().min(3),
  tags: z.array(z.string()).min(1),
  day: z.string().regex(/^\d{4}$/),
});

function errorsOf(input: unknown) {
  const result = schema.safeParse(input);
  if (result.success) throw new Error('expected failure');
  return zodFieldErrors(result.error);
}

describe('zodFieldErrors (usability of forms: contract run on the draft)', () => {
  it('maps the Zod issue codes to message keys', () => {
    const errors = errorsOf({ name: '', email: 'x', qty: -1, code: 'a', tags: [], day: 'abc' });
    expect(errors.name?.key).toBe('forms.errors.required');
    expect(errors.email?.key).toBe('forms.errors.email');
    expect(errors.qty?.key).toBe('forms.errors.mustBePositive');
    expect(errors.code).toEqual({ key: 'forms.errors.tooShort', params: { min: 3 } });
    expect(errors.tags?.key).toBe('forms.errors.required');
    expect(errors.day?.key).toBe('forms.errors.invalid');
  });

  it('reports a missing value as required and a too long one with its limit', () => {
    expect(errorsOf({}).name?.key).toBe('forms.errors.required');
    expect(errorsOf({ name: 'abcdefg' }).name).toEqual({
      key: 'forms.errors.tooLong',
      params: { max: 5 },
    });
  });

  it('keeps the first issue of each field and can rename or skip paths', () => {
    const result = schema.safeParse({});
    if (result.success) throw new Error('expected failure');
    const renamed = zodFieldErrors(result.error, (path) =>
      path[0] === 'day' ? 'date' : path[0] === 'tags' ? null : String(path[0]),
    );
    expect(renamed.date).toBeDefined();
    expect(renamed.day).toBeUndefined();
    expect(renamed.tags).toBeUndefined();
    expect(renamed.name).toBeDefined();
  });

  it('uses dotted paths for repeated rows', () => {
    const lines = z.object({ lines: z.array(z.object({ concept: z.string().min(1) })) });
    const result = lines.safeParse({ lines: [{ concept: 'a' }, { concept: '' }] });
    if (result.success) throw new Error('expected failure');
    expect(Object.keys(zodFieldErrors(result.error))).toEqual(['lines.1.concept']);
  });

  it('turns a number minimum of zero into "must be positive"', () => {
    expect(issueMessage({ code: 'too_small', path: [], origin: 'number', minimum: 0 }).key).toBe(
      'forms.errors.mustBePositive',
    );
  });
});

describe('serverIssueErrors (details.issues of a 400 invalid_request)', () => {
  it('maps path and code to field errors', () => {
    const errors = serverIssueErrors({
      issues: [
        { path: 'email', code: 'invalid_format' },
        { path: 'lines.0.concept', code: 'too_small' },
        { path: 'email', code: 'too_big' },
        { path: '', code: 'invalid_type' },
        'bogus',
      ],
    });
    expect(Object.keys(errors)).toEqual(['email', 'lines.0.concept']);
    expect(errors.email?.key).toBe('forms.errors.invalid');
  });

  it('is empty when the API sends no issues (older servers)', () => {
    expect(serverIssueErrors({})).toEqual({});
    expect(serverIssueErrors({ issues: 'nope' })).toEqual({});
  });

  it('renames fields', () => {
    const errors = serverIssueErrors(
      { issues: [{ path: 'issueDate', code: 'invalid_format' }] },
      (p) => (p === 'issueDate' ? 'date' : p),
    );
    expect(Object.keys(errors)).toEqual(['date']);
  });
});

describe('helpers', () => {
  it('merges with the first result winning and detects emptiness', () => {
    const merged = mergeErrors(
      { a: { key: 'forms.errors.required' } },
      { a: { key: 'forms.errors.invalid' }, b: { key: 'forms.errors.invalid' } },
    );
    expect(merged.a?.key).toBe('forms.errors.required');
    expect(hasErrors(merged)).toBe(true);
    expect(hasErrors({})).toBe(false);
  });

  it('localizes every key with its params', () => {
    expect(messageText({ key: 'forms.errors.tooLong', params: { max: 5 } })).toContain('5');
  });
});
