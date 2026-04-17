import { appendFileSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import * as path from 'node:path';
import { getLogsDir } from '@main/platform/paths.js';
import { redactValue } from '@main/services/redactor.js';

// JSONL logger. One file per day, rotated on first write of a new day.
// Every payload passes through the redactor before write (FR-052).
//
// Writes are synchronous append — cheap on the main process, safe across
// restarts, and gives us "everything the process did before it crashed"
// coverage for free.

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';

const LEVEL_RANK: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
};

let minimumLevel: LogLevel = 'info';

export function setLogLevel(level: LogLevel): void {
  minimumLevel = level;
}

function currentLogFile(now: Date = new Date()): string {
  const y = now.getUTCFullYear().toString().padStart(4, '0');
  const m = (now.getUTCMonth() + 1).toString().padStart(2, '0');
  const d = now.getUTCDate().toString().padStart(2, '0');
  return path.resolve(getLogsDir(), `${y}-${m}-${d}.jsonl`);
}

export interface LogRecord {
  ts: string;
  level: LogLevel;
  msg: string;
  [key: string]: unknown;
}

export function log(level: LogLevel, msg: string, extras: Record<string, unknown> = {}): void {
  if (LEVEL_RANK[level] < LEVEL_RANK[minimumLevel]) return;
  const record: LogRecord = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...(redactValue(extras) as Record<string, unknown>),
  };
  try {
    appendFileSync(currentLogFile(), `${JSON.stringify(record)}\n`, 'utf-8');
  } catch {
    // If the log write itself fails, there's nowhere useful to report it;
    // surfacing to the user would defeat the "errors are actionable" rule
    // by surfacing infrastructure noise. Drop silently.
  }
}

export const logger = {
  trace: (msg: string, extras?: Record<string, unknown>) => log('trace', msg, extras),
  debug: (msg: string, extras?: Record<string, unknown>) => log('debug', msg, extras),
  info: (msg: string, extras?: Record<string, unknown>) => log('info', msg, extras),
  warn: (msg: string, extras?: Record<string, unknown>) => log('warn', msg, extras),
  error: (msg: string, extras?: Record<string, unknown>) => log('error', msg, extras),
};

/**
 * Drop `.jsonl` files older than `retentionDays`. Called on app launch; no
 * in-memory scheduler so the file system is the only source of truth.
 */
export function enforceRetention(retentionDays: number, now: Date = new Date()): void {
  const dir = getLogsDir();
  const cutoffMs = now.getTime() - retentionDays * 86_400_000;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.endsWith('.jsonl')) continue;
    const p = path.resolve(dir, entry);
    try {
      const stat = statSync(p);
      if (stat.mtimeMs < cutoffMs) unlinkSync(p);
    } catch {
      // Skip files we can't stat/delete; they'll age out on the next launch.
    }
  }
}
