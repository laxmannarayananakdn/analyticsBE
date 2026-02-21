/**
 * Scheduler Daemon (standalone)
 * Long-running process that runs scheduled sync jobs based on admin.sync_schedules.
 * Uses the shared SyncScheduler module.
 *
 * Use this when running the scheduler separately from the API server.
 * For Azure Web App: the scheduler is embedded in the API server; you do NOT need this script.
 *
 * Run: npm run scheduler   (or: tsx scripts/scheduler-daemon.ts)
 * Requires: backend/.env with Azure SQL credentials
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { startSyncScheduler, stopSyncScheduler } from '../src/scheduler/SyncScheduler.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

async function main(): Promise<void> {
  await startSyncScheduler();

  process.on('SIGINT', () => {
    stopSyncScheduler();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    stopSyncScheduler();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
