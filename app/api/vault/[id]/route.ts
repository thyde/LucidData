import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { updateVaultDataSchema } from '@/lib/validations/vault';
import { createAuditLogEntry } from '@/lib/db/queries/audit';
import { prisma } from '@/lib/db/prisma';
import { decrypt, encrypt, getMasterKey } from '@/lib/crypto/encryption';

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

    const entry = await prisma.vaultData.findUnique({ where: { id } });

    if (!entry || entry.userId !== user.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const [ivHex, authTagHex] = entry.iv.split(':');
    const masterKey = getMasterKey();
    const decrypted = decrypt(entry.encryptedData, masterKey, ivHex, authTagHex);
    const data = JSON.parse(decrypted);

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

    return NextResponse.json({ ...entry, data });
  } catch (error) {
    // Check if it's an authorization error
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    
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

    const existing = await prisma.vaultData.findUnique({ where: { id } });
    if (!existing || existing.userId !== user.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {
      label: validated.label,
      category: validated.category,
      description: validated.description,
      tags: validated.tags,
      expiresAt: validated.expiresAt,
    };

    if (validated.data) {
      const masterKey = getMasterKey();
      const { encrypted, iv, authTag } = encrypt(JSON.stringify(validated.data), masterKey);
      updateData.encryptedData = encrypted;
      updateData.iv = `${iv}:${authTag}`;
    }

    const updated = await prisma.vaultData.update({
      where: { id },
      data: updateData,
    });

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

    // Check if it's an authorization error
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
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
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const existing = await prisma.vaultData.findUnique({ where: { id } });
    if (!existing || existing.userId !== user.id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    await prisma.vaultData.delete({ where: { id } });

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
  } catch (error) {
    // Check if it's an authorization error
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
}
