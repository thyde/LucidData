import type { Metadata } from 'next'
import {
  DocumentLink,
  LegalDocument,
  LegalList,
  LegalSection,
  Mail,
} from '@/components/legal/legal-document'
import { LEGAL_DOCUMENTS, PRIVACY_CONTACT } from '@/lib/constants/legal'
import { BACKUP_RETENTION_DAYS } from '@/lib/constants/retention'

export const metadata: Metadata = {
  title: 'Consumer Health Data Privacy Policy | LucidData',
  description: LEGAL_DOCUMENTS['health-privacy'].summary,
}

/** What we collect and why, the two things RCW 19.373.020(1)(a)(i) asks for together. */
const COLLECTED: { what: string; why: string }[] = [
  {
    what: 'Health and fitness records you add, import, or bring in from a connected service. Your browser encrypts them, so we cannot read them.',
    why: 'To keep them for you, sync new records from services you connect, and share them where you tell us to.',
  },
  {
    what: 'Details about those records that we can read: category, type, label, description, tags, the service a record came from and its ID there, and when it was recorded, added, and changed.',
    why: 'To list, filter, and sync your records, avoid importing the same record twice, and show where each one came from.',
  },
  {
    what: 'Access tokens for the services you connect, encrypted with a key held on our servers.',
    why: 'To fetch new records while you are away.',
  },
  {
    what: 'Records of who you shared health data with, for what purpose, and until when. For a summary you share by link, the figures and dates it covers, the label you give it, and how many times it was opened. The summary itself is encrypted on your device, so we cannot read it.',
    why: 'To enforce your choices, show you what you shared, and open a summary for whoever holds its link.',
  },
  {
    what: 'Your consent to this policy, and any withdrawal of it.',
    why: 'To show that we asked before collecting anything.',
  },
  {
    what: 'Weekly totals across all accounts, such as how many people connected a fitness service.',
    why: 'To learn whether LucidData is useful. No total describes one person.',
  },
]

export default function HealthPrivacyPolicyPage() {
  return (
    <LegalDocument id="health-privacy">
      <LegalSection title="Who this policy is for">
        <p>
          This policy explains how LucidData handles consumer health data. It is written to meet
          the Washington My Health My Data Act, Nevada&apos;s consumer health data law, and
          Connecticut&apos;s consumer health data provisions, and we apply it to everyone wherever
          they live. It adds to our{' '}
          <DocumentLink href={LEGAL_DOCUMENTS.privacy.path}>Privacy Policy</DocumentLink>, and
          takes priority over it for health data.
        </p>
      </LegalSection>

      <LegalSection title="What we mean by health data">
        <p>
          Information that identifies your past, present, or future physical or mental health. In
          LucidData that includes workouts, steps, heart rate, sleep, weight, and medical records
          you add or import, any entry you file in the Health category, and details that show you
          keep such records, such as an entry&apos;s type or the fitness service you connected.
        </p>
      </LegalSection>

      <LegalSection title="Health data we collect, and why">
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <caption className="sr-only">Health data we collect and the purpose of each</caption>
            <thead className="bg-muted/50">
              <tr>
                <th scope="col" className="px-4 py-3 text-left font-medium">
                  What we collect
                </th>
                <th scope="col" className="px-4 py-3 text-left font-medium">
                  Why
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {COLLECTED.map((row) => (
                <tr key={row.what} className="align-top">
                  <td className="px-4 py-3">{row.what}</td>
                  <td className="px-4 py-3">{row.why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </LegalSection>

      <LegalSection title="Where it comes from">
        <LegalList>
          <li>From you, when you add records or import files such as an Apple Health export.</li>
          <li>From services you connect.</li>
          <li>From the LucidData browser extension, when you ask it to hand over an export you downloaded.</li>
          <li>From organizations that issue you a credential containing health information.</li>
        </LegalList>
      </LegalSection>

      <LegalSection title="Who we share it with">
        <p>We share health data only in these ways:</p>
        <LegalList>
          <li>
            With organizations you choose. Each grant is your consent to share the data it covers
            with that organization, for the purpose and time you set.
          </li>
          <li>
            With anyone you send a summary link to. You choose the figures, the dates, and how long
            the link works, up to 30 days. Your browser encrypts the summary with a key that stays in
            the link, so we store it without being able to read it. Anyone holding the link can open
            it until it expires or you revoke it, and can keep what they saw.
          </li>
          <li>
            With service providers that process it for us under contract. Supabase stores your
            encrypted records and the readable details listed above. Vercel hosts the service.
            Resend sends our email, which can name an organization that asked for access and the
            purpose it gave.
          </li>
          <li>
            With authorities, when the law requires it. We can only disclose what we can read, and
            your records themselves are encrypted.
          </li>
        </LegalList>
        <p>
          No affiliate receives health data. We never sell health data, it can never be
          contributed to the marketplace, and we do not use it for advertising.
        </p>
      </LegalSection>

      <LegalSection title="Your consent">
        <p>
          We ask for your consent before we store any health data, separately from our terms. You
          can give it when you sign up, the first time you add health data, or in settings.
          Connecting a fitness service needs it too, and sharing health data with an organization
          always needs a grant from you.
        </p>
        <p>
          You can withdraw consent at any time in settings. From then on we refuse new or changed
          health data and disconnect every connected service. Health entries already in your vault
          stay until you delete them, and you can still see and export them.
        </p>
      </LegalSection>

      <LegalSection title="Your rights">
        <LegalList>
          <li>
            Confirm and access. Find out whether we collect or share your health data, see it, and
            get a list of the organizations you shared it with. Your vault, your grants, and your
            audit log show most of this in your account, and you can ask us for the rest.
          </li>
          <li>
            Delete. Delete health entries one at a time, or delete your account. Deletion takes
            effect in our database at once and reaches our backups within {BACKUP_RETENTION_DAYS}{' '}
            days. When you ask us to delete health data, we also tell each organization you shared
            it with through LucidData, and our Organization Terms require it to delete its copy.
          </li>
          <li>Withdraw consent, as described above.</li>
        </LegalList>
        <p>
          To make a request, use the privacy page in your account or email{' '}
          <Mail address={PRIVACY_CONTACT} /> from the address on your account. Requests are free.
          We answer within 45 days, or within 30 days for a Nevada request to delete health data.
          If a request is complex, we may extend that once by up to 45 days and will tell you why.
          We will not treat you differently for using these rights.
        </p>
        <p>
          If we turn down your request, you can appeal by replying to our answer or from the
          privacy page. We decide appeals within 45 days and explain the decision in writing. If we
          deny an appeal, you can complain to your state attorney general: Washington (atg.wa.gov),
          Nevada (ag.nv.gov), or Connecticut (portal.ct.gov/ag).
        </p>
      </LegalSection>

      <LegalSection title="Security and access">
        <p>
          Your records are encrypted in your browser, and we cannot open them. Within LucidData,
          only the people who run the service can reach the readable details, and only when they
          need to keep it working. Every table limits each account to its own rows.
        </p>
      </LegalSection>

      <LegalSection title="Location">
        <p>
          LucidData does not collect your precise location. We do not set up geofences around
          places that provide health care, or anywhere else.
        </p>
      </LegalSection>

      <LegalSection title="Changes to this policy">
        <p>
          If we want to collect a new kind of health data or use it for a new purpose, we will
          update this policy and ask for your consent again before we do.
        </p>
      </LegalSection>

      <LegalSection title="Contact">
        <p>
          Email <Mail address={PRIVACY_CONTACT} /> with any question about your health data.
        </p>
      </LegalSection>
    </LegalDocument>
  )
}
