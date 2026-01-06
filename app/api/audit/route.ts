import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/middleware/withAuth';
import { auditService } from '@/lib/services/audit.service';
import { logDatabaseError } from '@/lib/services/error-logger';
import { HTTP_STATUS, ERROR_MESSAGES } from '@/lib/constants';

export const GET = withAuth(async (request, { userId }) => {
  try {
    const logs = await auditService.getUserAuditLogs(userId);
    const verification = await auditService.verifyAuditChain(userId);

    if (!verification.valid) {
      return NextResponse.json(
        {
          error: ERROR_MESSAGES.AUDIT_INTEGRITY_FAILED,
          chainValid: false,
          brokenAt: verification.brokenAt,
        },
        { status: HTTP_STATUS.INTERNAL_SERVER_ERROR }
      );
    }

    // Create audit log for viewing audit logs
    const accessLog = await auditService.createAuditLogEntry({
      userId,
      eventType: 'audit_accessed',
      action: 'Viewed audit log',
      actorId: userId,
      actorType: 'user',
    });

    const responseLogs = [...logs, accessLog].sort(
      (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
    );

    return NextResponse.json({
      logs: responseLogs,
      chainValid: true,
      totalLogs: responseLogs.length,
    });
  } catch (error) {
    logDatabaseError(error, { userId, action: 'GET_AUDIT_LOGS' });
    return NextResponse.json(
      { error: ERROR_MESSAGES.INTERNAL_ERROR },
      { status: HTTP_STATUS.INTERNAL_SERVER_ERROR }
    );
  }
});
