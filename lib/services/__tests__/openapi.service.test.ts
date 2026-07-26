import { describe, it, expect } from 'vitest'
import { buildOpenApiDocument } from '@/lib/services/openapi.service'
import {
  ORG_API_VERSION,
  organizationConsentRequestSchema,
  organizationRegisterSchema,
} from '@/lib/validations/org-api'

/**
 * LD-602: a specification written by hand drifts from the implementation, and
 * a drifted specification is worse than none because integrators trust it.
 * These assert the document is derived from the live schemas and describes the
 * contract the handlers actually enforce.
 */

// The document is a plain JSON structure, so the tests navigate it loosely on
// purpose: asserting against a typed model would just restate the generator.
const doc = buildOpenApiDocument('https://example.test') as any

describe('the document describes the real API', () => {
  it('is valid OpenAPI 3.1 with a version and a server', () => {
    expect(doc.openapi).toBe('3.1.0')
    expect(doc.info.version).toBe(ORG_API_VERSION)
    expect(doc.servers[0].url).toBe('https://example.test')
  })

  it('documents every org endpoint that exists', () => {
    expect(Object.keys(doc.paths).sort()).toEqual([
      '/api/org/consent-request',
      '/api/org/consent-requests',
      '/api/org/credentials',
      '/api/org/register',
      '/api/org/verify-consent',
    ])
  })

  it('derives request bodies from the schemas the handlers validate against', () => {
    const generated = doc.components.schemas.RegisterRequest
    // Adding a field to the Zod schema changes this without anyone editing the
    // document, which is the point.
    expect(Object.keys(generated.properties).sort()).toEqual(
      Object.keys(organizationRegisterSchema.shape).sort()
    )
    expect(generated.required).toContain('name')
    expect(generated.required).toContain('email')

    const consent = doc.components.schemas.ConsentRequest
    expect(Object.keys(consent.properties).sort()).toEqual(
      Object.keys(organizationConsentRequestSchema.shape).sort()
    )
  })
})

describe('the document tells the truth about the breaking changes from LD-109', () => {
  it('says registration needs a session and returns no key', () => {
    const register = doc.paths['/api/org/register'].post
    expect(register.security).toEqual([])
    expect(register.description.toLowerCase()).toContain('no key is returned')
    expect(register.responses['401']).toBeDefined()
  })

  it('documents the neutral 202 on consent-request rather than a 404', () => {
    const consent = doc.paths['/api/org/consent-request'].post
    expect(consent.responses['202']).toBeDefined()
    expect(consent.responses['404']).toBeUndefined()
    expect(consent.description.toLowerCase()).toContain('oracle')
  })

  it('documents rate limiting on every endpoint that has it', () => {
    for (const path of [
      '/api/org/register',
      '/api/org/consent-request',
      '/api/org/credentials',
    ]) {
      expect(doc.paths[path].post.responses['429'], `${path} is rate limited`).toBeDefined()
    }
  })

  it('documents the plan quota on credential issuance', () => {
    expect(doc.paths['/api/org/credentials'].post.responses['402']).toBeDefined()
  })
})

describe('the webhook contract', () => {
  it('describes the payload as identifiers and timestamps only', () => {
    const payload = doc.components.schemas.WebhookPayload
    expect(Object.keys(payload.properties).sort()).toEqual([
      'apiVersion',
      'event',
      'id',
      'occurredAt',
      'organizationId',
      'resource',
    ])
    expect(payload.description.toLowerCase()).toContain('never a user id')
  })

  it('tells an integrator exactly how to verify a signature', () => {
    const description = doc.webhooks['luciddata-event'].post.description
    expect(description).toContain('HMAC-SHA256')
    expect(description).toContain('x-luciddata-signature')
    expect(description).toContain('300 seconds')
  })
})
