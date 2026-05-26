/**
 * Run one FIS SFTP poll (manual / CI).
 *
 * Run: npm run fis-sftp:poll
 * Requires: backend/.env with ENABLE_FIS_SFTP_POLLER=true and FIS_SFTP_* vars
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { pollFisSftpUnprocessedFiles } from '../src/services/FisSftpPoller.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

async function main(): Promise<void> {
  const result = await pollFisSftpUnprocessedFiles();
  console.log(JSON.stringify(result, null, 2));
  if (result.errors.length > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
