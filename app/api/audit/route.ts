import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/middleware/withAuth';
import { prisma } from '@/lib/db/prisma';
import { verifyHashChain } from '@/lib/crypto/hashing';
import { createAuditLogEntry } from '@/lib/db/queries/audit';
import { logAuditIntegrityError, logDatabaseError } from '@/lib/services/error-logger';

export const GET = withAuth(async (request, { userId }) => {
  try {
    const logs = await prisma.auditLog.findMany({
      where: { userId },
      orderBy: { timestamp: 'asc' },
    });

    const chainValid = verifyHashChain(
      logs.map((entry) => ({
        currentHash: entry.currentHash,
        previousHash: entry.previousHash,
        eventType: entry.eventType,
        userId: entry.userId,
        timestamp: entry.timestamp,
        action: entry.action,
      }))
    );

    if (!chainValid) {
      logAuditIntegrityError(new Error('Hash chain verification failed'), {
        userId,
        action: 'VERIFY_AUDIT_CHAIN',
        metadata: { logCount: logs.length },
      });
      return NextResponse.json(
        { error: 'Audit log integrity check failed', chainValid: false },
        { status: 500 }
      );
    }

    const accessLog = await createAuditLogEntry({
      userId,
      eventType: 'audit_accessed',
      action: 'Viewed audit log',
      actorId: userId,
      actorType: 'user',
      request,
    });

    const responseLogs = [...logs, accessLog].sort(
      (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
    );

    return NextResponse.json({ logs: responseLogs, chainValid: true });
  } catch (error) {
    logDatabaseError(error, { userId, action: 'GET_AUDIT_LOGS' });
    return NextResponse.json({ error: 'Failed to retrieve audit logs' }, { status: 500 });
  }
});
