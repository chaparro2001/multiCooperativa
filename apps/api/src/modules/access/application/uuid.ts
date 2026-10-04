const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ids from the outside are checked before reaching the database, whose uuid columns reject anything else. */
export function isUuid(value: string): boolean {
  return UUID.test(value);
}
