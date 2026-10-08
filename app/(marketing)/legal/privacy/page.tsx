import type { Metadata } from 'next'
import {
  DocumentLink,
  LegalDocument,
  LegalList,
  LegalSection,
  LegalSubsection,
  Mail,
  listOf,
} from '@/components/legal/legal-document'
import { LEGAL_DOCUMENTS, PRIVACY_CONTACT } from '@/lib/constants/legal'
import { SUBPROCESSORS, VULNERABILITY_DISCLOSURE } from '@/lib/constants/trust-disclosures'
import { RESIDUAL_DISCLOSURES } from '@/lib/constants/deletion-manifest'
import { MARKETPLACE_RESTRICTED_CATEGORIES } from '@/lib/validations/marketplace'
import {
  BACKUP_RETENTION_DAYS,
  CONSENT_REQUEST_RETENTION_DAYS,
  CREDENTIAL_REQUEST_RETENTION_DAYS,
  EXPORT_GRACE_DAYS,
  NOTIFICATION_RETENTION_DAYS,
  SHARE_RETENTION_DAYS,
} from '@/lib/constants/retention'

export const metadata: Metadata = {
  title: 'Privacy Policy | LucidData',
  description: LEGAL_DOCUMENTS.privacy.summary,
}

const BACKUP_DAYS = BACKUP_RETENTION_DAYS

export default function PrivacyPolicyPage() {
  const restricted = listOf(MARKETPLACE_RESTRICTED_CATEGORIES, 'or')

  return (
    <LegalDocument id="privacy">
      <LegalSection title="Who this covers">
        <p>
          LucidData runs the website at luciddatabank.com, the LucidData browser extension, and the
          services behind them. This policy covers you if you visit the site, create an account, or
          use the extension. It explains what we collect, why we collect it, who we share it with,
          and the choices you have.
        </p>
        <p>
          Health and fitness data also has its own policy, the{' '}
          <DocumentLink href={LEGAL_DOCUMENTS['health-privacy'].path}>
            Consumer Health Data Privacy Policy
          </DocumentLink>
          . Where the two differ about health data, that policy applies. Organizations that use
          LucidData agree to the{' '}
          <DocumentLink href={LEGAL_DOCUMENTS['organization-terms'].path}>
            Organization Terms and Data Processing Agreement
          </DocumentLink>
          , which cover the data we handle for them.
        </p>
      </LegalSection>

      <LegalSection title="What we cannot see">
        <p>
          Your vault entries are encrypted in your browser before they reach us, with a key made
          from your password on your own device. We store the encrypted version and never hold the
          key, so we cannot read what an entry contains. Nor can anyone who gets into our database.
        </p>
        <p>
          Some details about each entry stay readable so that your vault can list, filter, and
          sync entries. They are listed below and on the{' '}
          <DocumentLink href="/trust">trust centre</DocumentLink>.
        </p>
      </LegalSection>

      <LegalSection title="What we collect">
        <LegalSubsection title="Account details">
          <p>
            Your email address, when you created your account, and whether you confirmed the
            address. Your password goes to our sign-in provider, which stores only a hash of it.
            Our own servers never receive your password.
          </p>
        </LegalSubsection>
        <LegalSubsection title="Security details">
          <p>
            The salt your browser uses to turn your password into a key, copies of that key locked
            with your recovery code or recovery kit, the public half of any passkey you register,
            and hashes of your backup codes. None of these lets us open your vault. If you set up an
            authenticator app, our sign-in provider holds the secret it needs to check your codes.
          </p>
        </LegalSubsection>
        <LegalSubsection title="Your vault">
          <p>
            The encrypted contents of each entry, which we cannot read. These details are readable:
            the label, description, category, tags, and type you give an entry, an expiry date if
            it has one, and when you created and last changed it. For an imported entry we can also
            see which service it came from, that service&apos;s ID for the record, and when the
            service recorded it.
          </p>
        </LegalSubsection>
        <LegalSubsection title="Connected services">
          <p>
            If you connect a service such as Strava, we keep the access tokens it gives us,
            encrypted with a key held on our servers, so we can fetch new records while you are
            away. Each record fetched that way is sealed to a key that only your browser can open
            before we store it, and you open it the next time you unlock your vault.
          </p>
        </LegalSubsection>
        <LegalSubsection title="Sharing and consent records">
          <p>
            The organizations you grant access to, what each grant covers, its purpose, and how
            long it lasts. The requests organizations send you and your answers. Share links you
            create for a credential, and how many times each was opened.
          </p>
        </LegalSubsection>
        <LegalSubsection title="Credentials">
          <p>
            Credentials that organizations issue to you, including the claims in them. We can read
            those claims, because anyone you show a credential to has to be able to check it.
          </p>
        </LegalSubsection>
        <LegalSubsection title="Marketplace">
          <p>
            If you choose to contribute to a buyer&apos;s request, the fields you picked after your
            browser removes identifiers from them, the requests you joined, and what you earned.
            Stripe holds your payout account. We keep the account ID Stripe gives us and a record
            of each payment.
          </p>
        </LegalSubsection>
        <LegalSubsection title="Activity">
          <p>
            An audit log of actions on your account, such as adding an entry, granting access, or
            changing your password. Each record is linked to the one before it, so a change to the
            log can be detected. When you sign in, our sign-in provider records the IP address and
            browser for that session, which is how settings can show where you are signed in.
          </p>
        </LegalSubsection>
        <LegalSubsection title="Other records">
          <p>
            Notifications we send you. Which version of our terms and policies you accepted, and
            when. Your consent to store health data, if you gave it. Whether you signed up from a
            credential check or the browser extension. Any request you send us about your data.
          </p>
        </LegalSubsection>
      </LegalSection>

      <LegalSection title="What we collect when you visit the site">
        <p>
          We count visits to public pages, such as the home page and this policy, without cookies.
          Before a count is sent, the address is cut down to its path. Pages inside your account,
          share links, and invitations are never counted. Vercel, which hosts the site, processes
          these counts.
        </p>
        <p>
          When you sign up, sign in, or confirm your password, Cloudflare Turnstile checks that
          you are not an automated program. Cloudflare sees your IP address and some details about
          your browser during the check.
        </p>
        <p>
          Our servers keep short error logs, with email addresses, tokens, and query strings
          removed before anything is written. To stop abuse, we count requests to some public
          pages by IP address for up to an hour, then delete the count.
        </p>
      </LegalSection>

      <LegalSection title="Cookies and storage on your device">
        <p>
          We set cookies only to keep you signed in. We do not use advertising cookies or tracking
          pixels. Your browser also stores how long you want the vault to stay unlocked, and a copy
          of the site&apos;s own files so pages load quickly. Your vault key stays in memory and is
          cleared when the vault locks.
        </p>
      </LegalSection>

      <LegalSection title="The browser extension">
        <p>
          The extension works on your device. It notices when a data export you requested from a
          service finishes downloading, and offers to hand the file to your vault, where your
          browser encrypts it. If you turn on tracker insight, it counts which companies collect
          data on the sites you visit and keeps that count on your device. It leaves out health,
          finance, legal, adult, and support sites.
        </p>
        <p>
          The extension sends nothing to us. If you save a tracker summary to your vault, it is
          encrypted like any other entry.
        </p>
      </LegalSection>

      <LegalSection title="How we use information">
        <LegalList>
          <li>
            To run LucidData: storing and syncing your vault, carrying out the sharing you choose,
            issuing and checking credentials, and paying you if you contribute to a buyer&apos;s
            request.
          </li>
          <li>
            To keep accounts safe: spotting abuse, enforcing limits, and telling you about new
            sign-ins and security changes.
          </li>
          <li>
            To email you about your account, such as confirming your address and sending security
            notices. You can turn off email copies of other notifications in settings.
          </li>
          <li>
            To learn whether LucidData is useful. We count things like how many people connected a
            source each week and keep only the totals.
          </li>
          <li>To meet our legal obligations.</li>
        </LegalList>
        <p>
          We do not sell your personal information to data brokers or advertisers, and we do not
          use it for advertising. LucidData does not use your data to train AI models.
        </p>
      </LegalSection>

      <LegalSection title="The marketplace">
        <p>
          Contributing is optional, and you decide each time. If you contribute fields to a
          buyer&apos;s request, the buyer pays for a dataset that includes them. Your browser
          removes direct identifiers before anything leaves it. The dataset is released only in
          groups large enough that no record can be singled out by the details left in it, and we
          show you what you will be paid before you agree. You can never contribute {restricted}{' '}
          data.
        </p>
        <p>
          If your browser sends a Global Privacy Control signal, we stop accepting marketplace
          contributions from your account until you choose otherwise in settings.
        </p>
      </LegalSection>

      <LegalSection title="Who we share information with">
        <LegalList>
          <li>
            Organizations you choose. When you grant access, the organization can see what the
            grant covers, for the purpose and time you set. When you share a credential link,
            anyone with the link can see the claims you chose to show. Revoking a grant stops
            future access but cannot recall a copy the organization already exported.
          </li>
          <li>Buyers, only through the marketplace, as described above.</li>
          <li>
            Service providers that run parts of LucidData for us, under contracts that limit what
            they may do with the data: {listOf(SUBPROCESSORS.map((processor) => processor.name))}.
            The <DocumentLink href="/trust">trust centre</DocumentLink> lists what each one
            handles.
          </li>
          <li>
            Authorities, when the law requires it. We can only hand over what we can read, and we
            cannot read your vault entries. We will tell you about a request unless the law forbids
            us to.
          </li>
          <li>
            A new owner, if LucidData is sold or merged. The new owner must keep honouring this
            policy for the data collected under it, and we will tell you before the transfer.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection title="How long we keep information">
        <p>We keep your account and vault until you delete them. Some records go sooner:</p>
        <LegalList>
          <li>
            Requests from organizations, {CONSENT_REQUEST_RETENTION_DAYS} days after they are
            answered or expire ({CREDENTIAL_REQUEST_RETENTION_DAYS} days for credential requests).
          </li>
          <li>Share links, {SHARE_RETENTION_DAYS} days after they expire or you revoke them.</li>
          <li>Notifications, {NOTIFICATION_RETENTION_DAYS} days after we send them.</li>
          <li>
            Records in a dataset a buyer bought, {EXPORT_GRACE_DAYS}{' '}
            {EXPORT_GRACE_DAYS === 1 ? 'day' : 'days'} after the buyer&apos;s download window
            closes.
          </li>
        </LegalList>
        <p>
          When you delete your account, we delete your vault, your grants, your credentials, and
          the rest of your account at once, and give you a signed receipt. Our daily database
          backups are kept for {BACKUP_DAYS} days, so deleted data is gone from them within{' '}
          {BACKUP_DAYS} days. A few things remain after deletion:
        </p>
        <LegalList>
          {RESIDUAL_DISCLOSURES.map((residual) => (
            <li key={residual.what}>
              {residual.holder}: {residual.what}. {residual.why}
            </li>
          ))}
        </LegalList>
      </LegalSection>

      <LegalSection title="Your rights and choices">
        <LegalList>
          <li>
            See and download your data. Export your vault from settings at any time. Your browser
            decrypts it, so the file is readable. You can also ask us for a copy of everything else
            we hold about you.
          </li>
          <li>Correct it. Edit your entries yourself, or ask us to correct your account details.</li>
          <li>Delete it. Delete entries one at a time, or delete your account from settings.</li>
          <li>
            Withdraw consent. Revoke a grant, withdraw your consent to store health data, or stop
            contributing to the marketplace, whenever you like.
          </li>
          <li>Appeal. If we turn down a request, you can ask us to look at it again.</li>
        </LegalList>
        <p>
          Make a request from the privacy page in your account, or email{' '}
          <Mail address={PRIVACY_CONTACT} /> from the address on your account. Requests are free.
          We answer within 45 days, or within 30 days for a Nevada request to delete health data.
          If a request is complex, we may extend that once by up to 45 more days and will tell you
          why. Requests from the European Union and the United Kingdom are answered within one
          month.
        </p>
        <p>
          We decide appeals within 45 days and explain the decision in writing. If we deny your
          appeal, you can complain to your state attorney general, for example in Washington
          (atg.wa.gov), Nevada (ag.nv.gov), Connecticut (portal.ct.gov/ag), or California
          (oag.ca.gov). We will not treat you differently for using any of these rights.
        </p>
      </LegalSection>

      <LegalSection title="Security">
        <p>
          Vault entries are encrypted in your browser with AES-256-GCM under a key made from your
          password. Every table limits each account to its own rows, the audit log shows if it has
          been changed, and you can add an authenticator app or a passkey to your sign-in. No
          system is perfectly secure. If a breach affects you, we will tell you, as our incident
          process describes. The <DocumentLink href="/trust">trust centre</DocumentLink> explains
          the design and its limits, and you can report a problem to{' '}
          <Mail address={VULNERABILITY_DISCLOSURE.email} />.
        </p>
      </LegalSection>

      <LegalSection title="Children">
        <p>
          LucidData is for adults. You must be 18 or older to create an account. We do not
          knowingly collect information from children under 13, and we delete it if we learn that
          we have.
        </p>
      </LegalSection>

      <LegalSection title="Do Not Track and Global Privacy Control">
        <p>
          We do not track you across other sites, and we do not let others track you on ours, so a
          Do Not Track signal does not change how the site behaves. We do act on Global Privacy
          Control, as the marketplace section describes.
        </p>
      </LegalSection>

      <LegalSection title="Where information is processed">
        <p>
          In the United States. If you use LucidData from another country, your information is
          transferred to and stored in the United States.
        </p>
      </LegalSection>

      <LegalSection title="Changes to this policy">
        <p>
          When we change this policy, we update the date at the top. If a change is material, such
          as collecting a new kind of information or using it for a new purpose, we email you and
          ask you to accept the new version before you carry on using your account. Earlier
          versions are available on request.
        </p>
      </LegalSection>

      <LegalSection title="Contact">
        <p>
          Email <Mail address={PRIVACY_CONTACT} /> with any question about this policy or your
          data.
        </p>
      </LegalSection>
    </LegalDocument>
  )
}
