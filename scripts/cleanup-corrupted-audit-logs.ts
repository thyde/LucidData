/**
 * Cleanup Script for Corrupted Audit Logs
 *
 * This script identifies and removes audit log entries with broken hash chains.
 * It was created to fix audit logs that were created before the timestamp bug fix
 * in commit 91fdf7e.
 *
 * Usage:
 *   npm run cleanup:audit-logs           # Dry run - preview what will be deleted
 *   npm run cleanup:audit-logs -- --execute  # Actually delete the corrupted logs
 *   npm run cleanup:audit-logs -- --execute --backup  # Delete with backup
 */

import { PrismaClient } from '@prisma/client';
import { verifyHashChain } from '../lib/crypto/hashing';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

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
  logs: any[];
  firstBreakIndex?: number;
}> {
  const logs = await prisma.auditLog.findMany({
    where: { userId },
    orderBy: { timestamp: 'asc' },
  });

  if (logs.length === 0) {
    return { valid: true, logs: [] };
  }

  const chainEntries = logs.map((entry) => ({
    currentHash: entry.currentHash,
    previousHash: entry.previousHash,
    eventType: entry.eventType,
    userId: entry.userId,
    timestamp: entry.timestamp,
    action: entry.action,
    actorId: entry.actorId,
  }));

  // Check overall chain validity
  const isValid = verifyHashChain(chainEntries);

  if (!isValid) {
    // Find the first break point
    for (let i = 0; i < chainEntries.length; i++) {
      const entry = chainEntries[i];

      // Verify this specific entry's hash
      const { createAuditHash } = await import('../lib/crypto/hashing');
      const expectedHash = createAuditHash(
        entry.previousHash,
        {
          eventType: entry.eventType,
          userId: entry.userId,
          timestamp: entry.timestamp,
          action: entry.action,
        }
      );

      if (entry.currentHash !== expectedHash) {
        console.log(`\n❌ First break at index ${i} for user ${userId}`);
        console.log(`   Expected hash: ${expectedHash}`);
        console.log(`   Actual hash:   ${entry.currentHash}`);
        console.log(`   Event: ${entry.eventType} - ${entry.action}`);
        console.log(`   Timestamp: ${entry.timestamp}`);
        return { valid: false, logs, firstBreakIndex: i };
      }

      // Verify chain linkage
      if (i > 0 && entry.previousHash !== chainEntries[i - 1].currentHash) {
        console.log(`\n❌ Chain linkage break between ${i-1} and ${i} for user ${userId}`);
        return { valid: false, logs, firstBreakIndex: i };
      }
    }
  }

  return { valid: isValid, logs };
}

async function backupAuditLogs(logs: any[], userId: string): Promise<string> {
  const backupDir = path.join(process.cwd(), 'backups', 'audit-logs');

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/:/g, '-');
  const filename = `audit-logs-${userId}-${timestamp}.json`;
  const filepath = path.join(backupDir, filename);

  fs.writeFileSync(filepath, JSON.stringify(logs, null, 2));
  return filepath;
}

async function cleanupCorruptedAuditLogs(dryRun: boolean = true, createBackup: boolean = false): Promise<CleanupStats> {
  console.log('\n🔍 Starting Audit Log Cleanup...');
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes will be made)' : 'EXECUTE (will delete corrupted logs)'}`);
  console.log(`Backup: ${createBackup ? 'enabled' : 'disabled'}\n`);

  const stats: CleanupStats = {
    totalUsers: 0,
    usersWithCorruption: 0,
    totalLogsChecked: 0,
    totalLogsToDelete: 0,
    corruptedUsers: [],
  };

  // Get all unique user IDs who have audit logs
  const users = await prisma.auditLog.findMany({
    select: { userId: true },
    distinct: ['userId'],
  });

  stats.totalUsers = users.length;
  console.log(`Found ${stats.totalUsers} users with audit logs\n`);

  for (const { userId } of users) {
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

      console.log(`\n⚠️  User ${userId}:`);
      console.log(`   Total logs: ${result.logs.length}`);
      console.log(`   First break at index: ${result.firstBreakIndex}`);
      console.log(`   Logs to delete: ${logsToDelete}`);

      if (!dryRun) {
        // Backup if requested
        if (createBackup) {
          const logsToBackup = result.logs.slice(result.firstBreakIndex);
          const backupPath = await backupAuditLogs(logsToBackup, userId);
          console.log(`   ✅ Backed up to: ${backupPath}`);
        }

        // Delete corrupted logs (from break point onward)
        const idsToDelete = result.logs
          .slice(result.firstBreakIndex)
          .map(log => log.id);

        const deleteResult = await prisma.auditLog.deleteMany({
          where: {
            id: { in: idsToDelete },
          },
        });

        console.log(`   ✅ Deleted ${deleteResult.count} corrupted log entries`);
      }
    } else {
      console.log(`✅ User ${userId}: Chain valid (${result.logs.length} logs)`);
    }
  }

  return stats;
}

async function main() {
  const args = process.argv.slice(2);
  const execute = args.includes('--execute');
  const backup = args.includes('--backup');
  const dryRun = !execute;

  try {
    const stats = await cleanupCorruptedAuditLogs(dryRun, backup);

    console.log('\n' + '='.repeat(60));
    console.log('📊 CLEANUP SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total users checked: ${stats.totalUsers}`);
    console.log(`Total logs checked: ${stats.totalLogsChecked}`);
    console.log(`Users with corruption: ${stats.usersWithCorruption}`);
    console.log(`Total logs to delete: ${stats.totalLogsToDelete}`);
    console.log('='.repeat(60));

    if (stats.usersWithCorruption > 0) {
      console.log('\n📋 Corrupted Users Detail:');
      stats.corruptedUsers.forEach((user, idx) => {
        console.log(`\n${idx + 1}. User ID: ${user.userId}`);
        console.log(`   Total logs: ${user.totalLogs}`);
        console.log(`   Break at index: ${user.firstBreakIndex}`);
        console.log(`   Will delete: ${user.logsToDelete} logs`);
      });
    }

    if (dryRun && stats.totalLogsToDelete > 0) {
      console.log('\n💡 This was a DRY RUN - no changes were made.');
      console.log('   To actually delete corrupted logs, run:');
      console.log('   npm run cleanup:audit-logs -- --execute');
      console.log('\n   To delete with backup, run:');
      console.log('   npm run cleanup:audit-logs -- --execute --backup');
    } else if (!dryRun) {
      console.log('\n✅ Cleanup completed successfully!');
    } else {
      console.log('\n✅ No corrupted audit logs found!');
    }

  } catch (error) {
    console.error('\n❌ Error during cleanup:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
