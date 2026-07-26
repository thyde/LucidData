import { z } from 'zod'
import { RIGHTS_JURISDICTIONS } from '@/lib/utils/rights-deadlines'

/** LD-301 data subject rights requests. */

export const rightsRequestTypeSchema = z.enum([
  'access',
  'correction',
  'deletion',
  'restriction',
  'portability',
  'appeal',
])
export type RightsRequestType = z.infer<typeof rightsRequestTypeSchema>

export const rightsJurisdictionSchema = z.enum(RIGHTS_JURISDICTIONS)

export const rightsStatusSchema = z.enum([
  'received',
  'verifying',
  'in_progress',
  'paused',
  'fulfilled',
  'refused',
  'appealed',
])
export type RightsStatus = z.infer<typeof rightsStatusSchema>

/** What each request type means, in the words a person would use. */
export const RIGHTS_TYPE_LABELS: Record<RightsRequestType, string> = {
  access: 'See what you hold about me',
  correction: 'Correct something that is wrong',
  deletion: 'Delete my data',
  restriction: 'Stop processing my data for now',
  portability: 'Give me a copy I can take elsewhere',
  appeal: 'Appeal a refusal',
}

export const RIGHTS_TYPE_DESCRIPTIONS: Record<RightsRequestType, string> = {
  access:
    'A list of the data we hold about you, where it came from, and who we have shared it with.',
  correction: 'Tell us what is wrong and what it should say instead.',
  deletion:
    'Erase your account and everything in it. You will get a signed receipt showing what was removed.',
  restriction:
    'Keep your data but stop using it, for example while you contest whether it is accurate.',
  portability: 'A machine-readable copy of your vault, decrypted in your browser.',
  appeal: 'Ask us to look again at a request we refused, and tell you why in writing.',
}

/** A person files a request. Jurisdiction drives the deadline, so it is required. */
export const fileRightsRequestSchema = z.object({
  type: rightsRequestTypeSchema.exclude(['appeal']),
  jurisdiction: rightsJurisdictionSchema,
  detail: z.string().max(2000).optional(),
})
export type FileRightsRequestInput = z.infer<typeof fileRightsRequestSchema>

export const appealRightsCaseSchema = z.object({
  caseId: z.string().uuid(),
  detail: z.string().min(10, 'Tell us why you are appealing').max(2000),
})
export type AppealRightsCaseInput = z.infer<typeof appealRightsCaseSchema>

export const withdrawRightsCaseSchema = z.object({
  caseId: z.string().uuid(),
})

export const resolveRightsCaseSchema = z.object({
  caseId: z.string().uuid(),
  resolution: z.enum(['fulfilled', 'refused']),
  note: z.string().max(2000).optional(),
})
export type ResolveRightsCaseInput = z.infer<typeof resolveRightsCaseSchema>
