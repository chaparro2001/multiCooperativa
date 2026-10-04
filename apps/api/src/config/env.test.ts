import { describe, expect, it } from 'vitest';

import { loadEnv } from './env';

const DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
const JWT_SECRET = 'x'.repeat(32);
const required = { DATABASE_URL, JWT_SECRET };

describe('loadEnv', () => {
  it('aplica los valores por defecto', () => {
    expect(loadEnv(required)).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      DATABASE_URL,
      JWT_SECRET,
    });
  });

  it('convierte el puerto a número', () => {
    expect(loadEnv({ ...required, PORT: '8080' }).PORT).toBe(8080);
  });

  it('rechaza un puerto no numérico indicando la variable', () => {
    expect(() => loadEnv({ ...required, PORT: 'abc' })).toThrow(/PORT/);
  });

  it('rechaza un entorno desconocido', () => {
    expect(() => loadEnv({ ...required, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });

  it('exige DATABASE_URL', () => {
    expect(() => loadEnv({ JWT_SECRET })).toThrow(/DATABASE_URL/);
  });

  it('rechaza una DATABASE_URL que no es de PostgreSQL', () => {
    expect(() => loadEnv({ JWT_SECRET, DATABASE_URL: 'mysql://localhost/db' })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('exige un JWT_SECRET de al menos 32 caracteres', () => {
    expect(() => loadEnv({ DATABASE_URL })).toThrow(/JWT_SECRET/);
    expect(() => loadEnv({ DATABASE_URL, JWT_SECRET: 'corto' })).toThrow(/JWT_SECRET/);
  });
});
