import type { LogFields, Logger } from '../../../../shared/logger';

export interface LogEntry {
  level: 'info' | 'warn' | 'error';
  event: string;
  fields: LogFields;
}

/** Keeps what was logged so a test can assert on it (and nothing reaches the console). */
export class CapturingLogger implements Logger {
  readonly entries: LogEntry[] = [];

  info(event: string, fields: LogFields = {}) {
    this.entries.push({ level: 'info', event, fields });
  }
  warn(event: string, fields: LogFields = {}) {
    this.entries.push({ level: 'warn', event, fields });
  }
  error(event: string, fields: LogFields = {}) {
    this.entries.push({ level: 'error', event, fields });
  }
  of(level: LogEntry['level']) {
    return this.entries.filter((entry) => entry.level === level);
  }
}
