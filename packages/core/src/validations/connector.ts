import { z } from 'zod'

/** The ingestion keypair the device publishes once: the public half, and the private half wrapped with the master key. */
export const publishIngestionKeySchema = z.object({
  publicKey: z.string().min(40).max(4000),
  wrappedPrivateKey: z.string().min(20).max(8000),
  salt: z.string().min(8).max(200),
})

/** Sealed records the device has opened and stored as vault entries. */
export const clearPendingIngestSchema = z.object({
  ids: z.array(z.string().uuid()).max(200),
})

export const disconnectSourceSchema = z.object({
  sourceId: z.string().uuid(),
  deleteImported: z.boolean().default(false),
})

export type PublishIngestionKeyInput = z.infer<typeof publishIngestionKeySchema>
