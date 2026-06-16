/**
 * Cleanup Script for Corrupted Audit Logs
 *
 * Migrated from Prisma to Supabase service client.
 *
 * Usage:
 *   npm run cleanup:audit-logs           # Dry run - preview what will be deleted
 *   npm run cleanup:audit-logs -- --execute  # Actually delete the corrupted logs
 */

import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database.types';
import { createAuditHash } from '../lib/crypto/hashing';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface CleanupStats {
  totalUsers: number;
  usersWithCorruption: number;
  totalLogsChecked: number;
  totalLogsToDelete: number;
  corruptedUsers: Array<{
    userId: string;
    totalLogs: number;
    firstBreakIndex: number;
    logsToDelete: number;
  }>;
}

async function verifyUserAuditChain(userId: string): Promise<{
  valid: boolean;
  logs: Database['public']['Tables']['audit_logs']['Row'][];
  firstBreakIndex?: number;
}> {
  const { data: logs, error } = await supabase
    .from('audit_logs')
    .select('*')
    .eq('user_id', userId)
    .order('timestamp', { ascending: true });

  if (error) throw error;
  if (!logs || logs.length === 0) return { valid: true, logs: [] };

  for (let i = 0; i < logs.length; i++) {
    const entry = logs[i];
    const expectedHash = createAuditHash(entry.previous_hash, {
      eventType: entry.event_type,
      userId: entry.user_id,
      timestamp: new Date(entry.timestamp),
      action: entry.action,
    });

    if (entry.current_hash !== expectedHash) {
      console.log(`\nFirst break at index ${i} for user ${userId}`);
      return { valid: false, logs, firstBreakIndex: i };
    }

    if (i > 0 && entry.previous_hash !== logs[i - 1].current_hash) {
      console.log(`\nChain linkage break between ${i - 1} and ${i} for user ${userId}`);
      return { valid: false, logs, firstBreakIndex: i };
    }
  }

  return { valid: true, logs };
}

async function backupAuditLogs(
  logs: Database['public']['Tables']['audit_logs']['Row'][],
  userId: string
): Promise<string> {
  const backupDir = path.join(process.cwd(), 'backups', 'audit-logs');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  const timestamp = new Date().toISOString().replace(/:/g, '-');
  const filepath = path.join(backupDir, `audit-logs-${userId}-${timestamp}.json`);
  fs.writeFileSync(filepath, JSON.stringify(logs, null, 2));
  return filepath;
}

async function cleanupCorruptedAuditLogs(
  dryRun: boolean = true,
  createBackup: boolean = false
): Promise<CleanupStats> {
  console.log('\nStarting Audit Log Cleanup...');
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'EXECUTE'}\n`);

  const stats: CleanupStats = {
    totalUsers: 0,
    usersWithCorruption: 0,
    totalLogsChecked: 0,
    totalLogsToDelete: 0,
    corruptedUsers: [],
  };

  // Get distinct user IDs
  const { data: allLogs, error } = await supabase
    .from('audit_logs')
    .select('user_id');

  if (error) throw error;

  const userIds = [...new Set((allLogs ?? []).map((l) => l.user_id))];
  stats.totalUsers = userIds.length;
  console.log(`Found ${stats.totalUsers} users with audit logs\n`);

  for (const userId of userIds) {
    const result = await verifyUserAuditChain(userId);
    stats.totalLogsChecked += result.logs.length;

    if (!result.valid && result.firstBreakIndex !== undefined) {
      const logsToDelete = result.logs.length - result.firstBreakIndex;
      stats.usersWithCorruption++;
      stats.totalLogsToDelete += logsToDelete;

      stats.corruptedUsers.push({
        userId,
        totalLogs: result.logs.length,
        firstBreakIndex: result.firstBreakIndex,
        logsToDelete,
      });

      console.log(`User ${userId}: ${logsToDelete} corrupted logs from index ${result.firstBreakIndex}`);

      if (!dryRun) {
        if (createBackup) {
          const logsToBackup = result.logs.slice(result.firstBreakIndex);
          const backupPath = await backupAuditLogs(logsToBackup, userId);
          console.log(`  Backed up to: ${backupPath}`);
        }

        const idsToDelete = result.logs.slice(result.firstBreakIndex).map((l) => l.id);
        const { error: delError } = await supabase
          .from('audit_logs')
          .delete()
          .in('id', idsToDelete);

        if (delError) throw delError;
        console.log(`  Deleted ${idsToDelete.length} corrupted log entries`);
      }
    } else {
      console.log(`User ${userId}: Chain valid (${result.logs.length} logs)`);
    }
  }

  return stats;
}

async function main() {
  const args = process.argv.slice(2);
  const execute = args.includes('--execute');
  const backup = args.includes('--backup');

  try {
    const stats = await cleanupCorruptedAuditLogs(!execute, backup);
    console.log('\n--- SUMMARY ---');
    console.log(`Total users: ${stats.totalUsers}`);
    console.log(`Total logs checked: ${stats.totalLogsChecked}`);
    console.log(`Users with corruption: ${stats.usersWithCorruption}`);
    console.log(`Logs to delete: ${stats.totalLogsToDelete}`);

    if (!execute && stats.totalLogsToDelete > 0) {
      console.log('\nDRY RUN - no changes made. Re-run with --execute to apply.');
    }
  } catch (error) {
    console.error('Error during cleanup:', error);
    process.exit(1);
  }
}

main();
