'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useEncryption } from '@/lib/context/encryption-context'
import { openSealed, generateIngestionKeypair } from '@/lib/crypto/ingestion-keys'
import { decryptWithKey, encryptWithKey } from '@/lib/crypto/client-crypto'
import {
  clearPendingIngestAction,
  getIngestionKeyAction,
  listPendingIngestAction,
  publishIngestionKeyAction,
} from '@/lib/actions/connector.actions'
import { createVaultEntryAction } from '@/lib/actions/vault.actions'
import { VAULT_KEYS } from '@/lib/hooks/useVault'

/**
 * LD-201: open what the sync worker sealed, and write it into the vault.
 *
 * This runs in the browser after unlock, because it is the only place the
 * ingestion private key can be unwrapped. The worker wrote ciphertext it could
 * not read; this is the other half of that bargain.
 *
 * The private key is wrapped with the master key and stored, so the person can
 * open records on any device they can already unlock. The wrapped form uses the
 * same AES-GCM helper the vault uses, keyed on the master key directly rather
 * than a per-entry DEK, because there is exactly one of these per person.
 */
export interface DrainState {
  status: 'idle' | 'preparing' | 'draining' | 'done' | 'error'
  imported: number
  error: string | null
}

export function usePendingIngest(): DrainState & { drain: () => Promise<void> } {
  const { masterKey, isLocked, encrypt } = useEncryption()
  const queryClient = useQueryClient()
  const [state, setState] = useState<DrainState>({
    status: 'idle',
    imported: 0,
    error: null,
  })
  // One drain at a time. Two concurrent runs would race to write the same
  // entry and then race to delete the same pending row.
  const running = useRef(false)

  const drain = useCallback(async () => {
    if (running.current || !masterKey) return
    running.current = true

    try {
      setState({ status: 'preparing', imported: 0, error: null })

      let stored = await getIngestionKeyAction()

      // First run on this account: mint the keypair and publish the public
      // half so a worker has somewhere to seal to.
      if (!stored.publicKey || !stored.wrappedPrivateKey) {
        const pair = await generateIngestionKeypair()
        const wrapped = await encryptWithKey(masterKey, pair.privateKeyB64)
        await publishIngestionKeyAction({
          publicKey: pair.publicKeyB64,
          wrappedPrivateKey: wrapped,
          salt: 'master-key',
        })
        stored = await getIngestionKeyAction()
        // Nothing can be waiting yet, because the worker had no key until now.
        setState({ status: 'done', imported: 0, error: null })
        return
      }

      const pending = await listPendingIngestAction()
      if (pending.length === 0) {
        setState({ status: 'done', imported: 0, error: null })
        return
      }

      setState({ status: 'draining', imported: 0, error: null })
      const privateKey = await decryptWithKey(masterKey, stored.wrappedPrivateKey)

      const drained: string[] = []
      let imported = 0

      for (const record of pending) {
        try {
          const plaintext = await openSealed(privateKey, record.sealed_payload)
          // The real label is sealed with the payload, because a provider's
          // free-text name can carry places and people. Split it back out.
          const { __label: sealedLabel, ...payload } = JSON.parse(plaintext) as Record<
            string,
            unknown
          > & { __label?: string }
          // Re-encrypt under the normal vault envelope, per-entry DEK and all,
          // so an imported entry is indistinguishable from one typed by hand
          // and nothing reaches the server without its wrapped key.
          const encrypted = await encrypt(JSON.stringify(payload))
          await createVaultEntryAction({
            label: sealedLabel ?? record.label,
            category: record.category,
            schema_type: record.schema_type,
            // LD-202 provenance. Identifiers only, so it can sit outside the
            // envelope and still answer "where did this come from".
            ...(record.provider ? { source_provider: record.provider } : {}),
            ...(record.provider ? { source_record_id: record.provider_record_id } : {}),
            ...(record.captured_at ? { source_captured_at: record.captured_at } : {}),
            ...encrypted,
          })
          drained.push(record.id)
          imported += 1
        } catch {
          // A record we cannot open is left queued rather than dropped. It is
          // the person's data, and a failure here is ours to investigate.
        }
      }

      if (drained.length > 0) {
        await clearPendingIngestAction({ ids: drained })
        queryClient.invalidateQueries({ queryKey: VAULT_KEYS.lists() })
      }

      setState({ status: 'done', imported, error: null })
    } catch (error) {
      setState({
        status: 'error',
        imported: 0,
        error: error instanceof Error ? error.message : 'Could not import new records',
      })
    } finally {
      running.current = false
    }
  }, [masterKey, encrypt, queryClient])

  useEffect(() => {
    if (isLocked) return
    // Deferred rather than called inline, so the unlock render settles before
    // the drain starts reporting progress into the same tree.
    const timer = setTimeout(() => {
      void drain()
    }, 0)
    return () => clearTimeout(timer)
  }, [isLocked, drain])

  return { ...state, drain }
}
