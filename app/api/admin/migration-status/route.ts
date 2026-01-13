/**
 * Admin API: Migration Status
 *
 * GET /api/admin/migration-status
 *
 * Get current encryption migration progress.
 * Shows v1 vs v2 counts and migration percentage.
 */

import { NextRequest, NextResponse } from 'next/server';
import { encryptionMigrationService } from '@/lib/services/encryption-migration.service';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/admin/migration-status
 * Get migration progress statistics
 */
export async function GET(request: NextRequest) {
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
    // For now, any authenticated user can view migration status
    // In production, add: if (user.role !== 'admin') { return 403 }

    // Get migration statistics
    const stats = await encryptionMigrationService.getMigrationStats();

    return NextResponse.json({
      success: true,
      stats,
      message: stats.v1 === 0
        ? 'All entries migrated to v2 encryption'
        : `${stats.v1} entries remaining to migrate`,
    });
  } catch (error) {
    console.error('Migration status error:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
