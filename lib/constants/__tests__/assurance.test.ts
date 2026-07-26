import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  AVAILABILITY_TARGET,
  BREACH_NOTIFICATION_TEMPLATE,
  CONTINUITY,
  DATA_RESIDENCY,
  INCIDENT_ROLES,
  INCIDENT_STEPS,
  PROCESSING_TERMS,
  RECOVERY_OBJECTIVES,
  RECOVERY_TESTING_STATEMENT,
  RESIDENCY_SUMMARY,
  SECURITY_QUESTIONNAIRE,
  SUPPORT_SEVERITIES,
} from '@/lib/constants/assurance'
import { CERTIFICATIONS, SUBPROCESSORS } from '@/lib/constants/trust-disclosures'

/**
 * LD-107: these statements end up in a contract, so the rule from LD-101
 * applies with more force. Nothing may be claimed that has not happened, and
 * every published document must stay reachable from the trust centre.
 */

describe('nothing is claimed that has not happened', () => {
  it('does not describe an untested recovery objective as tested', () => {
    for (const entry of RECOVERY_OBJECTIVES) {
      if (entry.lastTestedAt === null) continue
      // A date, if present, must be a real one.
      expect(Number.isNaN(new Date(entry.lastTestedAt).getTime())).toBe(false)
    }
  })

  it('says plainly that no drill has been run while none has', () => {
    const anyTested = RECOVERY_OBJECTIVES.some((entry) => entry.lastTestedAt !== null)
    if (!anyTested) {
      expect(RECOVERY_TESTING_STATEMENT.toLowerCase()).toContain('no recovery drill')
    }
  })

  it('does not claim measured uptime while it is unmeasured', () => {
    if (!AVAILABILITY_TARGET.measured) {
      expect(AVAILABILITY_TARGET.note.toLowerCase()).toContain('do not yet publish')
    }
  })

  it('keeps the questionnaire consistent with the certification list', () => {
    const penTest = CERTIFICATIONS.find((entry) => entry.standard.includes('penetration'))
    const answer = SECURITY_QUESTIONNAIRE.find((entry) =>
      entry.question.toLowerCase().includes('penetration test')
    )
    expect(answer).toBeDefined()
    // If the trust centre says no test has been commissioned, the questionnaire
    // must not imply one has.
    if (penTest?.state === 'not_started') {
      expect(answer!.answer.toLowerCase().startsWith('no')).toBe(true)
    }
  })

  it('keeps the questionnaire consistent on certification status', () => {
    const certified = CERTIFICATIONS.some((entry) => entry.state === 'achieved')
    const answer = SECURITY_QUESTIONNAIRE.find((entry) =>
      entry.question.includes('ISO 27001')
    )
    expect(answer).toBeDefined()
    if (!certified) {
      expect(answer!.answer.toLowerCase().startsWith('no')).toBe(true)
    }
  })

  it('states the residency limitation rather than softening it', () => {
    expect(RESIDENCY_SUMMARY.toLowerCase()).toContain('we do not offer eu or uk data residency')
  })
})

describe('the pack answers what procurement asks', () => {
  it('names a region for every provider that processes data', () => {
    expect(DATA_RESIDENCY.length).toBeGreaterThanOrEqual(SUBPROCESSORS.length)
    for (const entry of DATA_RESIDENCY) {
      expect(entry.region.length).toBeGreaterThan(5)
      expect(entry.note.length).toBeGreaterThan(20)
    }
  })

  it('lists every subprocessor from the trust centre', () => {
    const residencyProviders = new Set(DATA_RESIDENCY.map((entry) => entry.provider))
    for (const subprocessor of SUBPROCESSORS) {
      expect(
        residencyProviders.has(subprocessor.name),
        `${subprocessor.name} is a subprocessor with no stated processing region`
      ).toBe(true)
    }
  })

  it('gives every severity a response and an update target', () => {
    expect(SUPPORT_SEVERITIES.length).toBeGreaterThanOrEqual(3)
    for (const entry of SUPPORT_SEVERITIES) {
      expect(entry.targetResponse).toBeTruthy()
      expect(entry.targetUpdate).toBeTruthy()
      expect(entry.meaning.length).toBeGreaterThan(20)
    }
  })

  it('names a role for every incident responsibility', () => {
    expect(INCIDENT_ROLES.length).toBeGreaterThanOrEqual(3)
    for (const entry of INCIDENT_ROLES) {
      expect(entry.responsibility.length).toBeGreaterThan(30)
    }
  })

  it('gives every incident step a deadline', () => {
    for (const entry of INCIDENT_STEPS) {
      expect(entry.deadline.length, `${entry.step} has no deadline`).toBeGreaterThan(5)
      expect(entry.detail.length).toBeGreaterThan(30)
    }
  })

  it('keeps the 72-hour regulator deadline', () => {
    const notify = INCIDENT_STEPS.find((entry) => entry.step === 'Notify the regulator')
    expect(notify?.deadline).toContain('72 hours')
    expect(notify?.deadline).toContain('Article 33')
  })

  it('ships both notification templates', () => {
    expect(BREACH_NOTIFICATION_TEMPLATE.regulator).toContain('Article 33')
    expect(BREACH_NOTIFICATION_TEMPLATE.user).toContain('security@luciddatabank.com')
  })

  it('states a position on every processing clause', () => {
    const clauses = PROCESSING_TERMS.map((entry) => entry.clause)
    for (const required of [
      'Roles',
      'Subprocessors',
      'Breach notification',
      'International transfers',
      'Deletion and return',
    ]) {
      expect(clauses, `A processing agreement must state ${required}`).toContain(required)
    }
  })

  it('answers what happens to data if the service ends, including the export path', () => {
    const shutdown = CONTINUITY.find((entry) => entry.question.includes('shut'))
    expect(shutdown?.answer.toLowerCase()).toContain('export')
    const escrow = CONTINUITY.find((entry) => entry.question.toLowerCase().includes('escrow'))
    // A buyer must not be left to assume an escrow exists.
    expect(escrow?.answer.toLowerCase().startsWith('no')).toBe(true)
  })
})

describe('published documents stay reachable', () => {
  // A pack nobody can find is not published. This is the link check the spec
  // asks for, run in the same suite as everything else.
  const trustPage = readFileSync(
    join(process.cwd(), 'app', '(marketing)', 'trust', 'page.tsx'),
    'utf8'
  )

  it.each(['/trust/threat-model', '/trust/assurance'])(
    'links %s from the trust centre',
    (href) => {
      expect(trustPage).toContain(`href="${href}"`)
    }
  )
})
