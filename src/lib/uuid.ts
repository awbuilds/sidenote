const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Postgres `uuid` columns reject anything else; the sync engine relies on this. */
export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}
