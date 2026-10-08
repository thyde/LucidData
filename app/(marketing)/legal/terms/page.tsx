import type { Metadata } from 'next'
import {
  DocumentLink,
  LegalDocument,
  LegalList,
  LegalSection,
  Mail,
} from '@/components/legal/legal-document'
import { LEGAL_CONTACT, LEGAL_DOCUMENTS } from '@/lib/constants/legal'
import { PAYOUT_THRESHOLD_CENTS, PLATFORM_FEE_BPS } from '@/lib/constants/marketplace-economics'
import { VULNERABILITY_DISCLOSURE } from '@/lib/constants/trust-disclosures'

export const metadata: Metadata = {
  title: 'Terms of Service | LucidData',
  description: LEGAL_DOCUMENTS.terms.summary,
}

const feePercent = PLATFORM_FEE_BPS / 100
const payoutThreshold = `$${(PAYOUT_THRESHOLD_CENTS / 100).toFixed(0)}`

export default function TermsPage() {
  return (
    <LegalDocument id="terms">
      <LegalSection title="Agreeing to these terms">
        <p>
          These terms are an agreement between you and LucidData. You accept them when you create
          an account. If you use LucidData for an organization, that use is also covered by the{' '}
          <DocumentLink href={LEGAL_DOCUMENTS['organization-terms'].path}>
            Organization Terms and Data Processing Agreement
          </DocumentLink>
          . How we handle your information is set out in the{' '}
          <DocumentLink href={LEGAL_DOCUMENTS.privacy.path}>Privacy Policy</DocumentLink> and the{' '}
          <DocumentLink href={LEGAL_DOCUMENTS['health-privacy'].path}>
            Consumer Health Data Privacy Policy
          </DocumentLink>
          .
        </p>
      </LegalSection>

      <LegalSection title="Who can use LucidData">
        <p>
          You must be at least 18 and able to enter into a contract. An account is for one person,
          so do not share yours.
        </p>
      </LegalSection>

      <LegalSection title="Your account and your keys">
        <p>
          Your vault is encrypted with a key made from your password, and we do not hold that key.
          That means we cannot reset it for you. If you forget your password, the recovery code or
          recovery kit you saved is the only way back into your vault. If you lose your password
          and every recovery factor, nobody can open your vault, including us.
        </p>
        <p>
          Keep your password and recovery code private. If you think someone else has used your
          account, change your password and email <Mail address={VULNERABILITY_DISCLOSURE.email} />.
        </p>
      </LegalSection>

      <LegalSection title="Your data">
        <p>
          You own the data you put in LucidData. You give us permission to store it, process it,
          and send it where you direct, only as far as we need to run the service for you. We claim
          no other right to it.
        </p>
        <p>
          You must have the right to store and share the data you add. Do not store someone
          else&apos;s personal information without their permission.
        </p>
      </LegalSection>

      <LegalSection title="Sharing and consent">
        <p>
          When you grant an organization access, you are telling us to make the data the grant
          covers available to it, for the purpose and time you set. You can revoke a grant at any
          time, which stops further access. Revoking cannot recall a copy the organization already
          exported, but our Organization Terms require it to use that copy only for the purpose you
          agreed to.
        </p>
      </LegalSection>

      <LegalSection title="Health information">
        <p>
          LucidData stores and shares records. It does not diagnose, treat, or give medical advice,
          and it is not a medical device. Do not rely on it in an emergency, and talk to a health
          professional about anything a record shows. LucidData is not a health care provider, and
          HIPAA does not cover the records you keep here. The Consumer Health Data Privacy Policy
          explains how we protect them.
        </p>
      </LegalSection>

      <LegalSection title="Credentials">
        <p>
          Organizations issue credentials, and each issuer is responsible for what its credentials
          say. When LucidData shows a credential as verified, it means the issuer&apos;s signature
          checks out and the credential has not been revoked. It does not mean we confirmed the
          facts in it.
        </p>
      </LegalSection>

      <LegalSection title="The marketplace">
        <p>
          Contributing is optional, and we show you what you will be paid before you agree.
          LucidData keeps a {feePercent}% fee from each sale and pays you through Stripe once your
          balance reaches {payoutThreshold}. You need a Stripe account to be paid, and
          Stripe&apos;s terms apply to it. If we see signs of fraud we may hold a payout for review,
          and we will tell you why. Earnings are usually small and are not guaranteed. You are
          responsible for any tax on what you earn.
        </p>
      </LegalSection>

      <LegalSection title="Using LucidData responsibly">
        <p>Do not use LucidData to:</p>
        <LegalList>
          <li>break the law, or help someone else break it;</li>
          <li>get into an account or data that is not yours;</li>
          <li>store or share someone else&apos;s information without their permission;</li>
          <li>harass, stalk, or deceive anyone, including by pretending to be someone else;</li>
          <li>
            interfere with the service, get around its limits or security checks, or upload
            malicious code;
          </li>
          <li>collect data from it by automated means, other than through the APIs we publish.</li>
        </LegalList>
        <p>
          If you find a security problem, report it as the{' '}
          <DocumentLink href="/trust">trust centre</DocumentLink> describes. We welcome
          good-faith research that follows that policy.
        </p>
      </LegalSection>

      <LegalSection title="Fees">
        <p>
          Individual accounts are free. If we introduce paid features, we will show the price
          before you buy anything, and you can choose not to.
        </p>
      </LegalSection>

      <LegalSection title="Changes to the service">
        <p>
          We change LucidData as we improve it, and sometimes that means removing a feature. If a
          change takes away something you rely on to reach your data, we will tell you first and
          keep export working. If we ever shut LucidData down, we will give at least 90 days&apos;
          notice and keep export working for all of that time.
        </p>
      </LegalSection>

      <LegalSection title="Ending your account">
        <p>
          You can delete your account at any time from settings. We may suspend or close an
          account that breaks these terms, or that the law requires us to close. Unless the law or
          an urgent risk to others prevents it, we will tell you first and give you the chance to
          export your data.
        </p>
      </LegalSection>

      <LegalSection title="Disclaimers">
        <p>
          We work to keep LucidData secure and available, but we provide it as it is and as
          available, without any warranty beyond those the law requires. We do not promise that it
          will be uninterrupted or free of errors.
        </p>
      </LegalSection>

      <LegalSection title="Limits on liability">
        <p>
          As far as the law allows, LucidData is not liable for indirect, incidental, or
          consequential losses, or for data you could have recovered with your password or
          recovery code. Our total liability for any claim about LucidData is limited to the
          greater of what you paid us in the 12 months before the claim and $100. Some places do
          not allow these limits, and there they apply only as far as the law permits.
        </p>
      </LegalSection>

      <LegalSection title="If something goes wrong">
        <p>
          If you have a problem with LucidData, email <Mail address={LEGAL_CONTACT} /> first. We
          will try to resolve it with you within 30 days.
        </p>
      </LegalSection>

      <LegalSection title="Changes to these terms">
        <p>
          We may update these terms. For a material change, we will email you and ask you to
          accept the new version before you carry on using your account. If you do not accept it,
          you can export your data and delete your account.
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
