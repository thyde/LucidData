import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/db/prisma';
import { encrypt, decrypt, getMasterKey } from '@/lib/crypto/encryption';
import { vaultDataSchema } from '@/lib/validations/vault';
import { createAuditLogEntry } from '@/lib/db/queries/audit';

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const entries = await prisma.vaultData.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
  });

  const masterKey = getMasterKey();

  const decryptedEntries = entries.map((entry) => {
    try {
      const [ivHex, authTagHex] = entry.iv.split(':');
      const decrypted = decrypt(entry.encryptedData, masterKey, ivHex, authTagHex);
      const data = JSON.parse(decrypted);

      return {
        id: entry.id,
        label: entry.label,
        category: entry.category,
        description: entry.description ?? '',
        dataType: entry.dataType,
        tags: entry.tags,
        schemaType: entry.schemaType,
        schemaVersion: entry.schemaVersion,
        expiresAt: entry.expiresAt,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
        data,
      };
    } catch (error) {
      return {
        id: entry.id,
        label: entry.label,
        category: entry.category,
        description: entry.description ?? '',
        dataType: entry.dataType,
        tags: entry.tags,
        schemaType: entry.schemaType,
        schemaVersion: entry.schemaVersion,
        expiresAt: entry.expiresAt,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
        data: null,
        error: 'Decryption failed',
      };
    }
  });

  await createAuditLogEntry({
    userId: user.id,
    eventType: 'data_accessed',
    action: 'Listed vault entries',
    actorId: user.id,
    actorType: 'user',
    request,
    metadata: { count: entries.length },
  });

  return NextResponse.json(decryptedEntries);
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
    const validated = vaultDataSchema.parse({
      ...body,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
    });

    const masterKey = getMasterKey();
    const { encrypted, iv, authTag } = encrypt(JSON.stringify(validated.data), masterKey);

    const vaultEntry = await prisma.vaultData.create({
      data: {
        userId: user.id,
        category: validated.category,
        dataType: validated.dataType,
        label: validated.label,
        description: validated.description,
        tags: validated.tags ?? [],
        encryptedData: encrypted,
        encryptedKey: 'master-key-1',
        iv: `${iv}:${authTag}`,
        schemaType: validated.schemaType,
        schemaVersion: validated.schemaVersion,
        expiresAt: validated.expiresAt,
      },
    });

    await createAuditLogEntry({
      userId: user.id,
      vaultDataId: vaultEntry.id,
      eventType: 'data_created',
      action: `Created vault entry: ${validated.label}`,
      actorId: user.id,
      actorType: 'user',
      request,
      metadata: { category: validated.category },
    });

    return NextResponse.json(
      {
        ...vaultEntry,
        data: validated.data,
      },
      { status: 201 }
    );
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
