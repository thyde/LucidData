/**
 * Admin API: Trigger Encryption Migration
 *
 * POST /api/admin/migrate-encryption
 *
 * Manually trigger encryption migration from v1 to v2.
 * Admin-only endpoint for on-demand migration.
 */

import { NextRequest, NextResponse } from 'next/server';
import { encryptionMigrationService } from '@/lib/services/encryption-migration.service';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

const MigrationRequestSchema = z.object({
  batchSize: z.number().min(1).max(1000).optional().default(50),
  migrateAll: z.boolean().optional().default(false),
});

/**
 * POST /api/admin/migrate-encryption
 * Trigger manual encryption migration
 */
export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // TODO: Add admin role check
    // For now, any authenticated user can trigger migration
    // In production, add: if (user.role !== 'admin') { return 403 }

    // Parse request body
    const body = await request.json();
    const { batchSize, migrateAll } = MigrationRequestSchema.parse(body);

    // Execute migration
    if (migrateAll) {
      // Full migration
      const stats = await encryptionMigrationService.scheduleBackgroundMigration({
        batchSize,
        delayBetweenBatches: 100, // Fast migration for manual trigger
        maxBatches: 1000,
      });

      return NextResponse.json({
        success: true,
        message: 'Full migration completed',
        stats,
      });
    } else {
      // Single batch migration
      const result = await encryptionMigrationService.migrateBatch(batchSize);
      const stats = await encryptionMigrationService.getMigrationStats();

      return NextResponse.json({
        success: result.success,
        message: `Migrated ${result.migrated} entries, ${result.failed} failed`,
        result,
        stats,
      });
    }
  } catch (error) {
    console.error('Migration error:', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request', details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
