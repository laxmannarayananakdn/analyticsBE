/**
 * File logger for FIS report processing.
 * Tees existing console output (timing + SQL PRINT) into backend/logs/
 * on local dev only (not Azure). Does not add new log messages.
 *
 * Filename: <RunNumber>_<ENTITY>_<asOfPeriod>_<Actual|Budget|ActualBudget>.log
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import fs from 'fs';
import path from 'path';
import util from 'util';

const LOG_DIR = path.join(process.cwd(), 'logs');

type FisProcessLogStore = {
  logPath: string;
};

const als = new AsyncLocalStorage<FisProcessLogStore>();

let consolePatched = false;
const originalConsole = {
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

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
  if (process.env.FIS_PROCESS_LOG === 'false') return false;
  if (process.env.FIS_PROCESS_LOG === 'true') return !isAzureHosted();
  return !isAzureHosted() && process.env.NODE_ENV === 'development';
}

function ensureLogDir(): void {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function sanitizeSegment(value: string): string {
  return String(value).trim().replace(/[^a-zA-Z0-9_-]/g, '_') || 'unknown';
}

export function resolveFisLogTbSide(params: {
  actualUploadId?: number | null;
  budgetUploadId?: number | null;
}): 'Actual' | 'Budget' | 'ActualBudget' {
  const hasActual = params.actualUploadId != null;
  const hasBudget = params.budgetUploadId != null;
  if (hasActual && hasBudget) return 'ActualBudget';
  if (hasBudget && !hasActual) return 'Budget';
  return 'Actual';
}

function buildLogFilePath(context: {
  runId: number;
  entity: string;
  asOfPeriod: string;
  actualUploadId?: number | null;
  budgetUploadId?: number | null;
}): string {
  const tbSide = resolveFisLogTbSide(context);
  const name = [
    context.runId,
    sanitizeSegment(context.entity),
    sanitizeSegment(context.asOfPeriod),
    tbSide,
  ].join('_');
  return path.join(LOG_DIR, `${name}.log`);
}

function formatConsoleArgs(args: unknown[]): string {
  return args
    .map((arg) => {
      if (typeof arg === 'string') return arg;
      if (arg instanceof Error) return arg.stack || arg.message;
      return util.inspect(arg, { depth: 4, breakLength: 120 });
    })
    .join(' ');
}

function appendToActiveLog(message: string): void {
  const store = als.getStore();
  if (!store) return;
  try {
    fs.appendFileSync(store.logPath, `${new Date().toISOString()} ${message}\n`, 'utf8');
  } catch (err) {
    originalConsole.error('Failed to write FIS process log file:', err);
  }
}

function ensureConsolePatched(): void {
  if (consolePatched) return;
  consolePatched = true;

  console.log = (...args: unknown[]) => {
    originalConsole.log(...args);
    appendToActiveLog(formatConsoleArgs(args));
  };
  console.warn = (...args: unknown[]) => {
    originalConsole.warn(...args);
    appendToActiveLog(formatConsoleArgs(args));
  };
  console.error = (...args: unknown[]) => {
    originalConsole.error(...args);
    appendToActiveLog(formatConsoleArgs(args));
  };
}

export function getFisProcessLogPath(): string | null {
  return als.getStore()?.logPath ?? null;
}

/**
 * Run FIS generation with console output teed to a per-run log file (local only).
 * No-op on Azure / when disabled / when runId is missing.
 */
export async function withFisProcessLog<T>(
  context: {
    runId: number | null;
    entity: string;
    asOfPeriod: string;
    reportTypeCode?: string;
    actualUploadId?: number | null;
    budgetUploadId?: number | null;
  },
  fn: () => Promise<T>
): Promise<T> {
  if (!isFileLoggingEnabled() || context.runId == null) {
    return fn();
  }

  ensureConsolePatched();
  ensureLogDir();
  const logPath = buildLogFilePath({
    runId: context.runId,
    entity: context.entity,
    asOfPeriod: context.asOfPeriod,
    actualUploadId: context.actualUploadId,
    budgetUploadId: context.budgetUploadId,
  });

  const header = [
    `========== FIS process started ==========`,
    `run_id=${context.runId}`,
    `entity=${context.entity}`,
    `as_of_period=${context.asOfPeriod}`,
    context.reportTypeCode ? `report_type=${context.reportTypeCode}` : null,
    `tb=${resolveFisLogTbSide(context)}`,
    `log_file=${logPath}`,
  ]
    .filter(Boolean)
    .join(' ');

  try {
    fs.writeFileSync(logPath, `${new Date().toISOString()} ${header}\n`, 'utf8');
  } catch (err) {
    originalConsole.error('Failed to create FIS process log file:', err);
    return fn();
  }

  return als.run({ logPath }, fn);
}
