/**
 * LD-109 account-enumeration defences.
 *
 * Any endpoint that takes a user email must answer identically whether or not
 * the account exists, in status, body, and timing. A difference in any of the
 * three is an oracle that lets a stranger map who has a LucidData account.
 */

/** The single response body every user-lookup endpoint returns. */
export const NEUTRAL_LOOKUP_RESPONSE = {
  status: 202,
  body: {
    accepted: true,
    message: 'Request received. If an account matches, the person will be notified.',
  },
} as const

/**
 * Minimum wall-clock time a user-lookup handler takes. Long enough to absorb the
 * difference between a hit (insert plus notification) and a miss (lookup only).
 */
export const ENUMERATION_FLOOR_MS = 400

/**
 * Run work, then wait until the floor has elapsed. The caller's response is
 * therefore not distinguishable by timing.
 */
export async function withConstantTime<T>(
  work: () => Promise<T>,
  floorMs: number = ENUMERATION_FLOOR_MS
): Promise<T> {
  const started = Date.now()
  try {
    return await work()
  } finally {
    const remaining = floorMs - (Date.now() - started)
    if (remaining > 0) {
      await new Promise((resolve) => setTimeout(resolve, remaining))
    }
  }
}
