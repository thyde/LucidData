import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/middleware/withAuth';
import { auditService } from '@/lib/services/audit.service';
import { logDatabaseError } from '@/lib/services/error-logger';
import { HTTP_STATUS, ERROR_MESSAGES } from '@/lib/constants';

export const GET = withAuth(async (request, { userId }) => {
  try {
    console.log('[AUDIT API] Fetching audit logs for user:', userId);

    // Fetch logs first
    const logs = await auditService.getUserAuditLogs(userId);
    console.log('[AUDIT API] Fetched', logs.length, 'audit logs');

    // Verify the chain before creating a new entry
    // NOTE: Chain verification is non-blocking - we still return logs even if chain is invalid
    const verification = await auditService.verifyAuditChain(userId);
    console.log('[AUDIT API] Chain verification:', verification);

    if (!verification.valid) {
      console.error('[AUDIT API] Audit chain invalid, broken at:', verification.brokenAt);
      // Log the integrity issue but continue to return logs
      // The frontend can display a warning about chain integrity
    }

    // Don't create audit logs for polling/background fetches
    // Only log intentional user actions (CRUD operations)
    // Otherwise, the audit page polling every 5 seconds creates infinite audit logs
    // This would make the audit log useless due to noise

    // Sort logs by timestamp (most recent first)
    const responseLogs = logs.sort(
      (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
    );

    console.log('[AUDIT API] Returning', responseLogs.length, 'logs');

    return NextResponse.json({
      logs: responseLogs,
      chainValid: verification.valid,
      brokenAt: verification.brokenAt,
      totalLogs: responseLogs.length,
    });
  } catch (error) {
    console.error('[AUDIT API] Fatal error:', error);
    logDatabaseError(error, { userId, action: 'GET_AUDIT_LOGS' });
    return NextResponse.json(
      { error: ERROR_MESSAGES.INTERNAL_ERROR },
      { status: HTTP_STATUS.INTERNAL_SERVER_ERROR }
    );
  }
});
