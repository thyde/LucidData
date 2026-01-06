import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/middleware/withAuth';
import { prisma } from '@/lib/db/prisma';
import { encrypt, decrypt, getMasterKey } from '@/lib/crypto/encryption';
import { vaultDataSchema } from '@/lib/validations/vault';
import { createAuditLogEntry } from '@/lib/db/queries/audit';
import { logCryptoError, logDatabaseError } from '@/lib/services/error-logger';

export const GET = withAuth(async (request, { userId }) => {

  try {
    const entries = await prisma.vaultData.findMany({
      where: { userId },
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
        logCryptoError(error, {
          userId,
          action: 'DECRYPT_VAULT_ENTRY',
          resource: entry.id,
        });

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
      userId,
      eventType: 'data_accessed',
      action: 'Listed vault entries',
      actorId: userId,
      actorType: 'user',
      request,
      metadata: { count: entries.length },
    });

    return NextResponse.json(decryptedEntries);
  } catch (error) {
    logDatabaseError(error, { userId, action: 'LIST_VAULT_ENTRIES' });
    return NextResponse.json({ error: 'Failed to retrieve vault entries' }, { status: 500 });
  }
});

export const POST = withAuth(async (request, { userId }) => {
  try {
    const body = await request.json();
    const validated = vaultDataSchema.parse({
      ...body,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
    });

    const masterKey = getMasterKey();
    const { encrypted, iv, authTag } = encrypt(JSON.stringify(validated.data), masterKey);

    const vaultEntry = await prisma.vaultData.create({
      data: {
        userId,
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
      userId,
      vaultDataId: vaultEntry.id,
      eventType: 'data_created',
      action: `Created vault entry: ${validated.label}`,
      actorId: userId,
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

    logDatabaseError(error, { userId, action: 'CREATE_VAULT_ENTRY' });
    return NextResponse.json({ error: 'Failed to create vault entry' }, { status: 500 });
  }
});
