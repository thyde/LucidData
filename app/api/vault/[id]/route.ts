import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuthAndParams } from '@/lib/middleware/withAuth';
import { vaultService } from '@/lib/services/vault.service';
import { auditService } from '@/lib/services/audit.service';
import { updateVaultDataSchema } from '@/lib/validations/vault';

export const GET = withAuthAndParams(async (request, { userId, params }) => {
  try {
    const entry = await vaultService.getVaultDataById(params.id, userId);

    if (!entry) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    await auditService.createAuditLogEntry({
      userId,
      vaultDataId: entry.id,
      eventType: 'data_accessed',
      action: `Accessed vault entry: ${entry.label}`,
      actorId: userId,
      actorType: 'user',
      request,
    });

    return NextResponse.json(entry);
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    console.error('Error fetching vault entry:', error);
    return NextResponse.json(
      { error: 'Failed to fetch vault entry', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
});

export const PATCH = withAuthAndParams(async (request, { userId, params }) => {
  try {
    const body = await request.json();
    const validated = updateVaultDataSchema.parse({
      ...body,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
    });

    const updated = await vaultService.updateVaultData(params.id, userId, validated);

    await auditService.createAuditLogEntry({
      userId,
      vaultDataId: updated.id,
      eventType: 'data_updated',
      action: `Updated vault entry: ${updated.label}`,
      actorId: userId,
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

    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    console.error('Error updating vault entry:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
});

export const DELETE = withAuthAndParams(async (request, { userId, params }) => {
  try {
    const entry = await vaultService.getVaultDataById(params.id, userId);

    if (!entry) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    await vaultService.deleteVaultData(entry.id, userId);

    await auditService.createAuditLogEntry({
      userId,
      eventType: 'data_deleted',
      action: `Deleted vault entry: ${entry.label}`,
      actorId: userId,
      actorType: 'user',
      request,
      metadata: {
        vaultDataId: entry.id,
        category: entry.category,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      console.log(`[DELETE /api/vault/[id]] Unauthorized access attempt`);
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    console.error('[DELETE /api/vault/[id]] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
});
