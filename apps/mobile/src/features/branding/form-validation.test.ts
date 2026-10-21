import { describe, expect, it } from 'vitest';

import { ApiError } from '@/api/api-error';
import { messageText } from '@/forms/errors';
import { routeServerError } from '@/forms/server-errors';

import { BRAND_FIELDS, BRAND_SERVER_MAPPING, validateBrandColor } from './form-validation';

describe('validateBrandColor (US-ACC-14, BR-ACC-16)', () => {
  it('accepts a colour with enough contrast against white text', () => {
    expect(validateBrandColor({ color: '#1E5AA8' })).toEqual({});
    expect(validateBrandColor({ color: '1e5aa8' })).toEqual({});
  });

  it('marks an empty or malformed colour', () => {
    expect(validateBrandColor({ color: '  ' }).color?.key).toBe('forms.errors.required');
    expect(validateBrandColor({ color: '#12345' }).color?.key).toBe('errors.codes.invalid_color');
    expect(validateBrandColor({ color: 'azul' }).color?.key).toBe('errors.codes.invalid_color');
  });

  it('marks a light colour with the measured ratio', () => {
    const { color } = validateBrandColor({ color: '#FFFF00' });
    expect(color?.key).toBe('errors.codes.insufficient_contrast');
    expect(messageText(color!)).toMatch(/1,07:1|1,1:1|1,\d+:1/);
    expect(messageText(color!)).toContain('4,5');
  });
});

describe('API errors on the appearance colour (BR-ACC-16)', () => {
  const route = (error: ApiError) =>
    routeServerError(error, BRAND_SERVER_MAPPING, (f) =>
      (BRAND_FIELDS as readonly string[]).includes(f),
    );

  it('puts insufficient_contrast on the colour field with the ratio', () => {
    const { fields, banner } = route(
      new ApiError(400, 'insufficient_contrast', '', { ratio: 2.35, minimum: 4.5 }),
    );
    expect(Object.keys(fields)).toEqual(['color']);
    expect(messageText(fields.color!)).toContain('2,35');
    expect(banner).toBeNull();
  });

  it('puts invalid_color on the colour field', () => {
    expect(Object.keys(route(new ApiError(400, 'invalid_color', '')).fields)).toEqual(['color']);
  });
});
