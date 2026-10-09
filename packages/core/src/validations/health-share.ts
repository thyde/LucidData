import { z } from 'zod'
import {
  MAX_SHARE_CIPHERTEXT_LENGTH,
  MAX_SHARE_LABEL_LENGTH,
  MAX_SHARE_RANGE_DAYS,
  METRIC_IDS,
  SHARE_EXPIRY_OPTIONS,
  isCalendarDay,
  rangeDays,
} from '../health/share'

/** Standard padded base64, as the vault's AES-GCM helpers write it. */
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/

/** A 12-byte IV and a 16-byte tag around nothing, the smallest ciphertext possible, is 40 characters. */
const MIN_CIPHERTEXT_LENGTH = 40

/**
 * LD-305: a health summary to share by link. The summary arrives encrypted, and
 * the key never does: nothing here has a field for it, and an unknown field is
 * refused. The terms are stated in the clear because the receipt and the share
 * list show them.
 */
export const createHealthShareSchema = z
  .strictObject({
    ciphertext: z
      .string()
      .min(MIN_CIPHERTEXT_LENGTH, 'The encrypted summary is missing')
      .max(MAX_SHARE_CIPHERTEXT_LENGTH, 'This summary is too large to share. Choose fewer figures or a shorter range.')
      .regex(BASE64, 'The encrypted summary is not valid'),
    metrics: z
      .array(z.enum(METRIC_IDS))
      .min(1, 'Choose at least one figure to share')
      .max(METRIC_IDS.length)
      .refine((metrics) => new Set(metrics).size === metrics.length, 'A figure is listed twice'),
    rangeStart: z.string().refine(isCalendarDay, 'Choose a start date'),
    rangeEnd: z.string().refine(isCalendarDay, 'Choose an end date'),
    expiresInDays: z.literal([...SHARE_EXPIRY_OPTIONS], 'Choose how long the link works'),
    label: z
      .string()
      .trim()
      .max(MAX_SHARE_LABEL_LENGTH, `Keep the label to ${MAX_SHARE_LABEL_LENGTH} characters`)
      .optional()
      .transform((label) => (label ? label : undefined)),
  })
  .refine((share) => share.rangeStart <= share.rangeEnd, {
    message: 'The start date must be on or before the end date',
    path: ['rangeStart'],
  })
  .refine((share) => rangeDays(share.rangeStart, share.rangeEnd) <= MAX_SHARE_RANGE_DAYS, {
    message: 'A share covers a year at most',
    path: ['rangeStart'],
  })

export type CreateHealthShareInput = z.input<typeof createHealthShareSchema>
export type CreateHealthShare = z.output<typeof createHealthShareSchema>

export const healthShareIdSchema = z.strictObject({ shareId: z.string().uuid() })
