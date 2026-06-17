// Static Learning Center content (articles + FAQ). No DB; edit here to update.

export interface LearnArticle {
  slug: string
  title: string
  summary: string
  body: string[]
}

export interface FaqItem {
  question: string
  answer: string
}

export const LEARN_ARTICLES: LearnArticle[] = [
  {
    slug: 'data-monetization-basics',
    title: 'Data monetization basics',
    summary: 'How your data becomes an asset you can earn from, without giving up ownership.',
    body: [
      'For years, companies have collected and sold your personal data while you saw none of the value. LucidData flips that model: your data stays yours, encrypted and under your control.',
      'When you opt a field into a data pool, only that field, stripped of identifiers, is shared, and only with buyers you allow. You earn each time your contribution is purchased.',
      'You can withdraw a contribution at any time. Nothing is shared that you did not explicitly approve.',
    ],
  },
  {
    slug: 'data-ownership',
    title: 'Owning your data',
    summary: 'What it means to treat your data as property, not product.',
    body: [
      'Your vault is encrypted in your browser before anything reaches our servers. We store only ciphertext, so we can never read or sell what you have not approved.',
      'Every access (a consent grant, a contribution, a purchase) is recorded in a tamper-evident audit log that you can verify.',
      'Ownership means control: grant access for a fixed window, revoke it whenever you want, and take your data with you in open formats.',
    ],
  },
  {
    slug: 'getting-the-most-out-of-luciddata',
    title: 'Getting the most out of LucidData',
    summary: 'Practical steps to raise your data score and your earnings.',
    body: [
      'Add data across categories (personal, health, financial, and more) to raise your profile completeness and data score.',
      'Review the marketplace for open data pools that match what you are willing to share, then opt the relevant fields in.',
      'Set your sale preferences so only the buyers and purposes you approve can ever reach you.',
    ],
  },
]

export const LEARN_FAQ: FaqItem[] = [
  {
    question: 'Who is my data being sold to?',
    answer:
      'Only to buyers whose data pools you opt into. You can block specific organizations and limit purposes in your sale preferences.',
  },
  {
    question: 'How does LucidData secure my data?',
    answer:
      'Your vault data is encrypted in your browser with a key derived from your password. We store only ciphertext and never see your key or plaintext.',
  },
  {
    question: 'How is my data made anonymous?',
    answer:
      'When you contribute, only the fields you approve are shared, with direct identifiers removed in your browser before anything leaves your device.',
  },
  {
    question: 'How do I control what is shared?',
    answer:
      'Each vault field has a sell toggle. Opt fields in or out at any time, and withdraw any contribution you have made.',
  },
]

export function getArticle(slug: string): LearnArticle | undefined {
  return LEARN_ARTICLES.find((a) => a.slug === slug)
}
