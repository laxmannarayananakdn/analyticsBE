/**
 * Detect optional FIN.* columns so inserts work on older schemas.
 */
import { executeQuery } from '../config/database.js';
let cachedFlags = null;
export function clearFinTableColumnFlagsCache() {
    cachedFlags = null;
}
export async function getFinTableColumnFlags() {
    if (cachedFlags)
        return cachedFlags;
    const result = await executeQuery(`SELECT
      CASE WHEN COL_LENGTH('FIN.TrialBalance', 'last_updated_by_raw') IS NOT NULL THEN 1 ELSE 0 END AS tb_raw,
      CASE WHEN COL_LENGTH('FIN.TrialBalance', 'entity_code') IS NOT NULL THEN 1 ELSE 0 END AS tb_entity,
      CASE WHEN COL_LENGTH('FIN.TrialBalance', 'period') IS NOT NULL THEN 1 ELSE 0 END AS tb_period,
      CASE WHEN COL_LENGTH('FIN.DictionaryData', 'last_updated_by_raw') IS NOT NULL THEN 1 ELSE 0 END AS dic_raw`);
    if (result.error) {
        throw new Error(result.error);
    }
    const row = result.data?.[0];
    cachedFlags = {
        trialBalance: {
            hasRawAudit: row?.tb_raw === 1,
            hasEntityCode: row?.tb_entity === 1,
            hasPeriod: row?.tb_period === 1,
        },
        dictionaryData: {
            hasRawAudit: row?.dic_raw === 1,
        },
    };
    return cachedFlags;
}
//# sourceMappingURL=finTableColumns.js.map