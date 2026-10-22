/**
 * One JSON line per event: `{"level":"warn","event":"gemini_retry",...}`. No message text from
 * users and no secrets: callers pass identifiers and counters (NFR-ACC-08 keeps tokens out of logs).
 */
export type LogLevel = 'info' | 'warn' | 'error';

export type LogFields = Record<string, unknown>;

function write(level: LogLevel, event: string, fields: LogFields): void {
  const line = JSON.stringify({ level, event, ...fields });
  // stdout for info, stderr for the rest: the container runtime collects both.
  if (level === 'info') console.info(line);
  else if (level === 'warn') console.warn(line);
  else console.error(line);
}

/** `error` field of a log line: the stack of an Error, the value itself otherwise. */
export function describeError(error: unknown): unknown {
  return error instanceof Error ? (error.stack ?? error.message) : error;
}

export const log = {
  info: (event: string, fields: LogFields = {}) => write('info', event, fields),
  warn: (event: string, fields: LogFields = {}) => write('warn', event, fields),
  error: (event: string, fields: LogFields = {}) => write('error', event, fields),
};
