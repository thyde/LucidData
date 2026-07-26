import { describe, it, expect } from 'vitest'
import {
  SealedBoxError,
  generateIngestionKeypair,
  openSealed,
  sealToPublicKey,
} from '@/lib/crypto/ingestion-keys'

/**
 * LD-201: the sync worker must be able to write records it cannot read. If
 * sealing were reversible with anything the worker holds, automation would
 * quietly end the privacy claim.
 */

describe('sealed box round trip', () => {
  it('opens with the matching private key', async () => {
    const pair = await generateIngestionKeypair()
    const sealed = await sealToPublicKey(pair.publicKeyB64, '{"steps":9214}')
    expect(await openSealed(pair.privateKeyB64, sealed)).toBe('{"steps":9214}')
  })

  it('handles a payload larger than one block', async () => {
    const pair = await generateIngestionKeypair()
    const payload = JSON.stringify({ note: 'a'.repeat(5000) })
    const sealed = await sealToPublicKey(pair.publicKeyB64, payload)
    expect(await openSealed(pair.privateKeyB64, sealed)).toBe(payload)
  })

  it('handles unicode without corrupting it', async () => {
    const pair = await generateIngestionKeypair()
    const payload = '{"label":"Morning run \u2600\ufe0f \u2014 5km"}'
    const sealed = await sealToPublicKey(pair.publicKeyB64, payload)
    expect(await openSealed(pair.privateKeyB64, sealed)).toBe(payload)
  })
})

describe('what the worker cannot do', () => {
  it('cannot open a record with a different private key', async () => {
    const recipient = await generateIngestionKeypair()
    const attacker = await generateIngestionKeypair()
    const sealed = await sealToPublicKey(recipient.publicKeyB64, 'secret')
    await expect(openSealed(attacker.privateKeyB64, sealed)).rejects.toThrow(SealedBoxError)
  })

  it('cannot open a record with the public key it sealed to', async () => {
    // The sender keeps nothing that opens the result. That is the point.
    const pair = await generateIngestionKeypair()
    const sealed = await sealToPublicKey(pair.publicKeyB64, 'secret')
    await expect(openSealed(pair.publicKeyB64, sealed)).rejects.toThrow()
  })

  it('produces different ciphertext for the same payload every time', async () => {
    // A fresh ephemeral keypair per record means a repeated value does not
    // produce a repeated ciphertext an observer could match.
    const pair = await generateIngestionKeypair()
    const first = await sealToPublicKey(pair.publicKeyB64, 'same')
    const second = await sealToPublicKey(pair.publicKeyB64, 'same')
    expect(first).not.toBe(second)
    expect(await openSealed(pair.privateKeyB64, first)).toBe('same')
    expect(await openSealed(pair.privateKeyB64, second)).toBe('same')
  })
})

describe('tampering', () => {
  it('refuses a payload whose ciphertext was altered', async () => {
    const pair = await generateIngestionKeypair()
    const sealed = await sealToPublicKey(pair.publicKeyB64, 'trusted')
    const bytes = Buffer.from(sealed, 'base64')
    bytes[bytes.length - 1] ^= 0xff
    await expect(
      openSealed(pair.privateKeyB64, bytes.toString('base64'))
    ).rejects.toThrow(SealedBoxError)
  })

  it('refuses a truncated payload rather than returning partial plaintext', async () => {
    const pair = await generateIngestionKeypair()
    const sealed = await sealToPublicKey(pair.publicKeyB64, 'trusted')
    const bytes = Buffer.from(sealed, 'base64').subarray(0, 8)
    await expect(
      openSealed(pair.privateKeyB64, bytes.toString('base64'))
    ).rejects.toThrow(SealedBoxError)
  })

  it('says nothing about why it failed', async () => {
    const recipient = await generateIngestionKeypair()
    const attacker = await generateIngestionKeypair()
    const sealed = await sealToPublicKey(recipient.publicKeyB64, 'secret')
    try {
      await openSealed(attacker.privateKeyB64, sealed)
      throw new Error('expected a refusal')
    } catch (error) {
      // Wrong key and tampered payload must look identical from outside.
      expect((error as Error).message).toBe('Could not open this record')
    }
  })
})

describe('keypairs', () => {
  it('generates a distinct pair each time', async () => {
    const first = await generateIngestionKeypair()
    const second = await generateIngestionKeypair()
    expect(first.publicKeyB64).not.toBe(second.publicKeyB64)
    expect(first.privateKeyB64).not.toBe(second.privateKeyB64)
  })

  it('does not embed the private key in the published half', async () => {
    const pair = await generateIngestionKeypair()
    expect(pair.publicKeyB64.length).toBeLessThan(pair.privateKeyB64.length)
    expect(pair.publicKeyB64).not.toContain(pair.privateKeyB64)
  })
})
