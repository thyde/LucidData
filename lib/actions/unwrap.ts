'use client'

import { isActionFailure, type ActionFailure } from '@/lib/actions/action-result'

/**
 * Turn a returned action failure back into a throw, carrying the real message.
 *
 * This exists so the fix does not require rewriting every call site. Components
 * already wrap action calls in try/catch and show `error.message`, and that
 * code was correct all along: the message was being lost in transit, not in the
 * handler. Wrapping the call restores the message and leaves the handler alone.
 *
 *   await unwrap(fileRightsRequestAction(input))
 *
 * An error thrown here is an ordinary client-side Error, so `instanceof Error`
 * and `error.message` behave exactly as the existing handlers expect.
 */
export async function unwrap<T>(promise: Promise<T | ActionFailure>): Promise<T> {
  const result = await promise
  if (isActionFailure(result)) {
    const error = new Error(result.message)
    error.name = 'UserFacingError'
    throw error
  }
  return result
}
