import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/db/prisma';
import { verifyHashChain } from '@/lib/crypto/hashing';
import { createAuditLogEntry } from '@/lib/db/queries/audit';

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const logs = await prisma.auditLog.findMany({
    where: { userId: user.id },
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
    return NextResponse.json({ error: 'Audit log integrity check failed' }, { status: 500 });
  }

  const accessLog = await createAuditLogEntry({
    userId: user.id,
    eventType: 'audit_accessed',
    action: 'Viewed audit log',
    actorId: user.id,
    actorType: 'user',
    request,
  });

  const responseLogs = [...logs, accessLog].sort(
    (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
  );

  return NextResponse.json(responseLogs);
}
