/**
 * File logger for ManageBac term-grades sync diagnostics.
 * Writes to backend/logs/term-grades-sync.log on local dev only (not Azure).
 * Always mirrors to console.
 */

import fs from 'fs';
import path from 'path';

const LOG_DIR = path.join(process.cwd(), 'logs');
const LOG_FILE = path.join(LOG_DIR, 'term-grades-sync.log');

/** Azure App Service / Functions set these; absent on a typical local machine. */
function isAzureHosted(): boolean {
  return Boolean(
    process.env.WEBSITE_SITE_NAME ||
      process.env.WEBSITE_INSTANCE_ID ||
      process.env.AZURE_FUNCTIONS_ENVIRONMENT
  );
}

/** File logging: local development only unless explicitly forced off/on. */
function isFileLoggingEnabled(): boolean {
  if (process.env.MB_TERM_GRADE_SYNC_LOG === 'false') return false;
  if (process.env.MB_TERM_GRADE_SYNC_LOG === 'true') return !isAzureHosted();
  return !isAzureHosted() && process.env.NODE_ENV === 'development';
}

function ensureLogDir(): void {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function writeToConsole(level: 'INFO' | 'WARN' | 'ERROR', message: string): void {
  if (level === 'WARN') {
    console.warn(message);
  } else if (level === 'ERROR') {
    console.error(message);
  } else {
    console.log(message);
  }
}

function write(level: 'INFO' | 'WARN' | 'ERROR', message: string): void {
  if (isFileLoggingEnabled()) {
    const line = `${new Date().toISOString()} [${level}] ${message}`;
    try {
      ensureLogDir();
      fs.appendFileSync(LOG_FILE, `${line}\n`, 'utf8');
    } catch (err) {
      console.error('Failed to write term-grades sync log file:', err);
    }
  }
  writeToConsole(level, message);
}

export function getTermGradeSyncLogPath(): string | null {
  return isFileLoggingEnabled() ? LOG_FILE : null;
}

export function beginTermGradeSyncLog(context: {
  schoolId?: number | string;
  academicYear?: string;
  syncRunId?: number;
}): void {
  const parts = [
    `school_id=${context.schoolId ?? 'unknown'}`,
    `academic_year=${context.academicYear ?? '(none)'}`,
  ];
  if (context.syncRunId != null) {
    parts.push(`sync_run_id=${context.syncRunId}`);
  }
  write('INFO', `\n========== term-grades sync started ${parts.join(' ')} ==========`);
  const logPath = getTermGradeSyncLogPath();
  if (logPath) {
    write('INFO', `Log file: ${logPath}`);
  }
}

export function logTermGradeSync(message: string): void {
  write('INFO', message);
}

export function warnTermGradeSync(message: string): void {
  write('WARN', message);
}

export function errorTermGradeSync(message: string): void {
  write('ERROR', message);
}
