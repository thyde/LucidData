import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { createClient } from '@/lib/supabase/server';
import { decrypt, encrypt, getMasterKey } from '@/lib/crypto/encryption';
import { updateVaultDataSchema } from '@/lib/validations/vault';
import { createAuditLogEntry } from '@/lib/db/queries/audit';

async function getVaultEntry(userId: string, id: string) {
  const entry = await prisma.vaultData.findUnique({ where: { id } });
  if (!entry || entry.userId !== userId) {
    return null;
  }
  return entry;
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const entry = await getVaultEntry(user.id, params.id);
  if (!entry) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const masterKey = getMasterKey();
  const [ivHex, authTagHex] = entry.iv.split(':');
  const decrypted = decrypt(entry.encryptedData, masterKey, ivHex, authTagHex);
  const data = JSON.parse(decrypted);

  await createAuditLogEntry({
    userId: user.id,
    vaultDataId: entry.id,
    eventType: 'data_accessed',
    action: `Accessed vault entry: ${entry.label}`,
    actorId: user.id,
    actorType: 'user',
    request,
  });

  return NextResponse.json({
    ...entry,
    data,
  });
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

    const existing = await getVaultEntry(user.id, params.id);
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const body = await request.json();
    const validated = updateVaultDataSchema.parse({
      ...body,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
    });

    const updateData: Record<string, unknown> = {};

    if (validated.label !== undefined) updateData.label = validated.label;
    if (validated.description !== undefined) updateData.description = validated.description;
    if (validated.category !== undefined) updateData.category = validated.category;
    if (validated.dataType !== undefined) updateData.dataType = validated.dataType;
    if (validated.tags !== undefined) updateData.tags = validated.tags;
    if (validated.schemaType !== undefined) updateData.schemaType = validated.schemaType;
    if (validated.schemaVersion !== undefined) updateData.schemaVersion = validated.schemaVersion;
    if (validated.expiresAt !== undefined) updateData.expiresAt = validated.expiresAt;

    if (validated.data !== undefined) {
      const masterKey = getMasterKey();
      const { encrypted, iv, authTag } = encrypt(JSON.stringify(validated.data), masterKey);
      updateData.encryptedData = encrypted;
      updateData.encryptedKey = 'master-key-1';
      updateData.iv = `${iv}:${authTag}`;
    }

    const updated = await prisma.vaultData.update({
      where: { id: existing.id },
      data: updateData,
    });

    let decryptedData = null;
    try {
      const [ivHex, authTagHex] = updated.iv.split(':');
      const masterKey = getMasterKey();
      const decrypted = decrypt(updated.encryptedData, masterKey, ivHex, authTagHex);
      decryptedData = JSON.parse(decrypted);
    } catch {
      decryptedData = null;
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

    return NextResponse.json({
      ...updated,
      data: decryptedData,
    });
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

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const existing = await getVaultEntry(user.id, params.id);
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await prisma.vaultData.delete({ where: { id: existing.id } });

  await createAuditLogEntry({
    userId: user.id,
    vaultDataId: existing.id,
    eventType: 'data_deleted',
    action: `Deleted vault entry: ${existing.label}`,
    actorId: user.id,
    actorType: 'user',
    request,
  });

  return NextResponse.json({ success: true });
}
