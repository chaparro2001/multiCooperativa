import { describe, expect, it } from 'vitest';

import { loadEnv } from './env';

const DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
const JWT_SECRET = 'x'.repeat(32);
const required = { DATABASE_URL, JWT_SECRET };

describe('loadEnv', () => {
  it('applies the defaults, with the local docker-compose storage', () => {
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
      EMBEDDINGS_PROVIDER: 'ollama',
      GEMINI_EMBEDDING_MODEL: 'gemini-embedding-2',
      OLLAMA_URL: 'http://localhost:11434',
      EMBEDDING_MODEL: 'bge-m3',
      GEMINI_MODEL: 'gemini-3.8-flash',
      GEMINI_FALLBACK_MODELS: ['gemini-3.6-flash', 'gemini-3.1-flash-lite'],
      ASSISTANT_MESSAGE_LIMIT_PER_HOUR: 30,
      CORS_ORIGINS: ['http://localhost:8081'],
    });
  });

  it('NFR-AI-03: the Gemini key is optional and the assistant limit and model are configurable', () => {
    expect(loadEnv(required).GEMINI_API_KEY).toBeUndefined();
    const configured = loadEnv({
      ...required,
      GEMINI_API_KEY: 'gemini-test-key',
      GEMINI_MODEL: 'gemini-3.5-flash-lite',
      ASSISTANT_MESSAGE_LIMIT_PER_HOUR: '10',
    });
    expect(configured).toMatchObject({
      GEMINI_API_KEY: 'gemini-test-key',
      GEMINI_MODEL: 'gemini-3.5-flash-lite',
      ASSISTANT_MESSAGE_LIMIT_PER_HOUR: 10,
    });
    expect(() => loadEnv({ ...required, ASSISTANT_MESSAGE_LIMIT_PER_HOUR: '0' })).toThrow();
  });

  it('parses GEMINI_FALLBACK_MODELS as a list; an empty value disables the fallback (ADR-009)', () => {
    expect(
      loadEnv({ ...required, GEMINI_FALLBACK_MODELS: ' gemini-a , gemini-b,, ' })
        .GEMINI_FALLBACK_MODELS,
    ).toEqual(['gemini-a', 'gemini-b']);
    expect(loadEnv({ ...required, GEMINI_FALLBACK_MODELS: '' }).GEMINI_FALLBACK_MODELS).toEqual([]);
    expect(() => loadEnv({ ...required, GEMINI_FALLBACK_MODELS: 'bad model!' })).toThrow(
      /GEMINI_FALLBACK_MODELS/,
    );
  });

  it('converts the port to a number', () => {
    expect(loadEnv({ ...required, PORT: '8080' }).PORT).toBe(8080);
  });

  it('rejects a non-numeric port naming the variable', () => {
    expect(() => loadEnv({ ...required, PORT: 'abc' })).toThrow(/PORT/);
  });

  it('rejects an unknown environment', () => {
    expect(() => loadEnv({ ...required, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });

  it('requires DATABASE_URL', () => {
    expect(() => loadEnv({ JWT_SECRET })).toThrow(/DATABASE_URL/);
  });

  it('rejects a DATABASE_URL that is not PostgreSQL', () => {
    expect(() => loadEnv({ JWT_SECRET, DATABASE_URL: 'mysql://localhost/db' })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('requires a JWT_SECRET of at least 32 characters', () => {
    expect(() => loadEnv({ DATABASE_URL })).toThrow(/JWT_SECRET/);
    expect(() => loadEnv({ DATABASE_URL, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
  });

  it('in production requires storage (ADR-005) and Ollama (ADR-006)', () => {
    expect(() => loadEnv({ ...required, NODE_ENV: 'production' })).toThrow(
      /S3_BUCKET.*S3_ACCESS_KEY_ID.*S3_SECRET_ACCESS_KEY.*OLLAMA_URL/,
    );
  });

  it('in production without S3_ENDPOINT uses AWS S3', () => {
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

  describe('hosted demo (ADR-010)', () => {
    const production = {
      ...required,
      NODE_ENV: 'production',
      S3_BUCKET: 'multicooperativa',
      S3_ACCESS_KEY_ID: 'key',
      S3_SECRET_ACCESS_KEY: 'secret',
    };

    it('production with the Gemini provider needs the key but not Ollama', () => {
      expect(() => loadEnv({ ...production, EMBEDDINGS_PROVIDER: 'gemini' })).toThrow(
        /GEMINI_API_KEY: required with EMBEDDINGS_PROVIDER=gemini/,
      );
      const env = loadEnv({
        ...production,
        EMBEDDINGS_PROVIDER: 'gemini',
        GEMINI_API_KEY: 'gemini-test-key',
      });
      expect(env.EMBEDDINGS_PROVIDER).toBe('gemini');
    });

    it('production with the default provider still requires OLLAMA_URL', () => {
      expect(() => loadEnv(production)).toThrow(/OLLAMA_URL: required in production/);
    });

    it('rejects an unknown embeddings provider', () => {
      expect(() => loadEnv({ ...required, EMBEDDINGS_PROVIDER: 'openai' })).toThrow(
        /EMBEDDINGS_PROVIDER/,
      );
    });

    it('CORS_ORIGINS is a trimmed comma-separated list; production denies all by default', () => {
      const base = { ...production, EMBEDDINGS_PROVIDER: 'gemini', GEMINI_API_KEY: 'k' };
      expect(loadEnv(base).CORS_ORIGINS).toEqual([]);
      expect(
        loadEnv({
          ...base,
          CORS_ORIGINS: ' https://chaparro2001.github.io/ , http://localhost:8081 ',
        }).CORS_ORIGINS,
      ).toEqual(['https://chaparro2001.github.io', 'http://localhost:8081']);
      expect(() => loadEnv({ ...base, CORS_ORIGINS: 'not a url' })).toThrow(/CORS_ORIGINS/);
    });

    it('JOBS_TOKEN must be at least 32 characters when set', () => {
      expect(loadEnv(required).JOBS_TOKEN).toBeUndefined();
      expect(() => loadEnv({ ...required, JOBS_TOKEN: 'short' })).toThrow(/JOBS_TOKEN/);
      expect(loadEnv({ ...required, JOBS_TOKEN: 'j'.repeat(32) }).JOBS_TOKEN).toBe('j'.repeat(32));
    });
  });
});
