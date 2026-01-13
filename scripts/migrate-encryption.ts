#!/usr/bin/env node
/**
 * Encryption Migration Script
 *
 * Migrates vault entries from v1 (legacy) to v2 (envelope) encryption.
 *
 * Usage:
 *   node scripts/migrate-encryption.ts --batch 50        # Migrate one batch
 *   node scripts/migrate-encryption.ts --all             # Migrate all entries
 *   node scripts/migrate-encryption.ts --stats           # Show migration stats
 *
 * Recommended for cron:
 *   # Run every hour, migrate 50 entries at a time
 *   0 * * * * cd /path/to/app && node scripts/migrate-encryption.ts --batch 50
 */

import { encryptionMigrationService } from '../lib/services/encryption-migration.service';

// Parse command line arguments
const args = process.argv.slice(2);
const command = args[0];
const batchSize = parseInt(args.find(arg => arg.startsWith('--batch='))?.split('=')[1] || '50');

// Graceful shutdown handling
let shutdownRequested = false;

process.on('SIGINT', () => {
  console.log('\n⚠️  Shutdown requested... finishing current batch');
  shutdownRequested = true;
});

process.on('SIGTERM', () => {
  console.log('\n⚠️  Shutdown requested... finishing current batch');
  shutdownRequested = true;
});

async function showStats() {
  console.log('📊 Encryption Migration Statistics\n');
  console.log('═══════════════════════════════════════');

  const stats = await encryptionMigrationService.getMigrationStats();

  console.log(`Total entries:      ${stats.total}`);
  console.log(`v1 (legacy):        ${stats.v1} (${Math.round((stats.v1 / stats.total) * 100)}%)`);
  console.log(`v2 (envelope):      ${stats.v2} (${Math.round((stats.v2 / stats.total) * 100)}%)`);
  console.log(`Progress:           ${stats.percentageComplete}%`);
  console.log('═══════════════════════════════════════\n');

  if (stats.v1 === 0) {
    console.log('✅ All entries migrated to v2 encryption!');
  } else {
    console.log(`⏳ ${stats.v1} entries remaining to migrate`);
  }
}

async function migrateBatch(size: number) {
  console.log(`🔄 Starting batch migration (size: ${size})...\n`);

  const result = await encryptionMigrationService.migrateBatch(size);

  console.log('═══════════════════════════════════════');
  console.log(`✅ Migrated:        ${result.migrated}`);
  console.log(`❌ Failed:          ${result.failed}`);
  console.log('═══════════════════════════════════════\n');

  if (result.errors.length > 0) {
    console.log('⚠️  Errors:');
    result.errors.forEach(error => {
      console.log(`   - Entry ${error.id}: ${error.error}`);
    });
    console.log('');
  }

  if (result.migrated === 0) {
    console.log('✅ No more entries to migrate');
  }

  return result;
}

async function migrateAll() {
  console.log('🚀 Starting full migration...\n');
  console.log('This will migrate all v1 entries to v2 in batches.');
  console.log('Press Ctrl+C to stop after current batch.\n');

  const stats = await encryptionMigrationService.scheduleBackgroundMigration({
    batchSize,
    delayBetweenBatches: 1000, // 1 second between batches
    maxBatches: 1000,
  });

  console.log('\n🎉 Migration complete!\n');
  console.log('═══════════════════════════════════════');
  console.log(`Total entries:      ${stats.total}`);
  console.log(`v1 (legacy):        ${stats.v1}`);
  console.log(`v2 (envelope):      ${stats.v2}`);
  console.log(`Progress:           ${stats.percentageComplete}%`);
  console.log('═══════════════════════════════════════');
}

async function main() {
  try {
    // Check for required environment variables
    if (!process.env.DATABASE_URL) {
      console.error('❌ ERROR: DATABASE_URL environment variable not set');
      process.exit(1);
    }

    if (!process.env.ENCRYPTION_KEY) {
      console.error('❌ ERROR: ENCRYPTION_KEY environment variable not set');
      process.exit(1);
    }

    console.log('🔐 Encryption Migration Tool\n');

    // Handle commands
    if (command === '--stats' || command === '-s') {
      await showStats();
    } else if (command === '--all' || command === '-a') {
      await migrateAll();
    } else if (command === '--batch' || command === '-b' || !command) {
      const size = command === '--batch' || command === '-b'
        ? batchSize
        : parseInt(args[1] || '50');
      await migrateBatch(size);
      await showStats();
    } else if (command === '--help' || command === '-h') {
      console.log('Usage:');
      console.log('  node scripts/migrate-encryption.ts --stats           Show migration statistics');
      console.log('  node scripts/migrate-encryption.ts --batch 50        Migrate one batch (default: 50)');
      console.log('  node scripts/migrate-encryption.ts --all             Migrate all entries');
      console.log('  node scripts/migrate-encryption.ts --help            Show this help\n');
      console.log('Examples:');
      console.log('  node scripts/migrate-encryption.ts --stats');
      console.log('  node scripts/migrate-encryption.ts --batch 100');
      console.log('  node scripts/migrate-encryption.ts --all');
    } else {
      console.error(`❌ Unknown command: ${command}`);
      console.log('Run with --help for usage information');
      process.exit(1);
    }

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    console.error(error);
    process.exit(1);
  }
}

// Run the script
main();
