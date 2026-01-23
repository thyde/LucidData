import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/middleware/withAuth';
import { consentService } from '@/lib/services/consent.service';
import { auditService } from '@/lib/services/audit.service';
import { consentSchema } from '@/lib/validations/consent';
import { logDatabaseError } from '@/lib/services/error-logger';
import { HTTP_STATUS, ERROR_MESSAGES } from '@/lib/constants';

export const GET = withAuth(async (request, { userId }) => {
  try {
    const consents = await consentService.getUserConsents(userId);

    await auditService.createAuditLogEntry({
      userId,
      eventType: 'consent_accessed',
      action: 'Listed consents',
      actorId: userId,
      actorType: 'user',
      metadata: { count: consents.length },
    });

    return NextResponse.json(consents);
  } catch (error) {
    logDatabaseError(error, { userId, action: 'LIST_CONSENTS' });
    return NextResponse.json(
      { error: ERROR_MESSAGES.INTERNAL_ERROR },
      { status: HTTP_STATUS.INTERNAL_SERVER_ERROR }
    );
  }
});

export const POST = withAuth(async (request, { userId }) => {
  try {
    const body = await request.json();
    const validated = consentSchema.parse({
      ...body,
      endDate: body.endDate ? new Date(body.endDate) : undefined,
    });

    const consent = await consentService.createConsent(userId, validated);

    await auditService.createAuditLogEntry({
      userId,
      consentId: consent.id,
      vaultDataId: consent.vaultDataId ?? undefined,
      eventType: 'consent_granted',
      action: `Granted ${consent.accessLevel} access to ${consent.grantedToName}`,
      actorId: userId,
      actorType: 'user',
    });

    return NextResponse.json(consent, { status: HTTP_STATUS.CREATED });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues },
        { status: HTTP_STATUS.BAD_REQUEST }
      );
    }

    if (error instanceof Error && error.message === 'Invalid vault data reference') {
      return NextResponse.json(
        { error: ERROR_MESSAGES.INVALID_VAULT_DATA },
        { status: HTTP_STATUS.BAD_REQUEST }
      );
    }

    logDatabaseError(error, { userId, action: 'CREATE_CONSENT' });
    return NextResponse.json(
      { error: ERROR_MESSAGES.INTERNAL_ERROR },
      { status: HTTP_STATUS.INTERNAL_SERVER_ERROR }
    );
  }
});
