import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'fs'
import { dirname, join, relative, sep } from 'path'
import * as clientApi from '@luciddata/core/validations/client-api'
import { REQUEST_SCHEMAS, ROUTES, buildClientApiDocument } from '@/lib/api/v1/openapi'
import { INDIVIDUAL_DOCUMENTS } from '@/lib/constants/legal'

// LD-608: the route files are the implementation and ROUTES is the contract.
// These checks keep the two the same thing.

const V1 = join(process.cwd(), 'app', 'api', 'v1')
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) return routeFiles(full)
    return name === 'route.ts' ? [full] : []
  })
}

function apiPath(file: string): string {
  const segments = relative(V1, dirname(file)).split(sep).filter(Boolean)
  return `/api/v1/${segments.map((segment) => segment.replace(/^\[(\w+)\]$/, '{$1}')).join('/')}`
}

const FILES = routeFiles(V1).filter((file) => apiPath(file) !== '/api/v1/openapi')
const SOURCE = new Map(FILES.map((file) => [apiPath(file), readFileSync(file, 'utf8')]))

describe('client API routes', () => {
  it('finds the route files', () => {
    expect(FILES.length).toBeGreaterThan(30)
  })

  it('documents every operation the server exposes, and nothing else', () => {
    const implemented = [...SOURCE].flatMap(([path, text]) =>
      METHODS.filter((method) => new RegExp(`export const ${method}\\b`).test(text)).map(
        (method) => `${method.toLowerCase()} ${path}`
      )
    )
    const documented = ROUTES.map((route) => `${route.method} ${route.path}`)
    expect(implemented.sort()).toEqual(documented.sort())
  })

  it('wraps every handler in v1, so each one authenticates', () => {
    for (const [path, text] of SOURCE) {
      for (const match of text.matchAll(/export const (GET|POST|PUT|PATCH|DELETE) = (\S+)/g)) {
        expect(match[2], `${match[1]} ${path}`).toMatch(/^v1[(<]/)
      }
      expect(text, path).not.toMatch(/export (async )?function/)
    }
  })

  it('never uses the service role in a handler', () => {
    for (const [path, text] of SOURCE) {
      expect(text, path).not.toMatch(/supabase\/service|createServiceClient/)
    }
  })

  it('never takes a user id from the request', () => {
    for (const [path, text] of SOURCE) {
      expect(text, path).not.toMatch(/\b(input|body|params|query|searchParams)\.(user_?id|userId)\b/i)
      expect(text, path).not.toMatch(/searchParams\.get\(['"]user/)
    }
  })

  it('validates each documented body with the schema the document shows', () => {
    for (const route of ROUTES.filter((item) => item.body)) {
      const schema = REQUEST_SCHEMAS[route.body!]
      const name = Object.entries(clientApi).find(([, value]) => value === schema)?.[0]
      expect(name, route.body).toBeDefined()
      expect(SOURCE.get(route.path), `${route.method} ${route.path}`).toContain(`${name}.parse(`)
    }
  })

  it('lets a client accept exactly the documents the product asks for', () => {
    expect(clientApi.legalAcceptSchema.shape.documents.element.options).toEqual([
      ...INDIVIDUAL_DOCUMENTS,
    ])
  })
})

describe('OpenAPI document', () => {
  const document = buildClientApiDocument('https://example.test') as {
    paths: Record<string, Record<string, { responses: Record<string, unknown> }>>
    components: { schemas: Record<string, unknown> }
  }

  it('describes every documented operation with its error responses', () => {
    for (const route of ROUTES) {
      const operation = document.paths[route.path][route.method]
      expect(Object.keys(operation.responses)).toEqual(
        expect.arrayContaining([String(route.status ?? 200), '400', '401', '429'])
      )
    }
  })

  it('publishes every request schema', () => {
    expect(Object.keys(document.components.schemas)).toEqual(
      expect.arrayContaining(Object.keys(REQUEST_SCHEMAS))
    )
  })

  it('matches the published snapshot', () => {
    expect(document).toMatchSnapshot()
  })
})
