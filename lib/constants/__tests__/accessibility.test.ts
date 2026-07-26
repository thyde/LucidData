import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  ACCESSIBILITY_CONTACT,
  ACCESSIBILITY_STANDARD,
  ACCESSIBILITY_STATEMENT_DATE,
  CONFORMANCE_MEASURES,
  CONFORMANCE_SUMMARY,
  EVALUATION_METHOD,
  KNOWN_LIMITATIONS,
  STATEMENT_METADATA,
} from '@/lib/constants/accessibility'

/**
 * LD-108: the statement is a public claim, so these tests exist to stop it
 * drifting into something more flattering than the code supports.
 */
describe('accessibility statement', () => {
  it('names the standard and the version, not just "accessible"', () => {
    expect(ACCESSIBILITY_STANDARD).toMatch(/WCAG 2\.2/)
    expect(ACCESSIBILITY_STANDARD).toMatch(/AA/)
  })

  it('does not claim full conformance', () => {
    expect(STATEMENT_METADATA.conformanceStatus).toBe('Partially conforming')
    expect(CONFORMANCE_SUMMARY).toMatch(/partially conforms/i)
    expect(CONFORMANCE_SUMMARY).not.toMatch(/fully (conforms|compliant)/i)
  })

  it('does not claim a third-party audit that has not happened', () => {
    expect(STATEMENT_METADATA.preparedBy).toMatch(/self-assessment/i)
    expect(STATEMENT_METADATA.preparedBy).toMatch(/no third-party audit/i)
  })

  it('admits that no manual screen reader testing has been done', () => {
    const screenReader = KNOWN_LIMITATIONS.find((entry) =>
      /screen reader/i.test(entry.area)
    )
    expect(screenReader).toBeDefined()
    expect(screenReader!.detail).toMatch(/NVDA|JAWS|VoiceOver/)
  })

  it('states the coverage limit of automated checking rather than implying full coverage', () => {
    const automated = EVALUATION_METHOD.find((entry) => /automated/i.test(entry.method))
    expect(automated).toBeDefined()
    expect(automated!.covers).toMatch(/third|cannot judge/i)
  })

  it('gives every limitation a criterion and a stated next step', () => {
    expect(KNOWN_LIMITATIONS.length).toBeGreaterThan(0)
    for (const limitation of KNOWN_LIMITATIONS) {
      expect(limitation.area.length).toBeGreaterThan(0)
      expect(limitation.criterion.length).toBeGreaterThan(0)
      expect(limitation.detail.length).toBeGreaterThan(20)
      // "We are aware" with no plan is an excuse, not a limitation.
      expect(limitation.status).toMatch(/planned|open|will not change|third party/i)
    }
  })

  it('publishes a feedback route and an escalation path', () => {
    expect(ACCESSIBILITY_CONTACT).toMatch(/@/)
    expect(STATEMENT_METADATA.feedbackRoute).toContain(ACCESSIBILITY_CONTACT)
    expect(STATEMENT_METADATA.enforcement).toMatch(/enforcement body/i)
  })

  it('is dated, so a reader can tell how stale it is', () => {
    expect(ACCESSIBILITY_STATEMENT_DATE).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(STATEMENT_METADATA.preparedOn).toBe(ACCESSIBILITY_STATEMENT_DATE)
  })

  it('lists measures that are actually implemented', () => {
    expect(CONFORMANCE_MEASURES.length).toBeGreaterThan(0)
    // Each claim below is backed by something in the repository. If one of
    // these is removed, this test is the reminder to change the statement too.
    const joined = CONFORMANCE_MEASURES.join(' ')
    expect(joined).toMatch(/skip link/i)
    expect(joined).toMatch(/level-one heading/i)
    expect(joined).toMatch(/aria-describedby/i)
    expect(joined).toMatch(/colour alone/i)
  })

  /**
   * The measures claim a skip link and a main landmark in every layout. Read
   * the layouts rather than trusting the sentence.
   */
  it('has the skip link and main landmark the statement claims', () => {
    const root = process.cwd()
    const layouts = [
      'app/(dashboard)/layout.tsx',
      'app/(marketing)/layout.tsx',
      'app/(org)/layout.tsx',
    ]
    for (const layout of layouts) {
      const source = readFileSync(join(root, layout), 'utf8')
      expect(source, `${layout} should render the skip link`).toContain('<SkipLink />')
      expect(source, `${layout} should render a main landmark with an id`).toMatch(
        /<main[^>]*id="main"/
      )
    }

    // The auth layout has no header to skip past, but it still needs the
    // landmark so a screen reader user has somewhere to jump to.
    const auth = readFileSync(join(root, 'app/(auth)/layout.tsx'), 'utf8')
    expect(auth).toMatch(/<main[^>]*id="main"/)
  })

  it('keeps the statement reachable from the trust centre and the footer', () => {
    const root = process.cwd()
    const trust = readFileSync(join(root, 'app/(marketing)/trust/page.tsx'), 'utf8')
    expect(trust).toContain('/trust/accessibility')

    const footer = readFileSync(join(root, 'components/marketing/footer.tsx'), 'utf8')
    expect(footer).toContain('/trust/accessibility')
  })
})
