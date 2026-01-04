# 🧠 Lucid — Personal Data Bank

**Version:** 0.1 (MVP Phase)
**Author:** Terron Hyde
**License:** MIT (open-source)
**Status:** In Development

---

## 🌐 Overview

**Lucid** is a privacy-first **personal data bank** — a secure vault where individuals can store, manage, and license access to their personal data under explicit consent.

Lucid treats data as **property**, not a **product**.

> Individuals can securely store and license access to their digital data — without ever surrendering ownership.

### Core Philosophy

- **User Sovereignty**: Users remain the sole custodians of their data
- **Transparency by Default**: Every access and transaction is recorded and auditable
- **Portability through Open Standards**: Data conforms to universal formats for interoperability

---

## 🎯 Project Vision

### The Problem
The global digital economy runs on personal data — yet individuals who generate it have neither control nor compensation. Current data practices are opaque and exploitative.

### The Solution
Lucid enables a fundamental shift: transforming personal data from a harvested resource into a **governed, portable, and monetizable asset class** under full user control.

### Target Ecosystem

**Data Owners (Individuals)**
- Privacy advocates seeking transparency
- Professionals needing verifiable credential storage
- Anyone wanting control over their digital identity

**Data Consumers (Organizations)**
- Research institutions requiring consented participant data
- Healthcare providers needing compliant medical records
- Financial institutions demanding verified data
- Employers validating credentials

---

## 🎯 MVP Goals

The MVP aims to prove one foundational truth: **personal data can be licensed securely and transparently without surrendering ownership.**

### Must Have Features

✅ **Encrypted Personal Data Vault**
Secure storage with AES-256 encryption, user-controlled keys

✅ **Consent-Based Access Control**
Granular permissions defining who can access what data, for how long

✅ **Immutable Audit Ledger**
Hash-chained transparency log of all data access events

✅ **Data Portability**
Export to open standards (JSON-LD, Verifiable Credentials)

✅ **Intuitive User Experience**
Banking metaphor: "Your data. Your bank. Your rules."

### Deferred to Beta

- Payment integration (Stripe Connect)
- Multiple data schemas (FHIR, Open Banking APIs)
- Advanced Verifiable Credentials
- Mobile applications
- Buyer marketplace

---

## 🧩 Technology Stack

After careful evaluation of TypeScript vs Go, **TypeScript** was chosen for optimal learning path, UX iteration speed, and ecosystem alignment.

### Frontend
- **Framework**: [Next.js 14+](https://nextjs.org/) (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Components**: shadcn/ui (Radix UI primitives)
- **Forms**: React Hook Form + Zod validation
- **State**: TanStack Query

### Backend
- **Runtime**: Node.js 20+ LTS
- **Framework**: Next.js API Routes (may extract to Fastify later)
- **Language**: TypeScript
- **Validation**: Zod
- **Logging**: Winston

### Database & Auth
- **Database**: PostgreSQL 15+ with pgcrypto
- **Platform**: [Supabase](https://supabase.io/) (managed PostgreSQL + Auth + Storage)
- **ORM**: Prisma (type-safe database access)
- **Auth**: Supabase Auth (OAuth 2.0 + email/password)

### Infrastructure
- **Hosting**: Vercel (frontend) + Supabase (backend/database)
- **CI/CD**: GitHub Actions
- **Monitoring**: OpenTelemetry

### Security & Encryption
- **Encryption**: Web Crypto API (browser) + Node.js crypto (server)
- **Hashing**: argon2 (passwords)
- **Headers**: helmet
- **Rate Limiting**: rate-limiter-flexible

### Standards & Compliance
- **Data Format**: JSON-LD
- **Identity**: W3C Decentralized Identifiers (DID) - Phase 3
- **Credentials**: W3C Verifiable Credentials - Phase 3
- **Audit**: Hash-chained event logs
- **Compliance**: GDPR, CCPA by design

---

## 📅 Development Roadmap

### Phase 0: Foundation Learning (2-3 weeks)
**Goal**: Build TypeScript fundamentals

- Week 1: TypeScript basics, types, interfaces, generics
- Week 2: React/Next.js foundations, App Router, Server Components
- Week 3: Supabase setup, authentication, database queries

**Deliverable**: Working knowledge of full-stack TypeScript

### Phase 1: Core Vault Foundation (4-6 weeks)
**Goal**: Build secure, encrypted data storage with excellent UX

- Authentication & user onboarding (Supabase Auth)
- Encrypted vault CRUD operations
- Data visualization components
- Responsive design & error handling
- First user testing sessions

**Deliverable**: Secure vault where users can store & manage encrypted personal data

### Phase 2: Consent & Transparency (4-6 weeks)
**Goal**: Build intuitive consent management and audit visibility

- Consent granting interface
- Permission management dashboard
- Hash-chained audit log implementation
- Audit history viewer with transparency dashboard
- User testing & refinement

**Deliverable**: Clear, understandable consent system that users trust

### Phase 3: Data Portability & Standards (3-4 weeks)
**Goal**: Enable interoperability and data export

- JSON-LD export functionality
- Verifiable Credentials support
- Export format selector UI
- Developer API documentation

**Deliverable**: Users can export data in standard formats

### Phase 4: Pilot Exchange (Optional)
**Goal**: Enable licensed data access for pilot buyers

- Buyer API endpoints
- Simple buyer dashboard
- Revenue tracking (sandbox mode)
- End-to-end transaction testing

**Total Timeline**: 15-20 weeks (3.5-5 months) for comprehensive learning + functional MVP

---

## ⚙️ Local Setup

### Prerequisites
- Node.js 20+ LTS
- npm or pnpm
- Git
- VSCode (recommended)

### Getting Started

```bash
# 1. Clone the repository
git clone https://github.com/terronhyde/lucid-mvp.git
cd lucid-mvp

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env.local
# Edit .env.local with your Supabase credentials

# 4. Initialize database
npx prisma migrate dev

# 5. Start development server
npm run dev

# 6. Run tests
npm test
```

### Environment Variables

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Database
DATABASE_URL=your-database-url

# Encryption
ENCRYPTION_KEY=your-encryption-key
```

---

## 🏗️ Project Structure

```
lucid-mvp/
├── app/                    # Next.js App Router
│   ├── (auth)/            # Authentication routes
│   ├── (dashboard)/       # Protected dashboard routes
│   ├── api/               # API routes
│   └── layout.tsx         # Root layout
├── components/            # React components
│   ├── ui/               # shadcn/ui components
│   ├── vault/            # Vault-specific components
│   └── consent/          # Consent management components
├── lib/                   # Utilities & configurations
│   ├── db/               # Database utilities
│   ├── crypto/           # Encryption utilities
│   ├── auth/             # Authentication helpers
│   └── supabase/         # Supabase client
├── prisma/               # Database schema & migrations
├── public/               # Static assets
└── types/                # TypeScript type definitions
```

---

## 🔒 Security

### Encryption Strategy
- **At Rest**: AES-256 encryption via pgcrypto (PostgreSQL)
- **In Transit**: TLS 1.3
- **Key Management**: User-derived keys with optional recovery
- **Field-level**: Sensitive data encrypted before storage

### Privacy by Design
- Opt-in sharing only (no data collection without consent)
- Consent and audit systems integrated into core architecture
- Privacy protection coexists with functionality
- Right to portability and deletion built-in

### Compliance
- **GDPR**: Right to access, portability, erasure
- **CCPA**: "Do Not Sell" mechanisms, data transparency
- **HIPAA**: Encrypted medical data storage (Phase 3)

---

## 📊 Success Metrics

### Technical (MVP)
- [ ] Functional encrypted vault with AES-256
- [ ] Consent-based access working end-to-end
- [ ] Immutable audit log with hash chain
- [ ] JSON-LD export functioning
- [ ] Zero critical security vulnerabilities

### User (MVP)
- [ ] 50+ users onboarded
- [ ] 80%+ trust rating in feedback surveys
- [ ] 2+ weeks average retention
- [ ] Positive qualitative feedback on UX clarity

### Business (MVP)
- [ ] 2+ buyer pilot commitments
- [ ] Legal review completed (GDPR/CCPA compatibility)
- [ ] 1 repeatable revenue model identified
- [ ] Grant or partnership opportunity in progress

---

## 🤝 Contributing

Lucid is currently in early development. Contributions will be welcomed once the core MVP is stable.

### Interested in Contributing?
- Review the [implementation plan](https://github.com/terronhyde/lucid-mvp/blob/main/PLAN.md)
- Check [open issues](https://github.com/terronhyde/lucid-mvp/issues)
- Join discussions about privacy-first data infrastructure

---

## 📚 Learning Resources

### For Developers
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Next.js Documentation](https://nextjs.org/docs)
- [Supabase Guides](https://supabase.com/docs)
- [Prisma Documentation](https://www.prisma.io/docs)

### For Understanding Lucid's Vision
- [Strategy Document](./LucidStrategy.pdf)
- [MyData.org](https://mydata.org/) - Global data rights movement
- [W3C Verifiable Credentials](https://www.w3.org/TR/vc-data-model/)
- [Solid Project](https://solidproject.org/) - Data ownership protocol

---

## 🎯 Why TypeScript (Not Go)?

After evaluating both languages, **TypeScript** was chosen because:

✅ **Better for learning** - Great IDE support, type checking catches errors
✅ **Perfect for UX iteration** - Rapid frontend development with hot reload
✅ **Seamless integration** - Works perfectly with Supabase and Vercel
✅ **Single language** - No context switching between frontend/backend
✅ **Massive ecosystem** - Extensive community support and libraries

**Go consideration**: While Go offers excellent performance and concurrency, it would add unnecessary complexity for MVP development. Performance-critical services can migrate to Go in later phases if needed.

---

## 🚀 Next Steps

### This Week
1. Complete TypeScript Handbook basics
2. Set up development environment (Node.js, VSCode)
3. Create Supabase and Vercel accounts

### Next Week
4. Complete Next.js official tutorial
5. Build first authenticated app with Supabase
6. Deploy demo to Vercel

### Week 3
7. Initialize Lucid project structure
8. Implement basic vault CRUD
9. Conduct first user testing

See the full [Implementation Plan](https://github.com/terronhyde/lucid-mvp/blob/main/PLAN.md) for detailed week-by-week guidance.

---

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details

---

## 📞 Contact

**Terron Hyde**
Project Lead & Developer

For questions, partnerships, or pilot buyer inquiries:
- GitHub: [@terronhyde](https://github.com/terronhyde)
- Email: [your-email]

---

## 🌟 Vision

Lucid's long-term vision is to become a **foundational layer of ethical digital infrastructure**, transforming personal data from a harvested resource into a governed, portable, and monetizable asset class under full user control.

**The key principle**: *Data as property, not product.*

---

**Built with privacy, transparency, and user empowerment at the core.**
