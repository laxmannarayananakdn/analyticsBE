/**
 * Trial balance entity/period backfill only.
 * Report instances and columns are created manually via FIS Report Processing.
 */

import { executeQuery } from '../config/database.js';
import { isDbFlag } from '../utils/sqlUtils.js';
import {
  parseTrialBalanceFileName,
  type ParsedTrialBalanceFileName,
} from '../utils/financeFileNameResolver.js';

/** Set entity_code / period on all rows for this upload file. */
export async function backfillTrialBalanceEntityPeriod(
  parsed: ParsedTrialBalanceFileName
): Promise<number> {
  const colCheck = await executeQuery<{ has_entity: unknown; has_period: unknown }>(
    `SELECT
       CASE WHEN COL_LENGTH('FIN.TrialBalance', 'entity_code') IS NOT NULL THEN 1 ELSE 0 END AS has_entity,
       CASE WHEN COL_LENGTH('FIN.TrialBalance', 'period') IS NOT NULL THEN 1 ELSE 0 END AS has_period`
  );
  if (colCheck.error) throw new Error(colCheck.error);

  const hasEntity = isDbFlag(colCheck.data?.[0]?.has_entity);
  const hasPeriod = isDbFlag(colCheck.data?.[0]?.has_period);
  if (!hasEntity && !hasPeriod) return 0;

  const sets: string[] = [];
  const params: Record<string, unknown> = {
    fileName: parsed.sourceFileName,
    baseName: parsed.sourceFileName,
    entityCode: parsed.entityCode,
    period: parsed.periodYyyymm,
  };
  if (hasEntity) sets.push('entity_code = @entityCode');
  if (hasPeriod) sets.push('period = @period');

  const result = await executeQuery(
    `UPDATE FIN.TrialBalance SET ${sets.join(', ')}
     WHERE file_name = @fileName OR file_name = @baseName`,
    params
  );
  if (result.error) throw new Error(result.error);
  return result.data?.length ?? 0;
}

/**
 * Backfill entity_code / period on FIN.TrialBalance from distinct TB file names in the table.
 */
export async function repairTrialBalanceEntityPeriodFromData(): Promise<{
  filesProcessed: number;
  errors: string[];
}> {
  const files = await executeQuery<{ file_name: string }>(
    `SELECT DISTINCT file_name FROM FIN.TrialBalance WHERE file_name LIKE 'TB[_]%'`
  );
  if (files.error) throw new Error(files.error);

  const errors: string[] = [];
  let filesProcessed = 0;

  for (const row of files.data || []) {
    const parsed = parseTrialBalanceFileName(row.file_name);
    if (!parsed) continue;
    try {
      await backfillTrialBalanceEntityPeriod(parsed);
      filesProcessed += 1;
    } catch (e) {
      errors.push(`${row.file_name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { filesProcessed, errors };
}
