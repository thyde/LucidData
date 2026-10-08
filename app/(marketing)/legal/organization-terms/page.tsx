import type { Metadata } from 'next'
import {
  DocumentLink,
  LegalDocument,
  LegalList,
  LegalSection,
  Mail,
} from '@/components/legal/legal-document'
import { LEGAL_CONTACT, LEGAL_DOCUMENTS } from '@/lib/constants/legal'
import { PROCESSING_TERMS } from '@/lib/constants/assurance'
import { MINIMUM_ORDER_CENTS } from '@/lib/constants/marketplace-economics'

export const metadata: Metadata = {
  title: 'Organization Terms and Data Processing Agreement | LucidData',
  description: LEGAL_DOCUMENTS['organization-terms'].summary,
}

/** Days an organization has to delete data after a grant ends or a deletion request arrives. */
const DELETION_DAYS = 30

const minimumOrder = `$${(MINIMUM_ORDER_CENTS / 100).toFixed(0)}`

export default function OrganizationTermsPage() {
  return (
    <LegalDocument id="organization-terms">
      <LegalSection title="Who these terms are for">
        <p>
          These terms apply when an organization uses LucidData to request consent, issue or
          verify credentials, or buy datasets. The person who accepts them confirms that they may
          accept them for the organization. That person&apos;s own account is also covered by the{' '}
          <DocumentLink href={LEGAL_DOCUMENTS.terms.path}>Terms of Service</DocumentLink>.
        </p>
      </LegalSection>

      <LegalSection title="Setting up">
        <p>
          You must show that you control your organization&apos;s domain before you can create API
          keys or contact anyone. Keep API keys secret, and revoke any key you think is exposed.
          You are responsible for what your members do, and for the roles you give them.
        </p>
      </LegalSection>

      <LegalSection title="Contacting people">
        <p>
          Contact people through LucidData only with consent or credential requests that give your
          real identity and purpose. Ask only for the data your purpose needs. Do not use LucidData
          to send marketing, to phish, or to mislead anyone about who you are.
        </p>
      </LegalSection>

      <LegalSection title="Data you receive">
        <LegalList>
          <li>Use it only for the purpose and time the person granted.</li>
          <li>
            Stop using it when the grant ends, expires, or is revoked, and delete any copy you
            exported within {DELETION_DAYS} days unless the law requires you to keep it.
          </li>
          <li>
            When we pass on a person&apos;s request to delete their data, delete your copy within{' '}
            {DELETION_DAYS} days and confirm to us that you have.
          </li>
          <li>
            Do not sell it, use it for advertising, or try to identify anyone in a dataset that was
            released without identifiers.
          </li>
          <li>
            Protect it at least as well as the data processing agreement below requires us to
            protect your data.
          </li>
        </LegalList>
        <p>
          Never sell health data you receive through LucidData or use it for advertising. LucidData
          does not sign HIPAA business associate agreements, so do not use it to receive protected
          health information as a covered entity or business associate.
        </p>
        <p>
          If you use credentials or data from LucidData to decide on someone&apos;s employment,
          credit, insurance, or housing, you are responsible for meeting the Fair Credit Reporting
          Act and similar laws.
        </p>
      </LegalSection>

      <LegalSection title="Issuing credentials">
        <p>
          You are responsible for the accuracy of every credential you issue. Revoke a credential
          that is wrong or no longer true. We keep your signing keys encrypted with a key on our
          servers and sign only on your instructions. Tell us at once if you think a key is
          compromised so that we can replace it.
        </p>
      </LegalSection>

      <LegalSection title="Buying datasets">
        <LegalList>
          <li>
            A dataset is released only after its privacy checks pass. What you receive has
            identifiers removed and some fields generalized, and the samples shown before you buy
            are invented.
          </li>
          <li>
            Use a dataset only for the purpose you declared, keep it no longer than the retention
            period you set, and delete it when that period ends.
          </li>
          <li>Do not resell or share a dataset, or try to identify anyone in it.</li>
          <li>Orders have a {minimumOrder} minimum, and you see the price before you pay.</li>
        </LegalList>
      </LegalSection>

      <LegalSection title="Plans and payment">
        <p>
          Plans and prices are on the <DocumentLink href="/pricing">pricing page</DocumentLink>.
          Paid plans are billed monthly in advance through Stripe and renew until you cancel.
          Prices do not include taxes. If we change the price of your plan, we will tell you at
          least 30 days before the new price applies.
        </p>
      </LegalSection>

      <LegalSection title="Data processing agreement">
        <p>
          When LucidData processes personal data on your behalf, for example the consent requests
          you send or the credentials you issue, these terms apply:
        </p>
        <dl className="space-y-4">
          {PROCESSING_TERMS.map((term) => (
            <div key={term.clause}>
              <dt className="font-medium">{term.clause}</dt>
              <dd className="mt-1">{term.position}</dd>
            </div>
          ))}
        </dl>
      </LegalSection>

      <LegalSection title="Ending these terms">
        <p>
          You can stop using LucidData at any time. We may suspend or end your access if you break
          these terms, misuse data, or put people at risk, and we will tell you why unless the law
          prevents it. Your duties for data you received continue after these terms end.
        </p>
      </LegalSection>

      <LegalSection title="Liability">
        <p>
          As far as the law allows, neither party is liable to the other for indirect or
          consequential losses, and LucidData&apos;s total liability is limited to the fees you
          paid in the 12 months before the claim. These limits do not apply to your duties for
          personal data you received, or to either party&apos;s fraud or wilful misconduct. You
          will defend LucidData against claims that arise from your misuse of data you received
          through it.
        </p>
      </LegalSection>

      <LegalSection title="Changes to these terms">
        <p>
          We will email your organization&apos;s owners at least 30 days before a material change
          to these terms takes effect.
        </p>
      </LegalSection>

      <LegalSection title="Contact">
        <p>
          Email <Mail address={LEGAL_CONTACT} />.
        </p>
      </LegalSection>
    </LegalDocument>
  )
}
