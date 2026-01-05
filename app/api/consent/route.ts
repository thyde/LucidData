import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/db/prisma';
import { consentSchema } from '@/lib/validations/consent';
import { createAuditLogEntry } from '@/lib/db/queries/audit';

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const consents = await prisma.consent.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
  });

  await createAuditLogEntry({
    userId: user.id,
    eventType: 'consent_accessed',
    action: 'Listed consents',
    actorId: user.id,
    actorType: 'user',
    request,
    metadata: { count: consents.length },
  });

  return NextResponse.json(consents);
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const validated = consentSchema.parse({
      ...body,
      endDate: body.endDate ? new Date(body.endDate) : undefined,
    });

    if (validated.vaultDataId) {
      const vaultEntry = await prisma.vaultData.findUnique({ where: { id: validated.vaultDataId } });
      if (!vaultEntry || vaultEntry.userId !== user.id) {
        return NextResponse.json({ error: 'Invalid vault data reference' }, { status: 400 });
      }
    }

    const consent = await prisma.consent.create({
      data: {
        userId: user.id,
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
      userId: user.id,
      consentId: consent.id,
      vaultDataId: consent.vaultDataId,
      eventType: 'consent_granted',
      action: `Granted ${consent.accessLevel} access to ${consent.grantedToName}`,
      actorId: user.id,
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

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
