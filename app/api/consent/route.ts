import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/middleware/withAuth';
import { prisma } from '@/lib/db/prisma';
import { consentSchema } from '@/lib/validations/consent';
import { createAuditLogEntry } from '@/lib/db/queries/audit';
import { logDatabaseError } from '@/lib/services/error-logger';

export const GET = withAuth(async (request, { userId }) => {
  try {
    const consents = await prisma.consent.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    await createAuditLogEntry({
      userId,
      eventType: 'consent_accessed',
      action: 'Listed consents',
      actorId: userId,
      actorType: 'user',
      request,
      metadata: { count: consents.length },
    });

    return NextResponse.json(consents);
  } catch (error) {
    logDatabaseError(error, { userId, action: 'LIST_CONSENTS' });
    return NextResponse.json({ error: 'Failed to retrieve consents' }, { status: 500 });
  }
});

export const POST = withAuth(async (request, { userId }) => {
  try {
    const body = await request.json();
    const validated = consentSchema.parse({
      ...body,
      endDate: body.endDate ? new Date(body.endDate) : undefined,
    });

    if (validated.vaultDataId) {
      const vaultEntry = await prisma.vaultData.findUnique({ where: { id: validated.vaultDataId } });
      if (!vaultEntry || vaultEntry.userId !== userId) {
        return NextResponse.json({ error: 'Invalid vault data reference' }, { status: 400 });
      }
    }

    const consent = await prisma.consent.create({
      data: {
        userId,
        vaultDataId: validated.vaultDataId,
        grantedTo: validated.grantedTo,
        grantedToName: validated.grantedToName,
        grantedToEmail: validated.grantedToEmail,
        accessLevel: validated.accessLevel,
        purpose: validated.purpose,
        endDate: validated.endDate,
        termsVersion: validated.termsVersion,
      },
    });

    await createAuditLogEntry({
      userId,
      consentId: consent.id,
      vaultDataId: consent.vaultDataId,
      eventType: 'consent_granted',
      action: `Granted ${consent.accessLevel} access to ${consent.grantedToName}`,
      actorId: userId,
      actorType: 'user',
      request,
    });

    return NextResponse.json(consent, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.issues },
        { status: 400 }
      );
    }

    logDatabaseError(error, { userId, action: 'CREATE_CONSENT' });
    return NextResponse.json({ error: 'Failed to create consent' }, { status: 500 });
  }
});
