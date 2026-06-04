/**
 * Repair FIN.TrialBalance entity/period + FIS columns from completed TB uploads.
 * Usage: npx tsx scripts/fis-repair-tb-sync.ts
 */
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { repairFisFromCompletedTbUploads } from '../src/services/FISReportColumnSyncService.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '../.env') });

async function main() {
  const result = await repairFisFromCompletedTbUploads();
  console.log('Uploads processed:', result.uploadsProcessed);
  console.log('Columns synced:', result.columnsSynced);
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
