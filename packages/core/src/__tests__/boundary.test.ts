import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { dirname, join, relative, resolve, sep } from 'path'

// LD-609: everything in this package must run in a browser, the phone app, and
// the extension. ESLint refuses framework, server, and Node imports by name;
// this test catches what a name cannot: a relative path that climbs out of the
// package, and a bare import the package does not declare.

const SRC = resolve(__dirname, '..')
const PACKAGE = resolve(SRC, '..')
const manifest = JSON.parse(readFileSync(join(PACKAGE, 'package.json'), 'utf8')) as {
  dependencies?: Record<string, string>
}
const DECLARED = new Set(Object.keys(manifest.dependencies ?? {}))

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) files(full, out)
    else if (/\.tsx?$/.test(name)) out.push(full)
  }
  return out
}

function specifiers(source: string): string[] {
  const found = new Set<string>()
  for (const pattern of [
    /\bfrom\s+['"]([^'"]+)['"]/g,
    /\bimport\s+['"]([^'"]+)['"]/g,
    /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bvi\.(?:mock|importActual|doMock)\(\s*['"]([^'"]+)['"]/g,
  ]) {
    for (const match of source.matchAll(pattern)) found.add(match[1])
  }
  return [...found]
}

function resolvesInside(file: string, spec: string): boolean {
  const target = resolve(dirname(file), spec)
  if (!(target + sep).startsWith(SRC + sep)) return false
  return ['.ts', '.tsx', join(sep, 'index.ts')].some((ext) => existsSync(target + ext))
}

const ALL = files(SRC)
const isTest = (file: string) => file.includes(`${sep}__tests__${sep}`)

describe('packages/core boundary', () => {
  it('finds the package source', () => {
    expect(ALL.filter((file) => !isTest(file)).length).toBeGreaterThan(20)
  })

  it('keeps every relative import inside the package, and resolvable', () => {
    const escapes = ALL.flatMap((file) =>
      specifiers(readFileSync(file, 'utf8'))
        .filter((spec) => spec.startsWith('.') && !resolvesInside(file, spec))
        .map((spec) => `${relative(PACKAGE, file)}: ${spec}`)
    )
    expect(escapes).toEqual([])
  })

  it('never reaches into the web app through its path alias', () => {
    const aliased = ALL.flatMap((file) =>
      specifiers(readFileSync(file, 'utf8'))
        .filter((spec) => spec.startsWith('@/'))
        .map((spec) => `${relative(PACKAGE, file)}: ${spec}`)
    )
    expect(aliased).toEqual([])
  })

  it('imports only the packages it declares', () => {
    const undeclared = ALL.filter((file) => !isTest(file)).flatMap((file) =>
      specifiers(readFileSync(file, 'utf8'))
        .filter((spec) => !spec.startsWith('.'))
        .map((spec) => (spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]))
        .filter((name) => !DECLARED.has(name))
        .map((name) => `${relative(PACKAGE, file)}: ${name}`)
    )
    expect(undeclared).toEqual([])
  })
})
