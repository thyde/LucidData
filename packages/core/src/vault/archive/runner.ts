import { VAULT_SCHEMA_TYPES } from '../../schemas/vault-schemas'
import { importedEntryLabel } from '../labels'
import { ALREADY_STORED } from '../../validations/provenance'
import { HEALTH_CONSENT_REQUIRED, RECOVERY_REQUIRED } from '../../validations/refusals'
import type { ImportedRecord } from './types'

/**
 * LD-210: store an export's records, encrypted, a batch at a time.
 *
 * Each record is encrypted on the device with its own data key, labelled by
 * its type only, and sent with its provenance, so the vault's unique index can
 * refuse one it already holds. That makes an import safe to run again: a
 * second run stores only what the first did not, which is how an import that
 * was cancelled or cut off carries on.
 */

export interface EncryptedEnvelope {
  client_ciphertext: string
  encrypted_dek: string
  dek_salt: string
}

export interface EntryToStore extends EncryptedEnvelope {
  label: string
  category: string
  schema_type: string
  source_provider: string
  source_record_id: string
  source_captured_at?: string
}

/** What the vault said about each entry, by its index in the batch. */
export type StoreAnswer = { index: number; id: string } | { index: number; code: string; error: string }

export interface ImportProgress {
  total: number
  /** Records accounted for so far, stored or not. */
  done: number
  stored: number
  /** Already in the vault from an earlier import. */
  alreadyStored: number
  failed: number
}

export type ImportStop = 'cancelled' | 'consent_declined' | 'recovery_required' | null

export interface ImportOutcome extends ImportProgress {
  stopped: ImportStop
  /** The first refusal the vault gave, for telling the person what went wrong. */
  firstError: string | null
}

export interface ImportDependencies {
  encrypt(plaintext: string): Promise<EncryptedEnvelope>
  store(entries: EntryToStore[]): Promise<StoreAnswer[]>
  /** Record ids already stored, so a second run skips them without encrypting them again. */
  alreadyStored?(): Promise<Iterable<string>>
  /** Ask for health data consent. Resolves true once it is given. Asked once at most. */
  askForHealthConsent?(): Promise<boolean>
  onProgress?(progress: ImportProgress): void
  signal?: AbortSignal
  batchSize?: number
}

async function entryFor(
  record: ImportedRecord,
  provider: string,
  encrypt: ImportDependencies['encrypt']
): Promise<EntryToStore> {
  return {
    label: importedEntryLabel(record.schemaType),
    category: VAULT_SCHEMA_TYPES[record.schemaType].category,
    schema_type: record.schemaType,
    source_provider: provider,
    source_record_id: record.sourceRecordId,
    ...(record.capturedAt ? { source_captured_at: record.capturedAt } : {}),
    ...(await encrypt(JSON.stringify(record.data))),
  }
}

type Refusal = Extract<StoreAnswer, { code: string }>

const refusedFor = (answer: StoreAnswer, code: string): answer is Refusal =>
  'code' in answer && answer.code === code

export async function runImport(
  records: readonly ImportedRecord[],
  provider: string,
  deps: ImportDependencies
): Promise<ImportOutcome> {
  const batchSize = deps.batchSize ?? 100
  const skip = new Set(deps.alreadyStored ? await deps.alreadyStored() : [])
  const queue = records.filter((record) => !skip.has(record.sourceRecordId))
  const progress: ImportProgress = {
    total: records.length,
    done: records.length - queue.length,
    stored: 0,
    alreadyStored: records.length - queue.length,
    failed: 0,
  }
  let firstError: string | null = null
  let consentAsked = false
  const report = () => deps.onProgress?.({ ...progress })
  const finish = (stopped: ImportStop): ImportOutcome => ({ ...progress, stopped, firstError })
  report()

  for (let start = 0; start < queue.length; start += batchSize) {
    if (deps.signal?.aborted) return finish('cancelled')
    const batch = queue.slice(start, start + batchSize)
    const entries = await Promise.all(batch.map((record) => entryFor(record, provider, deps.encrypt)))
    const answers = await deps.store(entries)

    const recovery = answers.find((answer) => refusedFor(answer, RECOVERY_REQUIRED))
    if (recovery) {
      firstError ??= recovery.error
      return finish('recovery_required')
    }

    const needConsent = answers.filter((answer) => refusedFor(answer, HEALTH_CONSENT_REQUIRED))
    if (needConsent.length > 0) {
      const granted = !consentAsked && deps.askForHealthConsent ? await deps.askForHealthConsent() : false
      consentAsked = true
      if (!granted) {
        for (const answer of answers) if ('id' in answer) progress.stored++
        return finish('consent_declined')
      }
      const retry = needConsent.map((answer) => entries[answer.index])
      const retried = await deps.store(retry)
      for (const [position, answer] of retried.entries()) {
        answers[needConsent[position].index] = { ...answer, index: needConsent[position].index }
      }
    }

    for (const answer of answers) {
      if ('id' in answer) progress.stored++
      else if (answer.code === ALREADY_STORED) progress.alreadyStored++
      else {
        progress.failed++
        firstError ??= answer.error
      }
    }
    progress.done += batch.length
    report()
  }

  return finish(null)
}
