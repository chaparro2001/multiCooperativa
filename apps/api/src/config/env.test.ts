import { describe, expect, it } from 'vitest';

import { loadEnv } from './env';

const DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
const JWT_SECRET = 'x'.repeat(32);
const required = { DATABASE_URL, JWT_SECRET };

describe('loadEnv', () => {
  it('aplica los valores por defecto, con el almacenamiento local de docker-compose', () => {
    expect(loadEnv(required)).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      DATABASE_URL,
      JWT_SECRET,
      S3_ENDPOINT: 'http://localhost:9000',
      S3_REGION: 'us-east-1',
      S3_BUCKET: 'multicooperativa',
      S3_ACCESS_KEY_ID: 'multicooperativa',
      S3_SECRET_ACCESS_KEY: 'multicooperativa-dev',
      S3_FORCE_PATH_STYLE: true,
      OLLAMA_URL: 'http://localhost:11434',
      EMBEDDING_MODEL: 'bge-m3',
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

  it('en producción exige el almacenamiento (ADR-005) y Ollama (ADR-006)', () => {
    expect(() => loadEnv({ ...required, NODE_ENV: 'production' })).toThrow(
      /S3_BUCKET.*S3_ACCESS_KEY_ID.*S3_SECRET_ACCESS_KEY.*OLLAMA_URL/,
    );
  });

  it('en producción sin S3_ENDPOINT usa AWS S3', () => {
    const env = loadEnv({
      ...required,
      NODE_ENV: 'production',
      S3_BUCKET: 'docs-prod',
      S3_ACCESS_KEY_ID: 'id',
      S3_SECRET_ACCESS_KEY: 'secret',
      S3_FORCE_PATH_STYLE: 'false',
      OLLAMA_URL: 'http://ollama.internal:11434',
    });

    expect(env).toMatchObject({
      S3_ENDPOINT: undefined,
      S3_BUCKET: 'docs-prod',
      S3_FORCE_PATH_STYLE: false,
    });
  });
});
