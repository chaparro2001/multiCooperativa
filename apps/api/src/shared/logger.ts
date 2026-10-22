/**
 * Port for structured logging. Application code depends on this, never on the concrete logger
 * in shared/infrastructure/log.ts, which is wired in each module's index.ts.
 */
export type LogFields = Record<string, unknown>;

export interface Logger {
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
}
