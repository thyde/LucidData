/**
 * LD-108 accessibility conformance statement.
 *
 * Published rather than claimed. A blanket "WCAG 2.2 AA compliant" badge is
 * worth nothing to a procurement reviewer and less to someone who actually
 * needs the product to work, so this states the standard, what was tested,
 * what was not, and every limitation known at the time of writing.
 *
 * The tests in this repository read these constants, so a claim here that is
 * not backed by a check fails the build rather than quietly ageing.
 */

export const ACCESSIBILITY_STANDARD = 'WCAG 2.2 Level AA'

export const ACCESSIBILITY_STATEMENT_DATE = '2026-07-26'

export const CONFORMANCE_SUMMARY =
  'LucidData partially conforms to WCAG 2.2 Level AA. Partially conforming means most of the product meets the standard, and the parts that do not are listed below by name.'

export const ACCESSIBILITY_CONTACT = 'accessibility@luciddata.example'

/**
 * How the claim was arrived at. Naming the method matters, because an
 * automated scan catches roughly a third of the standard and saying otherwise
 * would overstate what has been checked.
 */
export const EVALUATION_METHOD = [
  {
    method: 'Automated checks in continuous integration',
    detail:
      'axe-core runs against the sign-in, registration, vault, consent, audit, credentials, and marketplace surfaces on every pull request. Serious and critical violations fail the build.',
    covers: 'Roughly a third of the success criteria. Automated tools cannot judge meaning.',
  },
  {
    method: 'Keyboard-only traversal',
    detail:
      'The end-to-end suite drives sign-in, unlock, and the consent path using the keyboard alone, and asserts that focus reaches every control and that dialogs close with Escape.',
    covers: 'Operability without a pointing device, focus order, and focus visibility.',
  },
  {
    method: 'Structural assertions',
    detail:
      'Tests assert a single page heading, a named main landmark, a named primary navigation, and a skip link on each layout.',
    covers: 'Bypass blocks, page titles, headings and labels, and info and relationships.',
  },
] as const

/**
 * Known limitations. Each one names the surface, the criterion, and what is
 * being done. "We are aware" without a plan is not a limitation, it is an
 * excuse.
 */
export const KNOWN_LIMITATIONS = [
  {
    area: 'Screen reader testing',
    criterion: 'Full manual evaluation',
    detail:
      'No manual testing has been performed with NVDA, JAWS, or VoiceOver. The claim above rests on automated checks, keyboard traversal, and structural assertions only.',
    status: 'Planned. Until it is done, treat the conformance claim as unverified by assistive technology.',
  },
  {
    area: 'Charts on the dashboard and marketplace',
    criterion: '1.1.1 Non-text content',
    detail:
      'Recharts renders SVG that is not exposed as a text alternative. The underlying numbers appear elsewhere on the same page, but the chart itself conveys nothing to a screen reader.',
    status: 'Open. A table equivalent adjacent to each chart is the intended fix.',
  },
  {
    area: 'Vault data display for custom schemas',
    criterion: '1.3.1 Info and relationships',
    detail:
      'A custom-schema entry renders as formatted JSON in a preformatted block. Structure is conveyed by indentation, which is visual.',
    status: 'Open. Built-in schemas render as labelled definition lists and are unaffected.',
  },
  {
    area: 'Session timeout',
    criterion: '2.2.1 Timing adjustable',
    detail:
      'The vault key is held in memory and is discarded on reload for security reasons. There is no warning before that happens and the timing cannot be extended.',
    status:
      'Will not change. The custody model requires it. The behaviour is explained on the unlock screen rather than hidden.',
  },
  {
    area: 'Third-party checkout',
    criterion: 'All criteria',
    detail:
      'Payment is handled by Stripe Checkout on Stripe infrastructure. Its accessibility is outside our control and is not covered by this statement.',
    status: 'Third party. Stripe publishes its own accessibility documentation.',
  },
] as const

/**
 * What has been fixed, so the statement reads as a record rather than a wish.
 */
export const CONFORMANCE_MEASURES = [
  'Every layout renders a named main landmark and a skip link that reaches it in one keystroke.',
  'Every page has exactly one level-one heading, including the locked vault state.',
  'Form errors are linked to their control with aria-describedby and marked with aria-invalid, and standalone errors are announced through a live region.',
  'Status is never carried by colour alone. Consent, credential, order, and audit states all render their state as text beside the colour.',
  'Icon-only controls carry a programmatic name.',
  'The notification panel closes with Escape, and its dismiss backdrop is hidden from assistive technology.',
] as const

/**
 * The formal accessibility statement fields procurement asks for, in the order
 * the EN 301 549 model statement uses.
 */
export const STATEMENT_METADATA = {
  scope: 'The LucidData web application at every route, and the public marketing and trust pages.',
  conformanceStatus: 'Partially conforming',
  preparedOn: ACCESSIBILITY_STATEMENT_DATE,
  preparedBy: 'Self-assessment, using automated and keyboard evaluation. No third-party audit has been commissioned.',
  feedbackRoute: `Email ${ACCESSIBILITY_CONTACT}. We aim to respond within five working days.`,
  enforcement:
    'If a response is unsatisfactory, a complaint can be raised with the national enforcement body for the relevant jurisdiction.',
} as const
