/**
 * Map FIS SFTP finance filenames to EF file type codes.
 *
 * Dictionary: Dic_{Type}_{...}.xlsx  e.g. Dic_Account_202604.xlsx
 * Trial balance: TB_{...}_{Actual|Budget}.xlsx  e.g. TB_202601_TZES_Actual.xlsx
 */

const DIC_TYPE_TO_FILE_CODE: Record<string, string> = {
  Account: 'FIN_DIC_ACCOUNT',
  Activity: 'FIN_DIC_ACTIVITY',
  Department: 'FIN_DIC_DEPARTMENT',
  FixedAssets: 'FIN_DIC_FIXED_ASSETS',
  OperatingUnit: 'FIN_DIC_OPERATING_UNIT',
  Party: 'FIN_DIC_PARTY',
  Project: 'FIN_DIC_PROJECT',
  Reference: 'FIN_DIC_REFERENCE',
  Region: 'FIN_DIC_REGION',
  Resource: 'FIN_DIC_RESOURCE',
  SourceOfFund: 'FIN_DIC_SOURCE_OF_FUND',
};

export type FinanceFileCategory = 'DIC' | 'TB' | 'UNKNOWN';

export interface ResolvedFinanceFileType {
  fileTypeCode: string;
  category: FinanceFileCategory;
}

export function getFinanceFileCategory(fileName: string): FinanceFileCategory {
  const base = fileName.trim();
  if (/^Dic_/i.test(base)) return 'DIC';
  if (/^TB_/i.test(base)) return 'TB';
  return 'UNKNOWN';
}

/**
 * Resolve filename to EF file type code, or null if unrecognized.
 */
export function resolveFinanceFileType(fileName: string): ResolvedFinanceFileType | null {
  const base = fileName.trim();
  const category = getFinanceFileCategory(base);

  if (category === 'DIC') {
    const match = base.match(/^Dic_([^_.]+)/i);
    if (!match) return null;
    const dicType = match[1];
    const fileTypeCode = DIC_TYPE_TO_FILE_CODE[dicType];
    if (!fileTypeCode) return null;
    return { fileTypeCode, category: 'DIC' };
  }

  if (category === 'TB') {
    if (/_(Actual)\./i.test(base)) {
      return { fileTypeCode: 'FIN_TB_ACTUAL', category: 'TB' };
    }
    if (/_(Budget)\./i.test(base)) {
      return { fileTypeCode: 'FIN_TB_BUDGET', category: 'TB' };
    }
    return null;
  }

  return null;
}

export function isFinanceFileTypeCode(fileTypeCode: string): boolean {
  const upper = fileTypeCode.toUpperCase();
  return upper.startsWith('FIN_DIC_') || upper === 'FIN_TB_ACTUAL' || upper === 'FIN_TB_BUDGET';
}

export interface ParsedTrialBalanceFileName {
  /** Normalized file name (no path) */
  sourceFileName: string;
  periodYyyymm: string;
  entityCode: string;
  tbKind: 'ACTUAL' | 'BUDGET';
  fiscalYear: number;
  fiscalMonth: number;
  /** Human-readable column label, e.g. "January 2026 Actual" */
  columnLabel: string;
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/**
 * Parse TB_YYYYMM_ENTY_Actual|Budget.xlsx filenames.
 */
export function parseTrialBalanceFileName(fileName: string): ParsedTrialBalanceFileName | null {
  const base = fileName.trim().replace(/^.*[/\\]/, '');
  // Extension optional (some stores omit .xlsx); entity 2–10 chars
  const match = base.match(/^TB_(\d{6})_([A-Za-z0-9]{2,10})_(Actual|Budget)(?:\.[A-Za-z0-9]+)?$/i);
  if (!match) return null;

  const periodYyyymm = match[1];
  const entityCode = match[2].toUpperCase();
  const tbSuffix = match[3].toLowerCase();
  const tbKind: 'ACTUAL' | 'BUDGET' = tbSuffix === 'budget' ? 'BUDGET' : 'ACTUAL';

  const fiscalYear = parseInt(periodYyyymm.slice(0, 4), 10);
  const fiscalMonth = parseInt(periodYyyymm.slice(4, 6), 10);
  if (
    !Number.isFinite(fiscalYear) ||
    !Number.isFinite(fiscalMonth) ||
    fiscalMonth < 1 ||
    fiscalMonth > 12
  ) {
    return null;
  }

  const monthName = MONTH_NAMES[fiscalMonth - 1];
  /** One FIS column per calendar month (Actual + Budget files share the same column). */
  const columnLabel = `${monthName} ${fiscalYear}`;

  return {
    sourceFileName: base,
    periodYyyymm,
    entityCode,
    tbKind,
    fiscalYear,
    fiscalMonth,
    columnLabel,
  };
}

/**
 * Build column metadata from entity + YYYYMM period (no file name required).
 */
export function parseTrialBalancePeriod(
  entityCode: string,
  periodYyyymm: string
): ParsedTrialBalanceFileName | null {
  const entity = entityCode.trim().toUpperCase();
  const period = periodYyyymm.trim();
  if (!entity || !/^\d{6}$/.test(period)) return null;

  const fiscalYear = parseInt(period.slice(0, 4), 10);
  const fiscalMonth = parseInt(period.slice(4, 6), 10);
  if (
    !Number.isFinite(fiscalYear) ||
    !Number.isFinite(fiscalMonth) ||
    fiscalMonth < 1 ||
    fiscalMonth > 12
  ) {
    return null;
  }

  const monthName = MONTH_NAMES[fiscalMonth - 1];
  return {
    sourceFileName: `TB_${period}_${entity}_Actual.xlsx`,
    periodYyyymm: period,
    entityCode: entity,
    tbKind: 'ACTUAL',
    fiscalYear,
    fiscalMonth,
    columnLabel: `${monthName} ${fiscalYear}`,
  };
}
