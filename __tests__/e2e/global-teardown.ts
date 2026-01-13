/**
 * Global Teardown for Playwright E2E Tests
 *
 * This file runs once after all E2E tests complete.
 * It cleans up test data from the database to prevent test pollution.
 */

import { PrismaClient } from '@prisma/client';

export default async function globalTeardown() {
  console.log('🧹 Running E2E test cleanup...');

  const prisma = new PrismaClient({
    datasourceUrl: process.env.DATABASE_URL,
  });

  try {
    // Clean up test vault entries
    const deletedVaultEntries = await prisma.vaultData.deleteMany();
    console.log(`   Deleted ${deletedVaultEntries.count} vault entries`);

    // Note: We don't delete users created by Supabase auth
    // Those are managed by Supabase and cleaned up separately

    console.log('✅ E2E test cleanup complete');
  } catch (error) {
    console.error('❌ Error during test cleanup:', error);
  } finally {
    await prisma.$disconnect();
  }
}
