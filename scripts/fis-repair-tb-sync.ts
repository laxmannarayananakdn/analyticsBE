/**
 * Backfill FIN.TrialBalance entity_code / period from file names (no report instances).
 * Usage: npx tsx scripts/fis-repair-tb-sync.ts
 */
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { repairTrialBalanceEntityPeriodFromData } from '../src/services/FISReportColumnSyncService.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../.env') });

async function main() {
  const result = await repairTrialBalanceEntityPeriodFromData();
  console.log('Files processed:', result.filesProcessed);
  if (result.errors.length) {
    console.error('Errors:');
    result.errors.forEach((e) => console.error('  -', e));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
