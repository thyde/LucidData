import { z } from 'zod'
import {
  CLIENT_API_VERSION,
  accountDeleteSchema,
  consentCreateSchema,
  consentExtendSchema,
  consentRequestResponseSchema,
  consentRevokeSchema,
  credentialExportQuerySchema,
  credentialRequestDenySchema,
  credentialRequestFulfillSchema,
  healthConsentGrantSchema,
  ingestClearSchema,
  ingestionKeyPublishSchema,
  keySaltClaimSchema,
  legalAcceptSchema,
  profileUpdateSchema,
  recoveryEscrowSchema,
  recoveryFactorAddSchema,
  recoveryFactorRemoveSchema,
  shareCreateSchema,
  stepUpRequestSchema,
  vaultEntryBatchCreateSchema,
  vaultEntryCreateSchema,
  vaultEntryUpdateSchema,
  vaultRewrapApplySchema,
  vaultRewrapPartSchema,
  vaultRewrapSchema,
  vaultRewrapStartSchema,
} from '@luciddata/core/validations/client-api'

/**
 * LD-608 OpenAPI document for the versioned client API.
 *
 * Request bodies come from the Zod schemas the handlers parse, through
 * `z.toJSONSchema`, so the contract cannot drift from what the server
 * enforces. A test checks that every route file appears here with the methods
 * it exports, and that each documented body is the schema its handler parses.
 */

type JsonSchema = Record<string, unknown>
type Method = 'get' | 'post' | 'patch' | 'put' | 'delete'

export const REQUEST_SCHEMAS = {
  ProfileUpdate: profileUpdateSchema,
  KeySaltClaim: keySaltClaimSchema,
  VaultEntryCreate: vaultEntryCreateSchema,
  VaultEntryBatchCreate: vaultEntryBatchCreateSchema,
  VaultEntryUpdate: vaultEntryUpdateSchema,
  VaultRewrap: vaultRewrapSchema,
  VaultRewrapStart: vaultRewrapStartSchema,
  VaultRewrapPart: vaultRewrapPartSchema,
  VaultRewrapApply: vaultRewrapApplySchema,
  ConsentCreate: consentCreateSchema,
  ConsentRevoke: consentRevokeSchema,
  ConsentExtend: consentExtendSchema,
  ConsentRequestResponse: consentRequestResponseSchema,
  CredentialRequestFulfill: credentialRequestFulfillSchema,
  CredentialRequestDeny: credentialRequestDenySchema,
  ShareCreate: shareCreateSchema,
  IngestionKeyPublish: ingestionKeyPublishSchema,
  IngestClear: ingestClearSchema,
  LegalAccept: legalAcceptSchema,
  HealthConsentGrant: healthConsentGrantSchema,
  StepUpRequest: stepUpRequestSchema,
  AccountDelete: accountDeleteSchema,
  RecoveryEscrow: recoveryEscrowSchema,
  RecoveryFactorAdd: recoveryFactorAddSchema,
  RecoveryFactorRemove: recoveryFactorRemoveSchema,
} as const

export type RequestSchemaName = keyof typeof REQUEST_SCHEMAS

export interface RouteDoc {
  path: string
  method: Method
  summary: string
  description?: string
  body?: RequestSchemaName
  /** True when the body may be omitted. */
  optionalBody?: boolean
  query?: { name: string; description: string; required?: boolean; schema: JsonSchema }[]
  status?: number
  returns: string
}

const exportQuery = z.toJSONSchema(credentialExportQuerySchema, { io: 'input', target: 'draft-7' }) as {
  properties: Record<string, JsonSchema>
}

export const ROUTES: RouteDoc[] = [
  { path: '/api/v1/me', method: 'get', summary: 'Read the profile', returns: 'The profile, including the key salt the master key is derived with. No wrapped keys.' },
  { path: '/api/v1/me', method: 'patch', summary: 'Change the profile', body: 'ProfileUpdate', returns: 'The updated profile.' },
  { path: '/api/v1/me/key-salt', method: 'post', summary: 'Claim the key salt for a new vault', description: 'Stores the salt only if the account has none. The stored salt is returned, and it differs from the one sent only if another device claimed first.', body: 'KeySaltClaim', returns: 'The stored key salt.' },
  { path: '/api/v1/me/recovery-escrow', method: 'put', summary: 'Store the recovery code', description: 'The master key wrapped on the device under a key derived from a recovery code, stored as the escrow and as the recovery code factor. The code never reaches the server. Replacing an existing code needs a step-up grant for add_recovery_factor.', body: 'RecoveryEscrow', returns: 'Confirmation that the code is stored.' },
  { path: '/api/v1/recovery', method: 'get', summary: 'Read recovery status', description: 'A new vault refuses its first entry, with code recovery_required, until it has a recovery factor or the person has declined one.', returns: 'The recovery factors, and whether the vault may be written.' },
  { path: '/api/v1/recovery/material', method: 'get', summary: 'Read what recovery needs', description: 'After a password reset, the device opens the vault with a recovery code or kit. This returns the key salt, every wrapped copy of the master key, the oldest entry\'s wrapped data key, and the wrapped connector key, so the device can check that a copy still opens the vault. Only wrapped bytes are returned.', returns: 'The key salt, the escrow, the factors with their wrapped keys, and a probe entry.' },
  { path: '/api/v1/recovery/factors', method: 'post', summary: 'Add a recovery factor', description: 'A kit, or a code that replaces an existing one, needs a step-up grant for add_recovery_factor.', body: 'RecoveryFactorAdd', status: 201, returns: 'The new factor, without its wrapped key.' },
  { path: '/api/v1/recovery/factors/{id}', method: 'delete', summary: 'Remove a recovery factor', description: 'Needs a step-up grant for remove_recovery_factor. Removing the recovery code also clears the escrow that holds it.', body: 'RecoveryFactorRemove', returns: 'Confirmation of the removal.' },
  { path: '/api/v1/recovery/factors/{id}/confirm', method: 'post', summary: 'Confirm a recovery factor is still held', returns: 'Confirmation.' },
  { path: '/api/v1/recovery/decline', method: 'post', summary: 'Decline recovery', description: 'Accept that a forgotten password makes the vault permanently unreadable. Allows the first write without a factor.', returns: 'Confirmation.' },
  { path: '/api/v1/vault', method: 'get', summary: 'List vault entries', returns: 'Every entry, encrypted. Labels, categories, tags, and dates are readable; the contents are not.' },
  { path: '/api/v1/vault', method: 'post', summary: 'Store an encrypted entry', description: 'The device encrypts the entry with a fresh data key and wraps that key with the master key. Health entries need consent to store health data first. A record the vault already holds from the same source is refused with code already_stored.', body: 'VaultEntryCreate', status: 201, returns: 'The stored entry.' },
  { path: '/api/v1/vault/batch', method: 'post', summary: 'Store up to 100 encrypted entries', description: 'For imports. Each entry succeeds or fails on its own, and a record the vault already holds from the same source fails with code already_stored, so an import can be run again safely.', body: 'VaultEntryBatchCreate', returns: 'How many were stored, and a result for each entry by index.' },
  { path: '/api/v1/vault/rewrap', method: 'post', summary: 'Re-wrap every entry under a new master key', description: 'After a password change or a recovery, the device re-wraps every data key under the new master key and sends all of them at once; the server stores them in one transaction. Needs a step-up grant for change_password. Every recovery factor wraps the old key, so all are retired; store a new recovery code straight after. A request body is limited to 4.5 MB, so a vault of more than about 13,000 entries sends its re-wrap in parts through /api/v1/vault/rewraps.', body: 'VaultRewrap', returns: 'How many entries were re-wrapped, how many recovery kits stopped working, and how many passkeys stopped opening the vault.' },
  { path: '/api/v1/vault/rewraps', method: 'post', summary: 'Start a re-wrap sent in parts', description: 'For a vault whose envelopes do not fit in one request. Consumes a step-up grant for change_password. The re-wrap lasts 30 minutes, and starting another drops it.', body: 'VaultRewrapStart', status: 201, returns: 'The re-wrap id, for the parts and the apply call.' },
  { path: '/api/v1/vault/rewraps/{id}/entries', method: 'post', summary: 'Send part of a re-wrap', description: 'Envelopes wait on the server until the apply call. An entry sent again replaces what was sent for it, so a part can be retried. An expired re-wrap is refused with code not_found.', body: 'VaultRewrapPart', returns: 'How many envelopes the re-wrap holds so far.' },
  { path: '/api/v1/vault/rewraps/{id}/apply', method: 'post', summary: 'Apply a re-wrap sent in parts', description: 'Stores every envelope, and the connector key when sent, in one transaction. Refused with code conflict unless each entry the vault holds was sent once and re-wraps the key stored now; send the whole re-wrap again after reading the vault. Every recovery factor wraps the old key, so all are retired.', body: 'VaultRewrapApply', optionalBody: true, returns: 'How many entries were re-wrapped, how many recovery kits stopped working, and how many passkeys stopped opening the vault.' },
  { path: '/api/v1/vault/{id}', method: 'get', summary: 'Read one vault entry', returns: 'The entry, encrypted.' },
  { path: '/api/v1/vault/{id}', method: 'patch', summary: 'Change a vault entry', description: 'To change the contents, send client_ciphertext, encrypted_dek, and dek_salt together.', body: 'VaultEntryUpdate', returns: 'The updated entry.' },
  { path: '/api/v1/vault/{id}', method: 'delete', summary: 'Delete a vault entry', returns: 'Confirmation of the deletion.' },
  { path: '/api/v1/sources', method: 'get', summary: 'List data sources', returns: 'The providers that can be connected, and the connected sources.' },
  { path: '/api/v1/sources/{id}', method: 'delete', summary: 'Disconnect a data source', query: [{ name: 'delete_imported', description: 'Also delete the vault entries imported from this provider.', schema: { type: 'boolean', default: false } }], returns: 'Confirmation of the disconnection.' },
  { path: '/api/v1/ingest', method: 'get', summary: 'List sealed records waiting to be opened', description: 'Records a sync sealed to the ingestion key, oldest first, up to 200. Only the device holding the master key can open them.', returns: 'The sealed records, each with its provider.' },
  { path: '/api/v1/ingest/clear', method: 'post', summary: 'Clear sealed records the device has stored', body: 'IngestClear', returns: 'How many were cleared.' },
  { path: '/api/v1/ingest/key', method: 'get', summary: 'Read the ingestion key', returns: 'The public key, and the private half wrapped with the master key.' },
  { path: '/api/v1/ingest/key', method: 'put', summary: 'Publish the ingestion key', description: 'Once only. A second publish is refused, because replacing the key would strand records already sealed to it.', body: 'IngestionKeyPublish', returns: 'Confirmation that the key is published.' },
  { path: '/api/v1/consents', method: 'get', summary: 'List consents', returns: 'Every consent, each with its current status.' },
  { path: '/api/v1/consents', method: 'post', summary: 'Grant a consent', body: 'ConsentCreate', status: 201, returns: 'The consent, with its status.' },
  { path: '/api/v1/consents/{id}', method: 'get', summary: 'Read one consent', returns: 'The consent, with its status.' },
  { path: '/api/v1/consents/{id}/revoke', method: 'post', summary: 'Revoke a consent', description: 'Stops future access. Data already delivered stays with the recipient.', body: 'ConsentRevoke', returns: 'The revoked consent.' },
  { path: '/api/v1/consents/{id}/extend', method: 'post', summary: 'Extend a consent', body: 'ConsentExtend', returns: 'The consent with its new end date.' },
  { path: '/api/v1/requests/consent', method: 'get', summary: 'List consent requests from organizations', returns: 'Each request, with the name of the organization that asked.' },
  { path: '/api/v1/requests/consent/{id}', method: 'post', summary: 'Answer a consent request', description: 'Approving creates the consent the organization asked for.', body: 'ConsentRequestResponse', returns: 'The answered request.' },
  { path: '/api/v1/requests/credential', method: 'get', summary: 'List credential requests from organizations', returns: 'Each request, with the organization that asked.' },
  { path: '/api/v1/requests/credential/{id}/fulfill', method: 'post', summary: 'Answer a credential request by sharing', body: 'CredentialRequestFulfill', returns: 'How many credentials were shared.' },
  { path: '/api/v1/requests/credential/{id}/deny', method: 'post', summary: 'Decline a credential request', body: 'CredentialRequestDeny', returns: 'Confirmation that the request was declined.' },
  { path: '/api/v1/credentials', method: 'get', summary: 'List held credentials', returns: 'Credentials issued to the person, claimed and claimable, each with its issuer and a fresh signature check.' },
  { path: '/api/v1/credentials/formats', method: 'get', summary: 'List export formats', returns: 'The standards formats a credential can be exported into.' },
  { path: '/api/v1/credentials/{id}/claim', method: 'post', summary: 'Claim a credential', description: 'For a credential addressed to the account\'s verified email.', returns: 'The claimed credential.' },
  { path: '/api/v1/credentials/{id}/export', method: 'get', summary: 'Export a credential', query: [{ name: 'format', required: true, description: 'A format from /api/v1/credentials/formats.', schema: exportQuery.properties.format }, { name: 'version', description: 'A version of that format.', schema: exportQuery.properties.version }], returns: 'The credential in the requested format.' },
  { path: '/api/v1/shares', method: 'get', summary: 'List credential shares', returns: 'Every share link the person has made.' },
  { path: '/api/v1/shares', method: 'post', summary: 'Share chosen fields of a credential', description: 'The token comes back once. Store it on the device if it is needed again.', body: 'ShareCreate', status: 201, returns: 'The share, and its token.' },
  { path: '/api/v1/shares/{id}', method: 'delete', summary: 'Revoke a share', returns: 'Confirmation of the revocation.' },
  { path: '/api/v1/audit', method: 'get', summary: 'Read the audit log', returns: 'The audit log, and whether its hash chain verifies.' },
  { path: '/api/v1/notifications', method: 'get', summary: 'List notifications', returns: 'Notifications, and how many are unread.' },
  { path: '/api/v1/notifications/{id}/read', method: 'post', summary: 'Mark a notification read', returns: 'Confirmation.' },
  { path: '/api/v1/notifications/read-all', method: 'post', summary: 'Mark every notification read', returns: 'Confirmation.' },
  { path: '/api/v1/legal', method: 'get', summary: 'Read legal acceptance status', description: 'A client should block use until no document is outstanding, as the web app does.', returns: 'Accepted and outstanding documents, and health data consent.' },
  { path: '/api/v1/legal', method: 'post', summary: 'Accept the current terms or privacy policy', body: 'LegalAccept', returns: 'The updated status.' },
  { path: '/api/v1/legal/health-consent', method: 'post', summary: 'Consent to storing health data', description: 'Required before any health entry is stored, and separate from the terms.', body: 'HealthConsentGrant', optionalBody: true, returns: 'The updated status.' },
  { path: '/api/v1/legal/health-consent', method: 'delete', summary: 'Withdraw consent to storing health data', description: 'New health data is refused and every source is disconnected. Stored entries stay until deleted.', returns: 'The updated status, and how many sources were disconnected.' },
  { path: '/api/v1/step-up', method: 'post', summary: 'Confirm a sensitive action', description: 'Exchange the access token of a password sign-in made in the last two minutes for a single-use grant naming one action. The password itself is never sent.', body: 'StepUpRequest', returns: 'The grant token.' },
  { path: '/api/v1/account', method: 'delete', summary: 'Delete the account', description: 'Needs the phrase DELETE MY ACCOUNT and a step-up grant for delete_account.', body: 'AccountDelete', returns: 'The signed deletion receipt.' },
]

const ERROR_SCHEMA: JsonSchema = {
  type: 'object',
  required: ['error'],
  properties: {
    error: { type: 'string', description: 'A message written for the person using the client.' },
    code: { type: 'string', description: 'A stable code to branch on, when there is one.' },
    issues: {
      type: 'array',
      description: 'For invalid input, what was wrong with which field.',
      items: {
        type: 'object',
        properties: { path: { type: 'string' }, message: { type: 'string' } },
      },
    },
  },
}

function errorResponse(description: string) {
  return {
    description,
    content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
  }
}

function operation(route: RouteDoc): JsonSchema {
  const parameters = [
    ...(route.path.includes('{id}')
      ? [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }]
      : []),
    ...(route.query ?? []).map((param) => ({
      name: param.name,
      in: 'query',
      required: param.required ?? false,
      description: param.description,
      schema: param.schema,
    })),
  ]
  return {
    summary: route.summary,
    ...(route.description ? { description: route.description } : {}),
    ...(parameters.length > 0 ? { parameters } : {}),
    ...(route.body
      ? {
          requestBody: {
            required: !route.optionalBody,
            content: {
              'application/json': { schema: { $ref: `#/components/schemas/${route.body}` } },
            },
          },
        }
      : {}),
    responses: {
      [String(route.status ?? 200)]: {
        description: route.returns,
        content: {
          'application/json': {
            schema: { type: 'object', required: ['data'], properties: { data: {} } },
          },
        },
      },
      '400': errorResponse('Invalid input, or a refusal written for the person.'),
      '401': errorResponse('Missing or invalid token, a revoked session, or a second factor still to complete.'),
      ...(route.path.includes('{id}') ? { '404': errorResponse('Nothing with this id belongs to the person.') } : {}),
      '429': errorResponse('Too many requests. Try again shortly.'),
    },
  }
}

export function buildClientApiDocument(baseUrl: string): JsonSchema {
  const paths: Record<string, Record<string, JsonSchema>> = {}
  for (const route of ROUTES) {
    paths[route.path] = { ...(paths[route.path] ?? {}), [route.method]: operation(route) }
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'LucidData client API',
      version: CLIENT_API_VERSION,
      description:
        'The API the LucidData phone app and browser extensions use. Vault entries are encrypted on the device before they are sent, so the server stores and returns ciphertext it cannot read. Every request acts as the signed-in person, and row level security limits it to their own data. Request bodies are generated from the same schemas the server validates against.',
      contact: { email: 'support@luciddatabank.com' },
    },
    servers: [{ url: baseUrl }],
    security: [{ bearerAuth: [] }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description:
            'The access token from signing in to LucidData. An account with two-factor authentication needs a token from a session that completed it.',
        },
      },
      schemas: {
        Error: ERROR_SCHEMA,
        ...Object.fromEntries(
          Object.entries(REQUEST_SCHEMAS).map(([name, schema]) => [
            name,
            z.toJSONSchema(schema, { io: 'input', target: 'draft-7' }),
          ])
        ),
      },
    },
    paths,
  }
}
