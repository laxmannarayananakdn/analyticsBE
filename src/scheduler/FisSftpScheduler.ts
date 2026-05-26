/**
 * Cron scheduler for FIS SFTP polling.
 * Enable with ENABLE_FIS_SFTP_POLLER=true and required FIS_SFTP_* env vars.
 */

import cron from 'node-cron';
import {
  getFisSftpCronExpression,
  getFisSftpConfig,
  isFisSftpPollerEnabled,
} from '../config/fisSftp.js';
import { pollFisSftpUnprocessedFiles } from '../services/FisSftpPoller.js';

let scheduledTask: cron.ScheduledTask | null = null;

function getTimezone(): string {
  return process.env.CRON_TIMEZONE || 'Asia/Kolkata';
}

export async function startFisSftpScheduler(): Promise<void> {
  if (!isFisSftpPollerEnabled()) {
    console.log('📁 FIS SFTP poller disabled (set ENABLE_FIS_SFTP_POLLER=true to enable)');
    return;
  }

  const config = getFisSftpConfig();
  if (!config) {
    console.error('📁 FIS SFTP poller not started – invalid configuration');
    return;
  }

  const cronExpression = getFisSftpCronExpression();
  if (!cron.validate(cronExpression)) {
    console.error(`📁 FIS SFTP poller: invalid cron expression "${cronExpression}"`);
    return;
  }

  const timezone = getTimezone();

  scheduledTask = cron.schedule(
    cronExpression,
    () => {
      pollFisSftpUnprocessedFiles().catch((err) => {
        console.error('[FisSftp] Scheduled poll failed:', err);
      });
    },
    { timezone }
  );

  console.log(
    `📁 FIS SFTP poller scheduled (${cronExpression}, ${timezone}) – host ${config.host}, user ${config.username}`
  );

  if (process.env.FIS_SFTP_RUN_ON_STARTUP !== 'false') {
    await pollFisSftpUnprocessedFiles();
  }
}

export function stopFisSftpScheduler(): void {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    console.log('📁 FIS SFTP poller stopped');
  }
}
