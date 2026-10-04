import { describe, expect, it } from 'vitest';

import { loadEnv } from './env';

describe('loadEnv', () => {
  it('aplica los valores por defecto', () => {
    expect(loadEnv({})).toEqual({ NODE_ENV: 'development', PORT: 3000 });
  });

  it('convierte el puerto a número', () => {
    expect(loadEnv({ PORT: '8080' }).PORT).toBe(8080);
  });

  it('rechaza un puerto no numérico indicando la variable', () => {
    expect(() => loadEnv({ PORT: 'abc' })).toThrow(/PORT/);
  });

  it('rechaza un entorno desconocido', () => {
    expect(() => loadEnv({ NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });
});
