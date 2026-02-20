/**
 * CLI Script: Sync All Schools (Manual / Cron)
 * Runs data sync for schools via SyncOrchestratorService.
 *
 * Run: npm run sync [options]
 * Requires: backend/.env with Azure SQL credentials
 *
 * Options:
 *   --node-ids N1,N2,...   Sync schools in these nodes only
 *   --all                  Sync all active MB + NEX configs (ignore nodes)
 *   --academic-year YYYY    Academic year (default: current year)
 *   --mb-config-ids 1,2,3  Sync only these ManageBac config IDs (testing)
 *   --nex-config-ids 4,5   Sync only these Nexquare config IDs (testing)
 *   --include-descendants   Include child nodes when using --node-ids
 *   --concurrency N         Reserved (default 5); orchestrator processes sequentially
 *   --dry-run              Show what would be synced, do not run
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { executeQuery } from '../src/config/database.js';
import { getConfigsForScope } from '../src/services/SyncScopeService.js';
import { runSync } from '../src/services/SyncOrchestratorService.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

function parseArgs(): {
  nodeIds: string[] | undefined;
  all: boolean;
  academicYear: string;
  mbConfigIds: number[] | undefined;
  nexConfigIds: number[] | undefined;
  includeDescendants: boolean;
  concurrency: number;
  dryRun: boolean;
} {
  const args = process.argv.slice(2);
  let nodeIds: string[] | undefined;
  let all = false;
  let academicYear = new Date().getFullYear().toString();
  let mbConfigIds: number[] | undefined;
  let nexConfigIds: number[] | undefined;
  let includeDescendants = false;
  let concurrency = 5;
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--node-ids' && args[i + 1]) {
      nodeIds = args[++i].split(',').map((s) => s.trim()).filter(Boolean);
    } else if (arg === '--all') {
      all = true;
    } else if (arg === '--academic-year' && args[i + 1]) {
      academicYear = args[++i];
    } else if (arg === '--mb-config-ids' && args[i + 1]) {
      mbConfigIds = args[++i].split(',')
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n));
    } else if (arg === '--nex-config-ids' && args[i + 1]) {
      nexConfigIds = args[++i].split(',')
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n));
    } else if (arg === '--include-descendants') {
      includeDescendants = true;
    } else if (arg === '--concurrency' && args[i + 1]) {
      const n = parseInt(args[++i], 10);
      if (!isNaN(n) && n > 0) concurrency = Math.min(n, 20);
    } else if (arg === '--dry-run') {
      dryRun = true;
    }
  }

  return {
    nodeIds,
    all,
    academicYear,
    mbConfigIds,
    nexConfigIds,
    includeDescendants,
    concurrency,
    dryRun,
  };
}

async function main(): Promise<void> {
  const opts = parseArgs();

  if (!opts.all && (!opts.nodeIds?.length) && (!opts.mbConfigIds?.length) && (!opts.nexConfigIds?.length)) {
    console.error('Provide --node-ids, --all, --mb-config-ids, and/or --nex-config-ids');
    process.exit(1);
  }

  const dbCheck = await executeQuery('SELECT 1 AS ok');
  if (dbCheck.error) {
    console.error('Database connection failed:', dbCheck.error);
    process.exit(1);
  }
  console.log('Database OK');

  const { mb, nex } = await getConfigsForScope({
    nodeIds: opts.nodeIds,
    all: opts.all,
    includeDescendants: opts.includeDescendants,
    configIdsMb: opts.mbConfigIds,
    configIdsNex: opts.nexConfigIds,
  });

  const mbSchools = mb.filter((c) => c.school_id != null && c.school_id !== 0);
  const nexSchools = nex.filter((c) => c.school_id?.trim());

  const total = mbSchools.length + nexSchools.length;

  if (total === 0) {
    console.log('No schools in scope. Exiting.');
    process.exit(0);
  }

  console.log(`\nScope: ${mbSchools.length} MB + ${nexSchools.length} NEX = ${total} school(s)`);
  if (opts.dryRun) {
    console.log('\n[DRY RUN] Would sync:');
    for (const c of mbSchools) {
      console.log(`  MB  ${c.school_id}  ${c.school_name}`);
    }
    for (const c of nexSchools) {
      console.log(`  NEX ${c.school_id}  ${c.school_name}`);
    }
    console.log('\nRun without --dry-run to execute.');
    process.exit(0);
  }

  if (opts.concurrency !== 5) {
    console.log(`Note: --concurrency ${opts.concurrency} parsed; orchestrator currently processes schools sequentially.`);
  }

  console.log(`\nStarting sync (AY: ${opts.academicYear})...\n`);

  const start = Date.now();

  try {
    const result = await runSync({
      nodeIds: opts.nodeIds,
      all: opts.all,
      academicYear: opts.academicYear,
      includeDescendants: opts.includeDescendants,
      configIdsMb: opts.mbConfigIds,
      configIdsNex: opts.nexConfigIds,
      triggeredBy: 'cli',
    });

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log('\n' + '─'.repeat(50));
    console.log(`Run ${result.runId} completed in ${elapsed}s`);
    console.log(`  Succeeded: ${result.schoolsSucceeded}`);
    console.log(`  Failed: ${result.schoolsFailed}`);
    if (result.errorSummary) {
      console.log(`  Error: ${result.errorSummary}`);
    }
    console.log('─'.repeat(50));
  } catch (err: unknown) {
    console.error('\nSync failed:', err);
    process.exit(1);
  }
}

main();
