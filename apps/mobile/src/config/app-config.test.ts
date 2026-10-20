import { describe, expect, it } from 'vitest';

import { parseAppConfig } from './app-config';

describe('parseAppConfig', () => {
  it('accepts an http(s) API URL', () => {
    expect(parseAppConfig({ apiUrl: 'https://api.example.com' })).toEqual({
      apiUrl: 'https://api.example.com',
    });
  });

  it('strips the trailing slash so paths are not duplicated', () => {
    expect(parseAppConfig({ apiUrl: 'http://localhost:3000/' }).apiUrl).toBe(
      'http://localhost:3000',
    );
  });

  it('fails if the API URL is missing', () => {
    expect(() => parseAppConfig({ apiUrl: undefined })).toThrow(/apiUrl/);
  });

  it('fails if the URL is not http(s)', () => {
    expect(() => parseAppConfig({ apiUrl: 'ftp://api.example.com' })).toThrow(/apiUrl/);
  });
});
