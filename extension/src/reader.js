/**
 * LD-206 in-page reader.
 *
 * Injected into a page only when tracker insight is on. It reads the browser's
 * own performance timeline, which already lists every resource the page
 * fetched, and returns the URLs.
 *
 * Reading a list of requests that already happened is not the same as watching
 * traffic, and the difference matters: this cannot see request bodies,
 * headers, cookies, or responses, and it cannot observe anything the page did
 * not itself request.
 *
 * It returns URLs and does not analyse them. Sanitization happens in the
 * background worker through url-safety.js, so there is one place that decides
 * what is storable.
 */
export function readResourceUrls() {
  try {
    const entries = performance.getEntriesByType('resource')
    return entries.map((entry) => entry.name).filter((name) => typeof name === 'string')
  } catch {
    return []
  }
}
