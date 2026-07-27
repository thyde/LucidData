/**
 * Carrying a user-facing error message across the server action boundary.
 *
 * React sanitizes anything thrown out of a Server Action in production. The
 * client receives "An error occurred in the Server Components render. The
 * specific message is omitted in production builds to avoid leaking sensitive
 * details." and nothing else. That is the right default: a stack trace or a
 * database error is not something to hand a stranger.
 *
 * It is the wrong outcome for a message written for the person who caused it.
 * "You have already contributed that entry to this pool" is the whole content
 * of the response, and in production every one of those became framework
 * boilerplate. It worked in development, which is why it survived: the
 * sanitization only applies to production builds.
 *
 * The fix is the shape Next.js documents. An expected failure is returned
 * rather than thrown, because a returned value is data and data crosses the
 * boundary intact. An unexpected failure keeps throwing and keeps being
 * sanitized, which is what should happen to it.
 *
 * Safe by default: only an error explicitly raised as `UserFacingError` is
 * transported. A database error, a missing environment variable, or a bug still
 * reaches the client as the generic message, because nobody deliberately wrote
 * those for a reader.
 */

/**
 * An error whose message was written for the person who will read it.
 *
 * Raise this in a service when the failure is the answer rather than a fault:
 * a duplicate, a limit, a refusal, a validation message. Do not raise it for
 * anything that reveals how the system is put together.
 */
export class UserFacingError extends Error {
  /** Optional stable code, so a caller can branch without matching on prose. */
  readonly code?: string

  constructor(message: string, code?: string) {
    super(message)
    this.name = 'UserFacingError'
    this.code = code
  }
}

/**
 * A failure returned from an action rather than thrown out of it.
 *
 * The marker key is deliberately ugly. It has to survive serialization and be
 * something no legitimate return value would carry.
 */
export interface ActionFailure {
  readonly __lucidActionFailure: true
  readonly message: string
  readonly code?: string
}

export function actionFailure(message: string, code?: string): ActionFailure {
  return { __lucidActionFailure: true, message, ...(code ? { code } : {}) }
}

export function isActionFailure(value: unknown): value is ActionFailure {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { __lucidActionFailure?: unknown }).__lucidActionFailure === true
  )
}

/**
 * Run an action body, returning a user-facing failure instead of throwing it.
 *
 * Anything that is not a `UserFacingError` is rethrown untouched, so it stays
 * sanitized and stays in the server logs where it belongs.
 *
 * The return type is a union, which is the point: a caller cannot use the
 * result without deciding what to do about the failure, because TypeScript will
 * not let them.
 */
export async function guarded<T>(fn: () => Promise<T>): Promise<T | ActionFailure> {
  try {
    return await fn()
  } catch (error) {
    if (error instanceof UserFacingError) {
      return actionFailure(error.message, error.code)
    }
    throw error
  }
}
