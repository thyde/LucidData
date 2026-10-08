import { v1, readJson } from '@/lib/api/v1/handler'
import { profileUpdateSchema } from '@luciddata/core/validations/client-api'
import { getUserProfile, updateUserProfile } from '@/lib/services/user.service'
import { setEmailNotificationPreference } from '@/lib/services/account.service'
import type { User } from '@/types/database.types'

export const dynamic = 'force-dynamic'

/** What a client sees of the account: no wrapped keys and no internal flags. */
function profile(user: User | null, email: string) {
  return {
    id: user?.id ?? null,
    email,
    display_name: user?.display_name ?? null,
    key_salt: user?.key_salt ?? null,
    key_hint: user?.key_hint ?? null,
    onboarding_completed: user?.onboarding_completed ?? false,
    email_notifications_enabled: user?.email_notifications_enabled ?? true,
    created_at: user?.created_at ?? null,
  }
}

export const GET = v1(async (_req, { userId, email }) => profile(await getUserProfile(userId), email))

export const PATCH = v1(async (req, { userId, email }) => {
  const input = profileUpdateSchema.parse(await readJson(req))
  if (input.display_name !== undefined || input.key_hint !== undefined) {
    await updateUserProfile(userId, { display_name: input.display_name, key_hint: input.key_hint })
  }
  if (input.email_notifications_enabled !== undefined) {
    await setEmailNotificationPreference(userId, input.email_notifications_enabled)
  }
  return profile(await getUserProfile(userId), email)
})
