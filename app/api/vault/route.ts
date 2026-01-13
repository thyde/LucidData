import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/middleware/withAuth';
import { vaultService } from '@/lib/services/vault.service';
import { auditService } from '@/lib/services/audit.service';
import { vaultDataSchema } from '@/lib/validations/vault';
import { logDatabaseError } from '@/lib/services/error-logger';
import { HTTP_STATUS, ERROR_MESSAGES } from '@/lib/constants';

export const GET = withAuth(async (request, { userId }) => {
  try {
    const decryptedEntries = await vaultService.getUserVaultData(userId);

    await auditService.createAuditLogEntry({
      userId,
      eventType: 'data_accessed',
      action: 'Listed vault entries',
      actorId: userId,
      actorType: 'user',
      metadata: { count: decryptedEntries.length },
    });

    return NextResponse.json(decryptedEntries);
  } catch (error) {
    // Temporary debug logging for E2E tests
    console.error('❌ GET /api/vault error:', error);
    console.error('Stack:', error instanceof Error ? error.stack : 'No stack trace');
    logDatabaseError(error, { userId, action: 'LIST_VAULT_ENTRIES' });
    return NextResponse.json(
      { error: ERROR_MESSAGES.INTERNAL_ERROR },
      { status: HTTP_STATUS.INTERNAL_SERVER_ERROR }
    );
  }
});

export const POST = withAuth(async (request, { userId }) => {
  try {
    const body = await request.json();
    const validated = vaultDataSchema.parse({
      ...body,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
    });

    const vaultEntry = await vaultService.createVaultData(userId, validated);

    await auditService.createAuditLogEntry({
      userId,
      vaultDataId: vaultEntry.id,
      eventType: 'data_created',
      action: `Created vault entry: ${validated.label}`,
      actorId: userId,
      actorType: 'user',
      metadata: { category: validated.category },
    });

    return NextResponse.json(vaultEntry, { status: HTTP_STATUS.CREATED });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues },
        { status: HTTP_STATUS.BAD_REQUEST }
      );
    }

    // Temporary debug logging for E2E tests
    console.error('❌ POST /api/vault error:', error);
    console.error('Stack:', error instanceof Error ? error.stack : 'No stack trace');
    logDatabaseError(error, { userId, action: 'CREATE_VAULT_ENTRY' });
    return NextResponse.json(
      { error: ERROR_MESSAGES.INTERNAL_ERROR },
      { status: HTTP_STATUS.INTERNAL_SERVER_ERROR }
    );
  }
});
