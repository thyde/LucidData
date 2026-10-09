import { createServiceClient } from '@/lib/supabase/service'
import { errorLogger, ErrorSeverity } from '@/lib/services/error-logger'

/** The counters the database keeps. Each is a number a day, about nobody. */
export type DailyCounter = 'timeline_visit'

/**
 * LD-214: add one to today's count. The row holds the day and the count, and
 * nothing about who was counted; the browser asks once a day per person.
 * Best effort: a count that fails to land is logged and never shown.
 */
export async function incrementDailyCounter(counter: DailyCounter): Promise<void> {
  const { error } = await createServiceClient().rpc('increment_daily_counter', { p_counter: counter })
  if (error) errorLogger.log(error, ErrorSeverity.LOW, { action: 'DAILY_COUNTER_FAILED' })
}
