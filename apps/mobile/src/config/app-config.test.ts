import { describe, expect, it } from 'vitest';

import { parseAppConfig } from './app-config';

describe('parseAppConfig', () => {
  it('acepta una URL http(s) del API', () => {
    expect(parseAppConfig({ apiUrl: 'https://api.example.com' })).toEqual({
      apiUrl: 'https://api.example.com',
    });
  });

  it('quita la barra final para componer rutas sin duplicarla', () => {
    expect(parseAppConfig({ apiUrl: 'http://localhost:3000/' }).apiUrl).toBe(
      'http://localhost:3000',
    );
  });

  it('falla si falta la URL del API', () => {
    expect(() => parseAppConfig({ apiUrl: undefined })).toThrow(/apiUrl/);
  });

  it('falla si la URL no es http(s)', () => {
    expect(() => parseAppConfig({ apiUrl: 'ftp://api.example.com' })).toThrow(/apiUrl/);
  });
});
