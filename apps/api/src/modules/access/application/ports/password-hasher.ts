export interface PasswordHasher {
  hash(password: string): Promise<string>;
  /**
   * A null hash (unknown user or account not activated yet) is always false, and
   * takes as long as a real check so timing does not reveal whether the email exists.
   */
  verify(hash: string | null, password: string): Promise<boolean>;
}
