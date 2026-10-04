import { execSync } from 'node:child_process';

/** Creates the test database if needed and brings it up to date. */
export default function setup(): void {
  execSync('pnpm exec prisma migrate deploy', { stdio: 'pipe', env: process.env });
}
