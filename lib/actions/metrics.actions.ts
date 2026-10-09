'use server'

import { createClient } from '@/lib/supabase/server'
import { incrementDailyCounter } from '@/lib/services/daily-counter.service'

/**
 * LD-214: the health timeline was opened. Counted only for a signed-in person,
 * so the number cannot be inflated from outside, and recorded without them.
 */
export async function recordTimelineVisitAction(): Promise<void> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return
  await incrementDailyCounter('timeline_visit')
}
