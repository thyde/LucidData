import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { createAuditHash } from '@/lib/crypto/hashing';

function getClientIp(request?: Request): string | undefined {
  const forwarded = request?.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }

  const realIp = request?.headers.get('x-real-ip');
  if (realIp) return realIp;

  return undefined;
}

interface AuditLogInput {
  userId: string;
  eventType: string;
  action: string;
  actorId: string;
  actorType: string;
  vaultDataId?: string | null;
  consentId?: string | null;
  request?: Request;
  metadata?: Prisma.InputJsonValue;
  success?: boolean;
  errorMessage?: string | null;
  timestamp?: Date;
}

export async function createAuditLogEntry(input: AuditLogInput) {
  const startTime = Date.now();

  const previousLog = await prisma.auditLog.findFirst({
    where: { userId: input.userId },
    orderBy: { timestamp: 'desc' },
    select: { currentHash: true },
    take: 1, // Explicit limit for performance
  });

  const queryTime = Date.now() - startTime;
  if (queryTime > 100) {
    console.warn(`[PERF] Slow audit log query: ${queryTime}ms for user ${input.userId}`);
  }

  const timestamp = input.timestamp ?? new Date();
  const currentHash = createAuditHash(previousLog?.currentHash ?? null, {
    userId: input.userId,
    eventType: input.eventType,
    action: input.action,
    timestamp,
  });

  return prisma.auditLog.create({
    data: {
      userId: input.userId,
      vaultDataId: input.vaultDataId ?? null,
      consentId: input.consentId ?? null,
      eventType: input.eventType,
      action: input.action,
      actorId: input.actorId,
      actorType: input.actorType,
      ipAddress: getClientIp(input.request),
      userAgent: input.request?.headers.get('user-agent') ?? undefined,
      success: input.success ?? true,
      errorMessage: input.errorMessage ?? undefined,
      previousHash: previousLog?.currentHash ?? null,
      currentHash,
      timestamp,
      metadata: input.metadata ?? undefined,
    },
  });
}
