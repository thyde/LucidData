import { describe, it, expect } from 'vitest'
import crypto from 'crypto'
import {
  CREDENTIAL_FORMATS,
  CredentialFormatError,
  DEFAULT_FORMAT,
  describeFormats,
  disclosableClaimCount,
  getFormat,
  isSupportedFormat,
  lucidEd25519Format,
  presentSubset,
  sdJwtVcFormat,
  w3cVc2Format,
  type IssueRequest,
  type IssuerSigner,
} from '../index'
import { disclosureDigest, makeDisclosure } from '../sd-jwt-vc'

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519')
const PUBLIC_KEY_B64 = Buffer.from(
  publicKey.export({ type: 'spki', format: 'der' })
).toString('base64')

const KEY_ID = 'key_test_0001'
const signer: IssuerSigner = {
  keyId: KEY_ID,
  sign: (message) => crypto.sign(null, message, privateKey),
}
const keys = [{ keyId: KEY_ID, publicKeyB64: PUBLIC_KEY_B64 }]

const REQUEST: IssueRequest = {
  credentialId: '11111111-2222-3333-4444-555555555555',
  schemaType: 'employment',
  label: 'Senior Engineer at Example Ltd',
  subjectEmail: 'person@example.com',
  claims: {
    employer: 'Example Ltd',
    job_title: 'Senior Engineer',
    start_date: '2021-04-01',
    date_of_birth: '1990-02-11',
  },
  issuerName: 'Example Ltd',
  issuerDomain: 'example.com',
  issuerOrgId: 'org_123',
  issuedAt: '2026-01-15T10:00:00.000Z',
  expiresAt: null,
}

describe('the registry fails closed', () => {
  // A verifier that guesses a format when the declared one is missing can be
  // steered into checking a credential under weaker rules than the issuer
  // applied. Every one of these must throw rather than fall back.

  it('refuses an unknown format', () => {
    expect(() => getFormat('mdoc')).toThrow(CredentialFormatError)
  })

  it('refuses a known format at an unknown version', () => {
    expect(() => getFormat('sd-jwt-vc', 'draft-01')).toThrow(/Unsupported/)
  })

  it('refuses an empty format rather than picking a default', () => {
    expect(() => getFormat('')).toThrow(/No credential format/)
  })

  it('resolves a single-version format without a version', () => {
    expect(getFormat('sd-jwt-vc').format).toBe('sd-jwt-vc')
  })

  it('reports support without throwing', () => {
    expect(isSupportedFormat('w3c-vc', '2.0')).toBe(true)
    expect(isSupportedFormat('mdoc')).toBe(false)
  })

  it('defaults to the native format, so existing issuance is unchanged', () => {
    expect(DEFAULT_FORMAT.format).toBe('lucid-ed25519')
  })

  it('describes every registered format', () => {
    const described = describeFormats()

    expect(described).toHaveLength(CREDENTIAL_FORMATS.length)
    for (const entry of described) {
      expect(entry.description.length).toBeGreaterThan(40)
      expect(entry.label.length).toBeGreaterThan(0)
    }
  })

  it('registers no two formats under the same identifier and version', () => {
    const seen = CREDENTIAL_FORMATS.map((f) => `${f.format}@${f.version}`)

    expect(new Set(seen).size).toBe(seen.length)
  })
})

describe('SD-JWT VC', () => {
  it('issues and verifies with every claim disclosed', () => {
    const artifact = sdJwtVcFormat.issue(REQUEST, signer)

    const result = sdJwtVcFormat.verify(artifact.serialized, { keys })

    expect(result.valid).toBe(true)
    expect(result.disclosed).toMatchObject({
      employer: 'Example Ltd',
      job_title: 'Senior Engineer',
    })
  })

  it('lets the holder disclose a subset without the issuer key', () => {
    // This is the whole point of the format, and what LD-402 and LD-404 need.
    const artifact = sdJwtVcFormat.issue(REQUEST, signer)

    const partial = presentSubset(artifact.serialized, ['employer'])
    const result = sdJwtVcFormat.verify(partial, { keys })

    expect(result.valid).toBe(true)
    expect(result.disclosed).toEqual({ employer: 'Example Ltd' })
    expect(result.disclosed).not.toHaveProperty('date_of_birth')
  })

  it('keeps the issuer signature valid after claims are withheld', () => {
    const artifact = sdJwtVcFormat.issue(REQUEST, signer)

    const nothing = presentSubset(artifact.serialized, [])

    expect(sdJwtVcFormat.verify(nothing, { keys }).valid).toBe(true)
  })

  it('tells the verifier that something was withheld, without saying what', () => {
    const artifact = sdJwtVcFormat.issue(REQUEST, signer)

    const result = sdJwtVcFormat.verify(presentSubset(artifact.serialized, ['employer']), {
      keys,
    })

    expect(result.warnings.join(' ')).toMatch(/3 claims were withheld/)
    expect(result.warnings.join(' ')).not.toMatch(/date_of_birth/)
  })

  it('never puts a withheld value in the issued bytes', () => {
    const artifact = sdJwtVcFormat.issue(REQUEST, signer)

    const partial = presentSubset(artifact.serialized, ['employer'])

    // The digest stays, the value does not. Anything else would make the
    // selective part of selective disclosure cosmetic.
    expect(partial).not.toContain(Buffer.from('1990-02-11').toString('base64url'))
    expect(Buffer.from(partial).toString()).not.toContain('1990-02-11')
  })

  it('rejects a disclosure the issuer never committed to', () => {
    const artifact = sdJwtVcFormat.issue(REQUEST, signer)
    const forged = makeDisclosure('salary', 250000)

    const tampered = artifact.serialized.replace(/~$/, `~${forged}~`)

    const result = sdJwtVcFormat.verify(tampered, { keys })
    expect(result.valid).toBe(false)
    expect(result.reasons[0]).toMatch(/not committed to/)
  })

  it('rejects the same claim disclosed twice', () => {
    const artifact = sdJwtVcFormat.issue(REQUEST, signer)
    const parts = artifact.serialized.split('~').filter(Boolean)
    const duplicated = [...parts, parts[1]].join('~') + '~'

    expect(sdJwtVcFormat.verify(duplicated, { keys }).reasons[0]).toMatch(/disclosed twice/)
  })

  it('refuses an algorithm it did not choose', () => {
    // "alg: none" and algorithm confusion are the classic JWT attacks. Trusting
    // the header is how they work.
    const artifact = sdJwtVcFormat.issue(REQUEST, signer)
    const [jwt, ...rest] = artifact.serialized.split('~')
    const [, payload, signature] = jwt.split('.')
    const header = Buffer.from(JSON.stringify({ alg: 'none', kid: KEY_ID })).toString('base64url')

    const forged = [[header, payload, signature].join('.'), ...rest].join('~')

    expect(sdJwtVcFormat.verify(forged, { keys }).reasons[0]).toMatch(/Unsupported signature/)
  })

  it('refuses a digest algorithm it did not choose', () => {
    const artifact = sdJwtVcFormat.issue(REQUEST, signer)
    const [jwt, ...rest] = artifact.serialized.split('~')
    const [header, payloadB64, signature] = jwt.split('.')
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString())
    payload._sd_alg = 'md5'
    const forged = [
      [header, Buffer.from(JSON.stringify(payload)).toString('base64url'), signature].join('.'),
      ...rest,
    ].join('~')

    expect(sdJwtVcFormat.verify(forged, { keys }).reasons[0]).toMatch(/Unsupported digest/)
  })

  it('rejects a payload edited after signing', () => {
    const artifact = sdJwtVcFormat.issue(REQUEST, signer)
    const [jwt, ...rest] = artifact.serialized.split('~')
    const [header, payloadB64, signature] = jwt.split('.')
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString())
    payload.iss = 'did:web:attacker.example'
    const forged = [
      [header, Buffer.from(JSON.stringify(payload)).toString('base64url'), signature].join('.'),
      ...rest,
    ].join('~')

    expect(sdJwtVcFormat.verify(forged, { keys }).reasons[0]).toMatch(/signature does not verify/)
  })

  it('selects the key by its identifier rather than whichever is current', () => {
    // LD-406 rotation depends on this. Verifying against the current key would
    // invalidate every credential signed by a retired one.
    const artifact = sdJwtVcFormat.issue(REQUEST, signer)
    const other = crypto.generateKeyPairSync('ed25519')
    const rotated = [
      { keyId: 'key_new', publicKeyB64: Buffer.from(other.publicKey.export({ type: 'spki', format: 'der' })).toString('base64') },
      ...keys,
    ]

    expect(sdJwtVcFormat.verify(artifact.serialized, { keys: rotated }).valid).toBe(true)
  })

  it('refuses a key the verifier does not hold', () => {
    const artifact = sdJwtVcFormat.issue(REQUEST, signer)

    expect(sdJwtVcFormat.verify(artifact.serialized, { keys: [] }).reasons[0]).toMatch(
      /does not hold/
    )
  })

  it('reports an expired credential', () => {
    const artifact = sdJwtVcFormat.issue(
      { ...REQUEST, expiresAt: '2026-02-01T00:00:00.000Z' },
      signer
    )

    const result = sdJwtVcFormat.verify(artifact.serialized, {
      keys,
      now: new Date('2026-03-01T00:00:00.000Z'),
    })

    expect(result.valid).toBe(false)
    expect(result.reasons).toContain('Credential has expired')
  })

  it('refuses to claim freshness when a nonce was requested', () => {
    // A verifier that asked for proof this was not captured must not be told
    // the check passed when nothing carries the nonce.
    const artifact = sdJwtVcFormat.issue(REQUEST, signer)

    const result = sdJwtVcFormat.verify(artifact.serialized, { keys, expectedNonce: 'abc' })

    expect(result.valid).toBe(false)
    expect(result.reasons[0]).toMatch(/holder binding/)
  })

  it('salts each disclosure, so a withheld value cannot be guessed', () => {
    // Without a salt, "is this claim over_18: true?" is answerable by hashing
    // the guess and looking for the digest.
    const a = makeDisclosure('over_18', true)
    const b = makeDisclosure('over_18', true)

    expect(a).not.toBe(b)
    expect(disclosureDigest(a)).not.toBe(disclosureDigest(b))
  })

  it('orders digests independently of claim order', () => {
    const artifact = sdJwtVcFormat.issue(REQUEST, signer)
    const payload = JSON.parse(
      Buffer.from(artifact.serialized.split('~')[0].split('.')[1], 'base64url').toString()
    )

    expect(payload._sd).toEqual([...payload._sd].sort())
  })

  it('reports how many claims could be disclosed without revealing them', () => {
    const artifact = sdJwtVcFormat.issue(REQUEST, signer)

    expect(disclosableClaimCount(presentSubset(artifact.serialized, ['employer']))).toBe(4)
  })

  it.each([
    ['empty string', ''],
    ['no separator', 'abc.def.ghi'],
    ['malformed jwt', 'not-a-jwt~'],
    ['bad disclosure', (() => sdJwtVcFormat.issue(REQUEST, signer).serialized + 'notbase64!~')()],
  ])('rejects %s rather than throwing', (_label, input) => {
    const result = sdJwtVcFormat.verify(input, { keys })

    expect(result.valid).toBe(false)
    expect(result.reasons.length).toBeGreaterThan(0)
  })
})

describe('W3C VC 2.0', () => {
  it('issues a document with both contexts and verifies it', () => {
    const artifact = w3cVc2Format.issue(REQUEST, signer)

    expect(artifact.document['@context']).toEqual([
      'https://www.w3.org/ns/credentials/v2',
      'https://luciddatabank.com/credentials/v1',
    ])
    expect(w3cVc2Format.verify(artifact.serialized, { keys }).valid).toBe(true)
  })

  it('uses did:web when the issuer has a verified domain', () => {
    const artifact = w3cVc2Format.issue(REQUEST, signer)

    expect((artifact.document.issuer as { id: string }).id).toBe('did:web:example.com')
  })

  it('falls back to a urn when there is no verified domain', () => {
    const artifact = w3cVc2Format.issue({ ...REQUEST, issuerDomain: null }, signer)

    expect((artifact.document.issuer as { id: string }).id).toBe('urn:lucid:org:org_123')
  })

  it('rejects a claim edited after signing', () => {
    const artifact = w3cVc2Format.issue(REQUEST, signer)
    const document = JSON.parse(artifact.serialized)
    document.credentialSubject.job_title = 'Chief Executive'

    const result = w3cVc2Format.verify(JSON.stringify(document), { keys })

    expect(result.valid).toBe(false)
    expect(result.reasons[0]).toMatch(/signature does not verify/)
  })

  it('rejects a document with no proof', () => {
    const artifact = w3cVc2Format.issue(REQUEST, signer)
    const { proof: _dropped, ...unsigned } = JSON.parse(artifact.serialized)
    void _dropped

    expect(w3cVc2Format.verify(JSON.stringify(unsigned), { keys }).reasons[0]).toMatch(/no proof/)
  })

  it('rejects an unsupported proof type', () => {
    const artifact = w3cVc2Format.issue(REQUEST, signer)
    const document = JSON.parse(artifact.serialized)
    document.proof.type = 'RsaSignature2018'

    expect(w3cVc2Format.verify(JSON.stringify(document), { keys }).reasons[0]).toMatch(
      /Unsupported proof type/
    )
  })

  it('discloses the claims but not the subject email as a claim', () => {
    const artifact = w3cVc2Format.issue(REQUEST, signer)

    const result = w3cVc2Format.verify(artifact.serialized, { keys })

    expect(result.disclosed).not.toHaveProperty('email')
    expect(result.disclosed).toHaveProperty('employer')
  })

  it('reports an expired credential', () => {
    const artifact = w3cVc2Format.issue(
      { ...REQUEST, expiresAt: '2026-02-01T00:00:00.000Z' },
      signer
    )

    const result = w3cVc2Format.verify(artifact.serialized, {
      keys,
      now: new Date('2026-03-01T00:00:00.000Z'),
    })

    expect(result.reasons).toContain('Credential has expired')
  })

  it('is not JSON', () => {
    expect(w3cVc2Format.verify('{ broken', { keys }).reasons[0]).toMatch(/not valid JSON/)
  })
})

describe('the native format still works', () => {
  // Every credential issued before LD-401 is in this format. If this suite
  // fails, existing credentials stopped verifying, which is the one outcome
  // adding formats must never produce.

  it('issues and verifies', () => {
    const artifact = lucidEd25519Format.issue(REQUEST, signer)

    expect(lucidEd25519Format.verify(artifact.serialized, { keys }).valid).toBe(true)
  })

  it('verifies a payload signed the way credential.service.ts has always signed it', () => {
    // Constructed here rather than through issue(), so this checks the shape
    // that is already in the database rather than the one this module writes.
    const payload = {
      '@context': 'https://luciddatabank.com/credentials/v1',
      id: REQUEST.credentialId,
      type: 'employment',
      label: REQUEST.label,
      issuer: { id: 'org_123', name: 'Example Ltd', domain: 'example.com' },
      subject: { email: REQUEST.subjectEmail },
      claims: REQUEST.claims,
      issued_at: REQUEST.issuedAt,
      expires_at: null,
    }
    const signature = crypto
      .sign(
        null,
        Buffer.from(
          JSON.stringify(sortDeep(payload)),
          'utf8'
        ),
        privateKey
      )
      .toString('base64url')

    const result = lucidEd25519Format.verify(JSON.stringify({ payload, signature }), { keys })

    expect(result.valid).toBe(true)
    expect(result.disclosed).toMatchObject({ employer: 'Example Ltd' })
  })

  it('rejects a tampered claim', () => {
    const artifact = lucidEd25519Format.issue(REQUEST, signer)
    const envelope = JSON.parse(artifact.serialized)
    envelope.payload.claims.job_title = 'Chief Executive'

    expect(lucidEd25519Format.verify(JSON.stringify(envelope), { keys }).valid).toBe(false)
  })
})

describe('issued bytes are preserved rather than rebuilt', () => {
  // A format that re-serializes on read can break its own signature when a
  // serializer changes, and the failure looks identical to tampering.
  it.each(CREDENTIAL_FORMATS.map((f) => [f.label, f] as const))(
    '%s verifies the exact bytes it issued',
    (_label, format) => {
      const artifact = format.issue(REQUEST, signer)

      expect(format.verify(artifact.serialized, { keys }).valid).toBe(true)
      expect(artifact.keyId).toBe(KEY_ID)
      expect(artifact.formatVersion).toEqual({
        format: format.format,
        version: format.version,
      })
    }
  )
})

/** Mirror of the canonicalization in lib/crypto/credential-verify.ts. */
function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep)
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortDeep((value as Record<string, unknown>)[key])
        return acc
      }, {})
  }
  return value
}
