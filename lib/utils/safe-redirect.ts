/**
 * Where to send someone after sign-in. Only a path on this site is accepted, so a
 * crafted link such as /login?redirectedFrom=https://evil.example cannot carry a
 * person who just signed in to another origin.
 */
export function safeRedirectPath(value: string | null | undefined, fallback = '/dashboard'): string {
  if (!value || !value.startsWith('/')) return fallback
  // Protocol-relative (//host) and backslash forms are read by browsers as another origin.
  if (value.startsWith('//') || value.includes('\\')) return fallback
  // Reject control characters, which browsers strip before parsing.
  if (/[\u0000-\u001f\u007f]/.test(value)) return fallback
  return value
}
