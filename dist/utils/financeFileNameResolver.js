/**
 * Map FIS SFTP finance filenames to EF file type codes.
 *
 * Dictionary: Dic_{Type}_{...}.xlsx  e.g. Dic_Account_202604.xlsx
 * Trial balance: TB_{...}_{Actual|Budget}.xlsx  e.g. TB_202601_TZES_Actual.xlsx
 */
const DIC_TYPE_TO_FILE_CODE = {
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
export function getFinanceFileCategory(fileName) {
    const base = fileName.trim();
    if (/^Dic_/i.test(base))
        return 'DIC';
    if (/^TB_/i.test(base))
        return 'TB';
    return 'UNKNOWN';
}
/**
 * Resolve filename to EF file type code, or null if unrecognized.
 */
export function resolveFinanceFileType(fileName) {
    const base = fileName.trim();
    const category = getFinanceFileCategory(base);
    if (category === 'DIC') {
        const match = base.match(/^Dic_([^_.]+)/i);
        if (!match)
            return null;
        const dicType = match[1];
        const fileTypeCode = DIC_TYPE_TO_FILE_CODE[dicType];
        if (!fileTypeCode)
            return null;
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
export function isFinanceFileTypeCode(fileTypeCode) {
    const upper = fileTypeCode.toUpperCase();
    return upper.startsWith('FIN_DIC_') || upper === 'FIN_TB_ACTUAL' || upper === 'FIN_TB_BUDGET';
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
export function parseTrialBalanceFileName(fileName) {
    const base = fileName.trim().replace(/^.*[/\\]/, '');
    // Extension optional (some stores omit .xlsx); entity 2–10 chars
    const match = base.match(/^TB_(\d{6})_([A-Za-z0-9]{2,10})_(Actual|Budget)(?:\.[A-Za-z0-9]+)?$/i);
    if (!match)
        return null;
    const periodYyyymm = match[1];
    const entityCode = match[2].toUpperCase();
    const tbSuffix = match[3].toLowerCase();
    const tbKind = tbSuffix === 'budget' ? 'BUDGET' : 'ACTUAL';
    const fiscalYear = parseInt(periodYyyymm.slice(0, 4), 10);
    const fiscalMonth = parseInt(periodYyyymm.slice(4, 6), 10);
    // Month 00 = Previous Year closing (Actual only). Months 01–12 = normal periods.
    if (!Number.isFinite(fiscalYear) ||
        !Number.isFinite(fiscalMonth) ||
        fiscalMonth < 0 ||
        fiscalMonth > 12) {
        return null;
    }
    // Previous Year TB is Actual-only — no Budget file for period …00.
    if (fiscalMonth === 0 && tbKind === 'BUDGET') {
        return null;
    }
    const columnLabel = fiscalMonth === 0
        ? `Previous Year ${fiscalYear}`
        : `${MONTH_NAMES[fiscalMonth - 1]} ${fiscalYear}`;
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
/**
 * Ensure TB filename parses and matches the submitted file type (Actual/Budget).
 * Throws when entity, period, or tb type cannot be derived or do not agree.
 */
export function validateTrialBalanceFileIdentity(fileName, fileTypeCode) {
    const base = fileName.trim().replace(/^.*[/\\]/, '');
    const parsed = parseTrialBalanceFileName(base);
    if (!parsed) {
        throw new Error(`Trial balance filename "${base}" is invalid. ` +
            'Expected format: TB_YYYYMM_ENTITY_Actual|Budget.xlsx ' +
            '(month 00 = Previous Year closing, Actual only).');
    }
    const upper = fileTypeCode.trim().toUpperCase();
    const expectedCode = parsed.tbKind === 'BUDGET' ? 'FIN_TB_BUDGET' : 'FIN_TB_ACTUAL';
    if (upper !== expectedCode) {
        throw new Error(`Trial balance filename "${base}" indicates ${parsed.tbKind} ` +
            `(entity ${parsed.entityCode}, period ${parsed.periodYyyymm}) ` +
            `but the file was submitted as ${fileTypeCode}.`);
    }
    const resolved = resolveFinanceFileType(base);
    if (!resolved || resolved.fileTypeCode !== expectedCode) {
        throw new Error(`Trial balance filename "${base}" does not match its Actual/Budget suffix ` +
            `(entity ${parsed.entityCode}, period ${parsed.periodYyyymm}, type ${parsed.tbKind}).`);
    }
    return parsed;
}
export function parseTrialBalancePeriod(entityCode, periodYyyymm) {
    const entity = entityCode.trim().toUpperCase();
    const period = periodYyyymm.trim();
    if (!entity || !/^\d{6}$/.test(period))
        return null;
    const fiscalYear = parseInt(period.slice(0, 4), 10);
    const fiscalMonth = parseInt(period.slice(4, 6), 10);
    if (!Number.isFinite(fiscalYear) ||
        !Number.isFinite(fiscalMonth) ||
        fiscalMonth < 0 ||
        fiscalMonth > 12) {
        return null;
    }
    const columnLabel = fiscalMonth === 0
        ? `Previous Year ${fiscalYear}`
        : `${MONTH_NAMES[fiscalMonth - 1]} ${fiscalYear}`;
    return {
        sourceFileName: `TB_${period}_${entity}_Actual.xlsx`,
        periodYyyymm: period,
        entityCode: entity,
        tbKind: 'ACTUAL',
        fiscalYear,
        fiscalMonth,
        columnLabel,
    };
}
//# sourceMappingURL=financeFileNameResolver.js.map