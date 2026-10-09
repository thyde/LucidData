import { describe, it, expect, beforeEach, vi } from 'vitest'
import { webcrypto } from 'node:crypto'

if (!globalThis.crypto?.subtle) {
  // @ts-expect-error assign Node Web Crypto where SubtleCrypto is missing
  globalThis.crypto = webcrypto
}

const getVaultKeyEnvelopesAction = vi.fn()
const beginVaultRewrapAction = vi.fn()
const stageVaultRewrapAction = vi.fn()
const applyVaultRewrapAction = vi.fn()
const getIngestionKeyAction = vi.fn()

vi.mock('@/lib/actions/account.actions', () => ({
  claimKeySaltAction: vi.fn(),
  setRecoveryEscrowAction: vi.fn(),
  getVaultKeyEnvelopesAction: (...args: unknown[]) => getVaultKeyEnvelopesAction(...args),
  beginVaultRewrapAction: (...args: unknown[]) => beginVaultRewrapAction(...args),
  stageVaultRewrapAction: (...args: unknown[]) => stageVaultRewrapAction(...args),
  applyVaultRewrapAction: (...args: unknown[]) => applyVaultRewrapAction(...args),
}))
vi.mock('@/lib/actions/recovery.actions', () => ({ addRecoveryFactorAction: vi.fn() }))
vi.mock('@/lib/actions/legal.actions', () => ({ recordRegistrationChoicesAction: vi.fn() }))
vi.mock('@/lib/actions/connector.actions', () => ({
  getIngestionKeyAction: (...args: unknown[]) => getIngestionKeyAction(...args),
}))

const {
  EntriesUnderAnotherKeyError,
  openVaultWithRecoverySecret,
  prepareRewrap,
  rewrapAllEntries,
  storeRewrap,
  vaultHasContent,
  vaultOpensWith,
} = await import('@/lib/account/account-crypto')
const { importMasterKey } = await import('@luciddata/core/crypto/key-derivation')
const { actionFailure } = await import('@/lib/actions/action-result')
const { decryptVaultEntry, decryptWithKey, encryptVaultEntry, encryptWithKey } = await import(
  '@luciddata/core/crypto/client-crypto'
)
const recovery = await import('@luciddata/core/crypto/recovery')

/** A fresh vault key, kept as raw bytes so it can be wrapped and compared. */
async function vaultKey() {
  const raw = webcrypto.getRandomValues(new Uint8Array(32))
  return { raw, key: await importMasterKey(raw.buffer) }
}

async function wrapped(raw: Uint8Array, secret: string) {
  const salt = recovery.generateRecoverySalt()
  const key = await recovery.deriveRecoveryKey(secret, salt)
  return { wrapped_master_key: await recovery.wrapMasterKeyForRecovery(raw.buffer as ArrayBuffer, key), salt }
}

async function opensWith(key: CryptoKey, entry: { encrypted_dek: string; dek_salt: string }) {
  return recovery.opensDataKey(key, entry)
}

type Envelope = { id: string; encrypted_dek: string; dek_salt: string; previous_encrypted_dek: string }

/** Everything the re-wrap sent: its start, every part in order, and the apply. */
function sentRewrap() {
  return {
    begin: beginVaultRewrapAction.mock.calls[0]?.[0] as { reason: string; stepUpToken: string },
    parts: stageVaultRewrapAction.mock.calls.map(([input]) => input as { rewrapId: string; entries: Envelope[] }),
    apply: applyVaultRewrapAction.mock.calls[0]?.[0] as {
      rewrapId: string
      ingestKey?: { previous: string; wrapped: string }
    },
    entries: stageVaultRewrapAction.mock.calls.flatMap(([input]) => (input as { entries: Envelope[] }).entries),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  beginVaultRewrapAction.mockResolvedValue({ rewrapId: 'rewrap-1' })
  stageVaultRewrapAction.mockImplementation(async (input: { entries: unknown[] }) => ({ staged: input.entries.length }))
  applyVaultRewrapAction.mockResolvedValue({ rewrapped: 0, retiredKits: 1, retiredPasskeys: 2 })
  getIngestionKeyAction.mockResolvedValue({ publicKey: null, wrappedPrivateKey: null, salt: null })
})

describe('opening the vault with a recovery code or kit', () => {
  it('opens with the code held in escrow, and with a kit, but not with a kit made for another key', async () => {
    const current = await vaultKey()
    const older = await vaultKey()
    const code = recovery.generateRecoveryCode()
    const kit = recovery.generateRecoveryKitSecret()
    const staleKit = recovery.generateRecoveryKitSecret()
    const entry = await encryptVaultEntry(current.key, 'resting heart rate 58')
    const material = {
      key_salt: 'c2FsdA==',
      escrow: await wrapped(current.raw, code),
      factors: [
        { id: 'kit-1', type: 'recovery_kit' as const, ...(await wrapped(current.raw, kit)) },
        { id: 'kit-2', type: 'recovery_kit' as const, ...(await wrapped(older.raw, staleKit)) },
      ],
      probe: { encrypted_dek: entry.encrypted_dek, dek_salt: entry.dek_salt },
      ingest_key: null,
    }

    for (const secret of [code, kit.toLowerCase()]) {
      const attempt = await openVaultWithRecoverySecret(secret, material)
      expect(attempt.status).toBe('opened')
      if (attempt.status !== 'opened') return
      expect(
        await decryptVaultEntry(attempt.masterKey, entry.client_ciphertext, entry.encrypted_dek, entry.dek_salt)
      ).toBe('resting heart rate 58')
    }

    // The stale kit opens its own copy, but that key no longer opens the vault.
    expect((await openVaultWithRecoverySecret(staleKit, material)).status).toBe('no_match')
    // A code is never tried against a kit, or a kit against the escrow.
    expect((await openVaultWithRecoverySecret(recovery.generateRecoveryCode(), material)).status).toBe(
      'no_match'
    )
    expect((await openVaultWithRecoverySecret('not a secret', material)).status).toBe('not_a_secret')
  }, 60_000)
})

describe('rewrapAllEntries', () => {
  it('moves entries to the new key, keeps ones already there, and sends the grant', async () => {
    const oldKey = await vaultKey()
    const newKey = await vaultKey()
    const underOld = await encryptVaultEntry(oldKey.key, 'from before the reset')
    const underNew = await encryptVaultEntry(newKey.key, 'stored after the reset')
    getVaultKeyEnvelopesAction.mockResolvedValue([
      { id: 'old', ...underOld },
      { id: 'new', ...underNew },
    ])

    const result = await rewrapAllEntries(oldKey.key, newKey.key, 'recovery', 'grant')

    expect(result).toEqual({ count: 2, retiredKits: 1, retiredPasskeys: 2 })
    const sent = sentRewrap()
    expect(sent.begin).toEqual({ reason: 'recovery', stepUpToken: 'grant' })
    // No connector key was read, and the server is told so: one published
    // meanwhile under the old key must stop the re-wrap rather than strand.
    expect(sent.apply).toEqual({ rewrapId: 'rewrap-1', ingestKey: { previous: null, wrapped: null } })
    expect(sent.parts.every((part) => part.rewrapId === 'rewrap-1')).toBe(true)
    expect(sent.entries).toHaveLength(2)
    for (const entry of sent.entries) expect(await opensWith(newKey.key, entry)).toBe(true)
    // The entry already under the new key goes back exactly as it was.
    expect(sent.entries.find((entry) => entry.id === 'new')).toEqual({
      id: 'new',
      encrypted_dek: underNew.encrypted_dek,
      dek_salt: underNew.dek_salt,
      previous_encrypted_dek: underNew.encrypted_dek,
    })
    // Each envelope names the one it replaces, so the server can refuse an entry edited meanwhile.
    expect(sent.entries.find((entry) => entry.id === 'old')).toMatchObject({
      previous_encrypted_dek: underOld.encrypted_dek,
    })
  })

  it('refuses to send anything when an entry opens with neither key, and counts them', async () => {
    const oldKey = await vaultKey()
    const newKey = await vaultKey()
    const between = await vaultKey()
    getVaultKeyEnvelopesAction.mockResolvedValue([
      { id: 'old', ...(await encryptVaultEntry(oldKey.key, 'movable')) },
      { id: 'between-1', ...(await encryptVaultEntry(between.key, 'saved under another password')) },
      { id: 'between-2', ...(await encryptVaultEntry(between.key, 'saved under another password')) },
    ])

    const failure = await rewrapAllEntries(oldKey.key, newKey.key, 'recovery', 'grant').catch(
      (error: unknown) => error
    )

    expect(failure).toBeInstanceOf(EntriesUnderAnotherKeyError)
    expect((failure as InstanceType<typeof EntriesUnderAnotherKeyError>).count).toBe(2)
    expect(beginVaultRewrapAction).not.toHaveBeenCalled()
    expect(stageVaultRewrapAction).not.toHaveBeenCalled()
  })

  it('prepares the envelopes without sending them', async () => {
    const oldKey = await vaultKey()
    const newKey = await vaultKey()
    getVaultKeyEnvelopesAction.mockResolvedValue([
      { id: 'one', ...(await encryptVaultEntry(oldKey.key, 'payload')) },
    ])

    const prepared = await prepareRewrap(oldKey.key, newKey.key)

    expect(prepared.entries).toHaveLength(1)
    expect(await opensWith(newKey.key, prepared.entries[0])).toBe(true)
    expect(prepared.ingestKey).toBeNull()
    expect(beginVaultRewrapAction).not.toHaveBeenCalled()
  })

  it('sends a large vault in parts, then applies them once', async () => {
    const prepared = {
      entries: Array.from({ length: 5 }, (_, n) => ({
        id: `entry-${n}`,
        encrypted_dek: `new-${n}`,
        dek_salt: `salt-${n}`,
        previous_encrypted_dek: `old-${n}`,
      })),
      ingestKey: { previous: 'old-ingest', wrapped: 'new-ingest' },
    }

    expect(await storeRewrap(prepared, 'password_change', 'grant', 2)).toEqual({
      count: 5,
      retiredKits: 1,
      retiredPasskeys: 2,
    })

    const sent = sentRewrap()
    expect(sent.parts.map((part) => part.entries.length)).toEqual([2, 2, 1])
    expect(sent.entries).toEqual(prepared.entries)
    expect(applyVaultRewrapAction).toHaveBeenCalledTimes(1)
    expect(sent.apply).toEqual({ rewrapId: 'rewrap-1', ingestKey: prepared.ingestKey })
    // Nothing is applied until every part is in.
    expect(applyVaultRewrapAction.mock.invocationCallOrder[0]).toBeGreaterThan(
      Math.max(...stageVaultRewrapAction.mock.invocationCallOrder)
    )
  })

  it('applies nothing when a part is refused', async () => {
    stageVaultRewrapAction
      .mockResolvedValueOnce({ staged: 2 })
      .mockResolvedValueOnce(actionFailure('The re-encryption took too long and was stopped. Try again.', 'not_found'))
    const prepared = {
      entries: Array.from({ length: 4 }, (_, n) => ({
        id: `entry-${n}`,
        encrypted_dek: `new-${n}`,
        dek_salt: `salt-${n}`,
        previous_encrypted_dek: `old-${n}`,
      })),
      ingestKey: null,
    }

    await expect(storeRewrap(prepared, 'recovery', 'grant', 2)).rejects.toThrow(/took too long/)
    expect(applyVaultRewrapAction).not.toHaveBeenCalled()
  })

  it('moves the connector ingestion key with the entries, so synced records still open', async () => {
    const oldKey = await vaultKey()
    const newKey = await vaultKey()
    const wrapped = await encryptWithKey(oldKey.key, 'ingestion-private-key')
    getVaultKeyEnvelopesAction.mockResolvedValue([])
    getIngestionKeyAction.mockResolvedValue({ publicKey: 'pub', wrappedPrivateKey: wrapped, salt: 'master-key' })

    await rewrapAllEntries(oldKey.key, newKey.key, 'password_change', 'grant')

    const { apply, parts } = sentRewrap()
    // An empty vault sends no parts, and the key still moves in the apply.
    expect(parts).toEqual([])
    expect(apply.ingestKey!.previous).toBe(wrapped)
    expect(await decryptWithKey(newKey.key, apply.ingestKey!.wrapped)).toBe('ingestion-private-key')
  })

  it('sends no ingestion key it cannot open, and keeps one already under the new key', async () => {
    const oldKey = await vaultKey()
    const newKey = await vaultKey()
    const lost = await vaultKey()
    getVaultKeyEnvelopesAction.mockResolvedValue([])

    const stranded = await encryptWithKey(lost.key, 'stranded')
    getIngestionKeyAction.mockResolvedValue({ publicKey: 'pub', wrappedPrivateKey: stranded, salt: 'master-key' })
    const prepared = await prepareRewrap(oldKey.key, newKey.key)
    expect(prepared.ingestKey).toBeNull()

    // The key stays where it is, and the server checks it is still the one read.
    await storeRewrap(prepared, 'password_change', 'grant')
    expect(sentRewrap().apply).toEqual({ rewrapId: 'rewrap-1', ingestKey: { previous: stranded, wrapped: null } })

    getIngestionKeyAction.mockResolvedValue({
      publicKey: 'pub',
      wrappedPrivateKey: await encryptWithKey(newKey.key, 'already moved'),
      salt: 'master-key',
    })
    expect((await prepareRewrap(oldKey.key, newKey.key)).ingestKey).toBeNull()
  })
})

describe('vaultOpensWith', () => {
  it('never confirms a key on an empty vault, and checks the probe otherwise', async () => {
    const key = await vaultKey()
    const other = await vaultKey()
    const entry = await encryptVaultEntry(key.key, 'x')

    // Nothing can confirm it, so a caller must not read "empty" as "already done".
    expect(await vaultOpensWith(key.key, { probe: null, ingest_key: null })).toBe(false)
    expect(await vaultOpensWith(key.key, { probe: entry, ingest_key: null })).toBe(true)
    expect(await vaultOpensWith(other.key, { probe: entry, ingest_key: null })).toBe(false)
  })

  it('checks the connector key when the vault has no entries', async () => {
    const key = await vaultKey()
    const other = await vaultKey()
    const ingest_key = { wrapped: await encryptWithKey(key.key, 'ingestion-private-key') }

    expect(await vaultOpensWith(key.key, { probe: null, ingest_key })).toBe(true)
    expect(await vaultOpensWith(other.key, { probe: null, ingest_key })).toBe(false)
  })
})

describe('recovering a vault whose only content is the connector key', () => {
  it('refuses a stale kit, because the connector key decides which copy is current', async () => {
    const current = await vaultKey()
    const older = await vaultKey()
    const kit = recovery.generateRecoveryKitSecret()
    const staleKit = recovery.generateRecoveryKitSecret()
    const material = {
      key_salt: 'c2FsdA==',
      escrow: null,
      factors: [
        { id: 'kit-1', type: 'recovery_kit' as const, ...(await wrapped(current.raw, kit)) },
        { id: 'kit-2', type: 'recovery_kit' as const, ...(await wrapped(older.raw, staleKit)) },
      ],
      probe: null,
      ingest_key: { wrapped: await encryptWithKey(current.key, 'ingestion-private-key') },
    }

    expect((await openVaultWithRecoverySecret(staleKit, material)).status).toBe('no_match')
    const attempt = await openVaultWithRecoverySecret(kit, material)
    expect(attempt.status).toBe('opened')
    if (attempt.status !== 'opened') return
    expect(await decryptWithKey(attempt.masterKey, material.ingest_key.wrapped)).toBe(
      'ingestion-private-key'
    )
  }, 60_000)

  it('accepts the current recovery code when an earlier change stranded the connector key', async () => {
    const current = await vaultKey()
    const earlier = await vaultKey()
    const code = recovery.generateRecoveryCode()
    const kit = recovery.generateRecoveryKitSecret()
    const material = {
      key_salt: 'c2FsdA==',
      escrow: await wrapped(current.raw, code),
      factors: [{ id: 'kit-1', type: 'recovery_kit' as const, ...(await wrapped(current.raw, kit)) }],
      probe: null,
      // Wrapped under a key from before an earlier password change, never moved.
      ingest_key: { wrapped: await encryptWithKey(earlier.key, 'stranded-ingestion-key') },
    }

    const byCode = await openVaultWithRecoverySecret(code, material)
    expect(byCode).toMatchObject({ status: 'opened', connectorKeyLost: true })
    // A kit gets no such allowance: a stale kit would look exactly like this.
    expect((await openVaultWithRecoverySecret(kit, material)).status).toBe('no_match')
  }, 60_000)

  it('counts the connector key as content, so a reset without a code keeps the factors', () => {
    expect(vaultHasContent({ probe: null, ingest_key: null })).toBe(false)
    expect(vaultHasContent({ probe: null, ingest_key: { wrapped: 'd3JhcHBlZA==' } })).toBe(true)
  })
})
