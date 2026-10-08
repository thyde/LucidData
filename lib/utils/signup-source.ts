/**
 * Where a sign-up came from, for the LD-610 measures of success. The value is
 * a hint from the page that linked to registration, so it is only ever used to
 * describe the person's own account, and anything outside this list is dropped.
 * The database applies the same allowlist.
 */
export const SIGNUP_SOURCES = ['verify', 'extension'] as const

export type SignupSource = (typeof SIGNUP_SOURCES)[number]

export function signupSourceFrom(value: string | null | undefined): SignupSource | undefined {
  return SIGNUP_SOURCES.find((source) => source === value)
}
