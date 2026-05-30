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
//# sourceMappingURL=financeFileNameResolver.js.map