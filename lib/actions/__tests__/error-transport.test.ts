import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'

/**
 * React sanitizes anything thrown out of a Server Action in production, so a
 * message written for the reader arrives as "An error occurred in the Server
 * Components render. The specific message is omitted in production builds".
 * The fix is to return the failure instead of throwing it, which means an
 * action that can reach a UserFacingError has to be wrapped in `guarded`.
 *
 * That is easy to forget, and forgetting it is invisible in development, where
 * the message still comes through. So the check runs in the build.
 *
 * The other half of the pattern -- calling `unwrap` at the call site -- needs no
 * test. `guarded` widens the return type to `T | ActionFailure`, so a caller
 * that ignores the failure does not compile.
 */

const LIB = join(process.cwd(), 'lib')

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      if (name === '__tests__' || name === 'node_modules') continue
      walk(full, out)
    } else if (name.endsWith('.ts') || name.endsWith('.tsx')) {
      out.push(full.replace(/\\/g, '/'))
    }
  }
  return out
}

const FILES = walk(LIB)
const SOURCE = new Map(FILES.map((f) => [f, readFileSync(f, 'utf8')]))

/** Resolve a `@/lib/...` specifier to a file this test can see. */
function resolve(spec: string): string | null {
  if (!spec.startsWith('@/lib/')) return null
  const base = join(process.cwd(), spec.replace('@/', '')).replace(/\\/g, '/')
  for (const candidate of [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`]) {
    if (SOURCE.has(candidate)) return candidate
  }
  return null
}

const IMPORTS = new Map<string, string[]>(
  FILES.map((file) => [
    file,
    [
      ...new Set(
        [...SOURCE.get(file)!.matchAll(/from\s+'([^']+)'/g)]
          .map((m) => resolve(m[1]))
          .filter((f): f is string => f !== null)
      ),
    ],
  ])
)

/** Files that construct or subclass UserFacingError themselves. */
const RAISES_DIRECTLY = new Set(
  FILES.filter((f) => /new UserFacingError\(|extends UserFacingError/.test(SOURCE.get(f)!))
)

/** Those, plus anything that can reach them through an import. */
function raisingFiles(): Set<string> {
  const reached = new Set(RAISES_DIRECTLY)
  let changed = true
  while (changed) {
    changed = false
    for (const file of FILES) {
      if (reached.has(file)) continue
      if (IMPORTS.get(file)!.some((dep) => reached.has(dep))) {
        reached.add(file)
        changed = true
      }
    }
  }
  return reached
}

const ACTIONS = FILES.filter((f) => f.includes('/lib/actions/') && f.endsWith('.actions.ts'))

function relative(file: string): string {
  return file.slice(file.indexOf('/lib/') + 1)
}

describe('user-facing errors survive the server action boundary', () => {
  it('finds the code it is asserting against', () => {
    expect(FILES.length).toBeGreaterThan(100)
    expect(ACTIONS.length).toBeGreaterThan(20)
    expect(RAISES_DIRECTLY.size).toBeGreaterThan(10)
  })

  it('wraps every action that can reach a UserFacingError in guarded', () => {
    const raising = raisingFiles()
    const unwrapped = ACTIONS.filter(
      (file) => raising.has(file) && !SOURCE.get(file)!.includes('guarded(')
    ).map(relative)

    expect(
      unwrapped,
      `These actions can raise a UserFacingError but do not use guarded(), so the ` +
        `message is discarded in production: ${unwrapped.join(', ')}`
    ).toEqual([])
  })

  it('wraps every exported function in an action file that uses guarded', () => {
    const partial: string[] = []

    for (const file of ACTIONS) {
      const text = SOURCE.get(file)!
      if (!text.includes('guarded(')) continue

      // Each exported action should hand its body to guarded. Compare the count
      // of exported functions against the count of guarded bodies.
      const exported = [...text.matchAll(/^export async function (\w+)/gm)].map((m) => m[1])
      const guards = [...text.matchAll(/return guarded\(/g)].length
      if (exported.length !== guards) {
        partial.push(`${relative(file)} (${exported.length} exported, ${guards} guarded)`)
      }
    }

    expect(
      partial,
      `An action file that uses guarded() should use it for every exported action, ` +
        `otherwise the ones left out silently lose their message: ${partial.join(', ')}`
    ).toEqual([])
  })

  it('transports only UserFacingError, so operational detail stays sanitized', () => {
    const guardText = readFileSync(join(LIB, 'actions', 'action-result.ts'), 'utf8')
    expect(guardText).toContain('instanceof UserFacingError')
    // Anything else has to keep travelling as a throw.
    expect(guardText).toMatch(/throw error/)
  })
})
