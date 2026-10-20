/** The email identifies a user platform-wide (BR-ACC-01), so it is compared normalized. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
