/**
 * LD-602 OpenAPI document for the organization API.
 *
 * Request and response shapes are produced from the same Zod schemas the
 * handlers validate against, using `z.toJSONSchema`. That is the whole point:
 * a specification written by hand drifts from the implementation within weeks,
 * and a drifted specification is worse than none because integrators trust it.
 *
 * Anything not derived from a schema is described here once, next to the route
 * it documents, so a change to a route and a change to its documentation land
 * in the same diff.
 */

import { z } from 'zod'
import {
  ORG_API_VERSION,
  organizationRegisterSchema,
  organizationConsentRequestSchema,
  organizationCredentialIssueSchema,
} from '@/lib/validations/org-api'
import { WEBHOOK_API_VERSION, WEBHOOK_EVENTS } from '@/lib/services/webhook.service'

type JsonSchema = Record<string, unknown>

function schemaOf(schema: z.ZodType): JsonSchema {
  return z.toJSONSchema(schema, { io: 'input', target: 'draft-7' }) as JsonSchema
}

const RATE_LIMITED = {
  description: 'Rate limited. Retry after the window resets.',
  content: {
    'application/json': {
      schema: { type: 'object', properties: { error: { type: 'string' } } },
    },
  },
}

const UNAUTHORIZED = {
  description: 'Missing or invalid API key.',
  content: {
    'application/json': {
      schema: { type: 'object', properties: { error: { type: 'string' } } },
    },
  },
}

export function buildOpenApiDocument(baseUrl: string): JsonSchema {
  return {
    openapi: '3.1.0',
    info: {
      title: 'LucidData organization API',
      version: ORG_API_VERSION,
      description:
        'Ask a person for consent, issue and verify credentials, and receive signed webhooks. This document is generated from the same schemas the endpoints validate against, so it cannot drift from the implementation.',
      contact: { email: 'support@luciddatabank.com' },
    },
    servers: [{ url: baseUrl }],
    security: [{ apiKey: [] }],
    components: {
      securitySchemes: {
        apiKey: {
          type: 'apiKey',
          in: 'header',
          name: 'x-api-key',
          description:
            'An organization API key. Keys are issued only after domain verification, and registration does not return one.',
        },
      },
      schemas: {
        RegisterRequest: schemaOf(organizationRegisterSchema),
        ConsentRequest: schemaOf(organizationConsentRequestSchema),
        CredentialIssueRequest: schemaOf(organizationCredentialIssueSchema),
        WebhookPayload: {
          type: 'object',
          required: ['id', 'event', 'organizationId', 'resource', 'occurredAt', 'apiVersion'],
          properties: {
            id: { type: 'string', format: 'uuid' },
            event: { type: 'string', enum: [...WEBHOOK_EVENTS] },
            organizationId: { type: 'string', format: 'uuid' },
            resource: {
              type: 'object',
              required: ['type', 'id'],
              properties: {
                type: { type: 'string' },
                id: { type: 'string', format: 'uuid' },
              },
            },
            occurredAt: { type: 'string', format: 'date-time' },
            apiVersion: { type: 'string', const: WEBHOOK_API_VERSION },
          },
          description:
            'Carries identifiers and timestamps only. Never a user id, an email address, a data category, a purpose, a credential claim, or vault content. Call back with your API key to fetch detail.',
        },
      },
    },
    paths: {
      '/api/org/register': {
        post: {
          summary: 'Register an organization',
          description:
            'Requires a signed-in session rather than an API key. No key is returned: keys are issued only after the domain is verified, which is why this endpoint cannot be used to mint credentials for a domain you do not control.',
          security: [],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/RegisterRequest' },
              },
            },
          },
          responses: {
            '201': { description: 'Organization created. No API key is returned.' },
            '401': { description: 'No session. Sign in first.' },
            '429': RATE_LIMITED,
          },
        },
      },
      '/api/org/consent-request': {
        post: {
          summary: 'Ask a person for consent',
          description:
            'Always answers 202 with a fixed body, whether or not the address belongs to an account. A 404 here would turn the endpoint into an account-existence oracle.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ConsentRequest' },
              },
            },
          },
          responses: {
            '202': {
              description:
                'Accepted. The response is identical for a known and an unknown address.',
            },
            '401': UNAUTHORIZED,
            '403': {
              description: 'The organization is not verified, so it cannot contact people.',
            },
            '429': RATE_LIMITED,
          },
        },
      },
      '/api/org/consent-requests': {
        get: {
          summary: 'List consent requests this organization has sent',
          responses: {
            '200': { description: 'Requests with their current status.' },
            '401': UNAUTHORIZED,
          },
        },
      },
      '/api/org/credentials': {
        post: {
          summary: 'Issue a credential',
          description:
            'Signed with your issuer key. Counts against both your plan quota and the hourly issuance limit.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CredentialIssueRequest' },
              },
            },
          },
          responses: {
            '201': { description: 'Credential issued.' },
            '401': UNAUTHORIZED,
            '402': { description: 'Plan issuance quota exhausted.' },
            '429': RATE_LIMITED,
          },
        },
      },
      '/api/org/verify-consent': {
        get: {
          summary: 'Check whether a consent grant is currently valid',
          description:
            'Returns whether access is permitted right now. A grant outside its window, or revoked, answers false rather than erroring.',
          responses: {
            '200': { description: 'The current validity of the grant.' },
            '401': UNAUTHORIZED,
          },
        },
      },
    },
    webhooks: {
      'luciddata-event': {
        post: {
          summary: 'Signed event delivery',
          description:
            'Signed with HMAC-SHA256 over `${timestamp}.${body}` in the x-luciddata-signature header, formatted `t=<unix>,v1=<hex>`. Reject a signature older than 300 seconds; the timestamp is inside the signed material, so it cannot be altered to replay an old body.',
          requestBody: {
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/WebhookPayload' },
              },
            },
          },
          responses: {
            '2XX': {
              description:
                'Any 2xx marks the delivery complete. Anything else is retried with exponential backoff for up to eight attempts.',
            },
          },
        },
      },
    },
  }
}
