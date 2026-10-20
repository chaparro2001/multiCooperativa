import { describe, expect, it } from 'vitest';

import { seedRefusal } from './seed-guard';

const local = 'postgresql://u:p@localhost:5432/db';
const neon = 'postgresql://u:p@ep-cool-123.eu-central-1.aws.neon.tech/neondb?sslmode=require';

describe('seedRefusal (sample data never reaches a real database by accident)', () => {
  it('allows a local database outside production', () => {
    expect(
      seedRefusal({ nodeEnv: 'development', databaseUrl: local, allowProduction: false }),
    ).toBe(null);
  });

  it('refuses a remote database without the flag, and names the host', () => {
    expect(
      seedRefusal({ nodeEnv: 'development', databaseUrl: neon, allowProduction: false }),
    ).toMatch(/ep-cool-123\.eu-central-1\.aws\.neon\.tech.*--allow-production/);
  });

  it('refuses NODE_ENV=production even on a local host', () => {
    expect(
      seedRefusal({ nodeEnv: 'production', databaseUrl: local, allowProduction: false }),
    ).toMatch(/--allow-production/);
  });

  it('allows everything with the explicit flag', () => {
    expect(seedRefusal({ nodeEnv: 'production', databaseUrl: neon, allowProduction: true })).toBe(
      null,
    );
  });
});
