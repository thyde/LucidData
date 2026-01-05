import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/db/prisma';
import { revokeConsentSchema } from '@/lib/validations/consent';
import { createAuditLogEntry } from '@/lib/db/queries/audit';

async function getConsent(userId: string, id: string) {
  const consent = await prisma.consent.findUnique({ where: { id } });
  if (!consent || consent.userId !== userId) {
    return null;
  }
  return consent;
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const consent = await getConsent(user.id, params.id);
  if (!consent) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await createAuditLogEntry({
    userId: user.id,
    consentId: consent.id,
    vaultDataId: consent.vaultDataId,
    eventType: 'consent_accessed',
    action: `Accessed consent for ${consent.grantedToName}`,
    actorId: user.id,
    actorType: 'user',
    request,
  });

  return NextResponse.json(consent);
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const existing = await getConsent(user.id, params.id);
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const body = await request.json();
    const validated = revokeConsentSchema.parse(body);

    const updated = await prisma.consent.update({
      where: { id: existing.id },
      data: {
        revoked: true,
        revokedAt: new Date(),
        revokedReason: validated.revokedReason,
      },
    });

    await createAuditLogEntry({
      userId: user.id,
      consentId: updated.id,
      vaultDataId: updated.vaultDataId,
      eventType: 'consent_revoked',
      action: `Revoked consent for ${updated.grantedToName}`,
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

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
