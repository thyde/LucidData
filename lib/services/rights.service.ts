/**
 * LD-301 rights and data subject request engine.
 *
 * Export and deletion primitives existed before this, but nothing tracked a
 * request. A right with no case, no clock, and no appeal path is a promise
 * nobody can hold us to.
 *
 * Every transition writes two things: an append-only case event, which is the
 * evidence, and an audit entry, which binds that evidence into the person's
 * tamper-evident chain.
 */

import * as rightsRepo from '@/lib/repositories/rights.repository'
import { UserFacingError } from '@/lib/actions/action-result'
import { createAuditEntry } from '@/lib/services/audit.service'
import {
  computeDeadline,
  daysRemaining,
  isOverdue,
  JURISDICTION_RULES,
  type RightsJurisdiction,
} from '@/lib/utils/rights-deadlines'
import {
  RIGHTS_TYPE_LABELS,
  type FileRightsRequestInput,
  type RightsRequestType,
} from '@/lib/validations/rights'
import type { RightsCase, RightsCaseEvent } from '@/types/database.types'

export interface RightsCaseView {
  case: RightsCase
  events: RightsCaseEvent[]
  typeLabel: string
  jurisdictionLabel: string
  citation: string
  daysRemaining: number
  overdue: boolean
  canAppeal: boolean
  canWithdraw: boolean
}

const CLOSED_STATUSES = new Set(['fulfilled', 'refused'])

function jurisdictionOf(value: string): RightsJurisdiction {
  return (value in JURISDICTION_RULES ? value : 'other') as RightsJurisdiction
}

function pausesFor(record: RightsCase): { pausedAt: Date; resumedAt?: Date | null }[] {
  // A currently open pause is the only one not already folded into paused_ms.
  if (record.status !== 'paused' || !record.paused_at) return []
  return [{ pausedAt: new Date(record.paused_at), resumedAt: null }]
}

/** Recompute the due date from the record, so a stored value can never drift. */
export function dueDateFor(record: RightsCase, now: Date = new Date()): Date {
  const result = computeDeadline({
    jurisdiction: jurisdictionOf(record.jurisdiction),
    receivedAt: new Date(record.received_at),
    extended: record.extended_to !== null,
    pauses: pausesFor(record),
    now,
  })
  return new Date(result.dueAt.getTime() + Number(record.paused_ms ?? 0))
}

export function toView(
  record: RightsCase,
  events: RightsCaseEvent[],
  now: Date = new Date()
): RightsCaseView {
  const due = dueDateFor(record, now)
  const rule = JURISDICTION_RULES[jurisdictionOf(record.jurisdiction)]
  return {
    case: record,
    events,
    typeLabel: RIGHTS_TYPE_LABELS[record.type as RightsRequestType] ?? record.type,
    jurisdictionLabel: rule.label,
    citation: rule.citation,
    daysRemaining: daysRemaining(due, now),
    overdue: !CLOSED_STATUSES.has(record.status) && isOverdue(due, now),
    canAppeal: record.status === 'refused' && record.type !== 'appeal',
    canWithdraw: !CLOSED_STATUSES.has(record.status),
  }
}

async function record(
  caseId: string,
  userId: string,
  event: string,
  actor: 'user' | 'operator' | 'system',
  action: string,
  detail?: string
): Promise<void> {
  await rightsRepo.insertEvent({ case_id: caseId, event, actor, detail: detail ?? null })
  await createAuditEntry({
    userId,
    eventType: 'rights_case_updated',
    action,
    actorType: actor === 'operator' ? 'system' : actor === 'system' ? 'system' : 'user',
    metadata: { case_id: caseId, event },
  })
}

/**
 * File a request. The deadline is set from the jurisdiction at the moment of
 * receipt, so a later rule change cannot quietly move an existing deadline.
 */
export async function fileRequest(
  userId: string,
  input: FileRightsRequestInput
): Promise<RightsCase> {
  const existing = await rightsRepo.findOpenCaseOfType(userId, input.type)
  if (existing) {
    throw new UserFacingError('You already have an open request of this type')
  }

  const receivedAt = new Date()
  const { dueAt } = computeDeadline({
    jurisdiction: input.jurisdiction,
    receivedAt,
  })

  const created = await rightsRepo.insertCase({
    user_id: userId,
    type: input.type,
    jurisdiction: input.jurisdiction,
    status: 'received',
    detail: input.detail ?? null,
    received_at: receivedAt.toISOString(),
    due_at: dueAt.toISOString(),
  })

  await record(
    created.id,
    userId,
    'received',
    'user',
    `Filed a ${RIGHTS_TYPE_LABELS[input.type].toLowerCase()} request`,
    input.detail ?? undefined
  )

  return created
}

export async function listCases(userId: string): Promise<RightsCaseView[]> {
  const cases = await rightsRepo.findCasesByUser(userId)
  const now = new Date()
  const views: RightsCaseView[] = []
  for (const record of cases) {
    const events = await rightsRepo.findEventsByCase(record.id)
    views.push(toView(record, events, now))
  }
  return views
}

export async function getCase(userId: string, caseId: string): Promise<RightsCaseView | null> {
  const found = await rightsRepo.findCaseById(caseId, userId)
  if (!found) return null
  return toView(found, await rightsRepo.findEventsByCase(caseId))
}

/**
 * Stop the clock while we wait on the person. Only where the jurisdiction
 * allows it, so pausing cannot become an unlimited extension.
 */
export async function pauseCase(
  userId: string,
  caseId: string,
  reason: string
): Promise<RightsCase> {
  const found = await rightsRepo.findCaseById(caseId, userId)
  if (!found) throw new UserFacingError('Request not found')
  if (CLOSED_STATUSES.has(found.status)) throw new UserFacingError('This request is already closed')
  if (found.status === 'paused') return found

  const rule = JURISDICTION_RULES[jurisdictionOf(found.jurisdiction)]
  if (!rule.stopsTheClock) {
    throw new UserFacingError('The clock cannot be paused in this jurisdiction')
  }

  const updated = await rightsRepo.updateCase(caseId, userId, {
    status: 'paused',
    paused_at: new Date().toISOString(),
    resumed_at: null,
  })
  await record(caseId, userId, 'paused', 'operator', 'Paused a rights request', reason)
  return updated
}

export async function resumeCase(userId: string, caseId: string): Promise<RightsCase> {
  const found = await rightsRepo.findCaseById(caseId, userId)
  if (!found) throw new UserFacingError('Request not found')
  if (found.status !== 'paused' || !found.paused_at) return found

  const resumedAt = new Date()
  const elapsed = resumedAt.getTime() - new Date(found.paused_at).getTime()

  const updated = await rightsRepo.updateCase(caseId, userId, {
    status: 'in_progress',
    paused_at: null,
    resumed_at: resumedAt.toISOString(),
    paused_ms: Number(found.paused_ms ?? 0) + Math.max(0, elapsed),
  })
  await record(caseId, userId, 'resumed', 'operator', 'Resumed a rights request')
  return updated
}

/**
 * Extend, where the jurisdiction permits it. The reason is recorded because an
 * extension is only lawful on stated grounds.
 */
export async function extendCase(
  userId: string,
  caseId: string,
  reason: string
): Promise<RightsCase> {
  const found = await rightsRepo.findCaseById(caseId, userId)
  if (!found) throw new UserFacingError('Request not found')
  if (CLOSED_STATUSES.has(found.status)) throw new UserFacingError('This request is already closed')
  if (found.extended_to) throw new UserFacingError('This request has already been extended')

  const rule = JURISDICTION_RULES[jurisdictionOf(found.jurisdiction)]
  if (!rule.extension) throw new UserFacingError('No extension is available in this jurisdiction')

  const { dueAt } = computeDeadline({
    jurisdiction: jurisdictionOf(found.jurisdiction),
    receivedAt: new Date(found.received_at),
    extended: true,
  })
  const extendedTo = new Date(dueAt.getTime() + Number(found.paused_ms ?? 0))

  const updated = await rightsRepo.updateCase(caseId, userId, {
    extended_to: extendedTo.toISOString(),
    due_at: extendedTo.toISOString(),
  })
  await record(
    caseId,
    userId,
    'extended',
    'operator',
    `Extended a rights request under ${rule.citation}`,
    reason
  )
  return updated
}

export async function resolveCase(
  userId: string,
  caseId: string,
  resolution: 'fulfilled' | 'refused',
  note?: string
): Promise<RightsCase> {
  const found = await rightsRepo.findCaseById(caseId, userId)
  if (!found) throw new UserFacingError('Request not found')
  if (CLOSED_STATUSES.has(found.status)) throw new UserFacingError('This request is already closed')
  // A refusal has to say why. "No" without a reason cannot be appealed.
  if (resolution === 'refused' && !note?.trim()) {
    throw new UserFacingError('A refusal must state its reason')
  }

  const updated = await rightsRepo.updateCase(caseId, userId, {
    status: resolution,
    resolution,
    resolution_note: note ?? null,
  })
  await record(
    caseId,
    userId,
    resolution,
    'operator',
    resolution === 'fulfilled' ? 'Fulfilled a rights request' : 'Refused a rights request',
    note
  )
  return updated
}

export async function withdrawCase(userId: string, caseId: string): Promise<RightsCase> {
  const found = await rightsRepo.findCaseById(caseId, userId)
  if (!found) throw new UserFacingError('Request not found')
  if (CLOSED_STATUSES.has(found.status)) throw new UserFacingError('This request is already closed')

  const updated = await rightsRepo.updateCase(caseId, userId, {
    status: 'fulfilled',
    resolution: 'withdrawn',
  })
  await record(caseId, userId, 'withdrawn', 'user', 'Withdrew a rights request')
  return updated
}

/**
 * Appeal a refusal. The appeal is its own case with its own clock, so a
 * refusal cannot be quietly reopened and left to run past the original
 * deadline.
 */
export async function appealCase(
  userId: string,
  caseId: string,
  detail: string
): Promise<RightsCase> {
  const found = await rightsRepo.findCaseById(caseId, userId)
  if (!found) throw new UserFacingError('Request not found')
  if (found.status !== 'refused') throw new UserFacingError('Only a refused request can be appealed')
  if (found.type === 'appeal') throw new UserFacingError('An appeal cannot itself be appealed')

  const receivedAt = new Date()
  const { dueAt } = computeDeadline({
    jurisdiction: jurisdictionOf(found.jurisdiction),
    receivedAt,
  })

  const appeal = await rightsRepo.insertCase({
    user_id: userId,
    type: 'appeal',
    jurisdiction: found.jurisdiction,
    status: 'received',
    detail,
    received_at: receivedAt.toISOString(),
    due_at: dueAt.toISOString(),
    appeal_of_case_id: found.id,
  })

  await rightsRepo.updateCase(caseId, userId, { status: 'appealed' })
  await record(caseId, userId, 'appealed', 'user', 'Appealed a refused rights request', detail)
  await record(appeal.id, userId, 'received', 'user', 'Filed an appeal', detail)

  return appeal
}
