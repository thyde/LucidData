import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { updateVaultDataSchema } from '@/lib/validations/vault';
import { createAuditLogEntry } from '@/lib/db/queries/audit';
import { vaultService } from '@/lib/services/vault.service';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Use vault service for proper decryption (supports both v1 and v2 encryption)
    const entry = await vaultService.getVaultDataById(id, user.id);

    if (!entry) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Create audit log asynchronously (fire-and-forget)
    // Don't block the response waiting for audit logging to complete
    createAuditLogEntry({
      userId: user.id,
      vaultDataId: entry.id,
      eventType: 'data_accessed',
      action: `Accessed vault entry: ${entry.label}`,
      actorId: user.id,
      actorType: 'user',
      request,
    }).catch((error) => {
      console.error('Failed to create audit log entry for vault access:', error);
    });

    return NextResponse.json(entry);
  } catch (error) {
    console.error('Error fetching vault entry:', error);
    return NextResponse.json(
      { error: 'Failed to fetch vault entry', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const body = await request.json();
    const validated = updateVaultDataSchema.parse({
      ...body,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
    });

    // Use vault service for proper encryption (uses v2 envelope encryption)
    await vaultService.updateVaultData(id, user.id, validated);

    // Get the updated entry with proper decryption
    const updated = await vaultService.getVaultDataById(id, user.id);

    if (!updated) {
      return NextResponse.json({ error: 'Not found after update' }, { status: 404 });
    }

    await createAuditLogEntry({
      userId: user.id,
      vaultDataId: updated.id,
      eventType: 'data_updated',
      action: `Updated vault entry: ${updated.label}`,
      actorId: user.id,
      actorType: 'user',
      request,
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues },
        { status: 400 }
      );
    }

    console.error('Error updating vault entry:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    console.log('[DELETE /api/vault/[id]] Starting deletion');
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      console.log('[DELETE /api/vault/[id]] Unauthorized - no user');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    console.log(`[DELETE /api/vault/[id]] Deleting entry ${id} for user ${user.id}`);

    // Get entry details before deletion for audit log
    console.log(`[DELETE /api/vault/[id]] Fetching entry ${id}`);
    const existing = await vaultService.getVaultDataById(id, user.id);
    if (!existing) {
      console.log(`[DELETE /api/vault/[id]] Entry ${id} not found`);
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // If decryption failed but entry exists, still allow deletion
    // This handles corrupted/undecryptable entries gracefully
    if ('error' in existing && existing.error) {
      console.warn(`[DELETE /api/vault/[id]] Deleting entry ${id} with decryption error: ${existing.error}`);
    }

    // Use vault service for deletion
    console.log(`[DELETE /api/vault/[id]] Calling vault service to delete ${id}`);
    await vaultService.deleteVaultData(id, user.id);
    console.log(`[DELETE /api/vault/[id]] Entry ${id} deleted from database`);

    // Create audit log with timeout protection (2 seconds max)
    // Don't let audit logging delay the response to user
    console.log(`[DELETE /api/vault/[id]] Creating audit log for ${id}`);
    const auditPromise = createAuditLogEntry({
      userId: user.id,
      vaultDataId: existing.id,
      eventType: 'data_deleted',
      action: `Deleted vault entry: ${existing.label}`,
      actorId: user.id,
      actorType: 'user',
      request,
    });

    await Promise.race([
      auditPromise,
      new Promise((resolve) => setTimeout(resolve, 2000))
    ]).catch((error) => {
      console.error('[DELETE /api/vault/[id]] Audit log failed or timed out:', error);
    });

    console.log(`[DELETE /api/vault/[id]] Successfully deleted ${id}`);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[DELETE /api/vault/[id]] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
