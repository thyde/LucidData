# 🧠 LucidData MVP — Personal Data Bank

**Version:** 0.1 (MVP Phase)  
**Author:** Terron Hyde  
**License:** MIT (open-source)  
**Status:** In Development (90-Day MVP Build)

---

## 🌐 Overview

**Lucid** is a privacy-first **personal data bank** — a secure vault where individuals can store, manage, and license access to their personal data under explicit consent.

Lucid treats data as **property**, not a **product**.  
The MVP aims to prove one foundational truth:

> Individuals can securely store and license access to their digital data — without ever surrendering ownership.

---

## 🎯 MVP Goals

✅ Encrypted personal data vault  
✅ Revocable, consent-based data sharing  
✅ Immutable audit ledger of all access  
✅ Export to open standards (JSON-LD / Verifiable Credentials)  
✅ Demo-ready deployment on Render or Supabase  

---

## 🧩 Stack Overview

| Layer | Technology | Purpose |
|-------|-------------|----------|
| **Frontend** | [Next.js (React)](https://nextjs.org/) | Secure, performant dashboard for data vault and consent management |
| **Backend** | [Node.js (Fastify)](https://www.fastify.io/) | Lightweight API for consent, encryption, and audit logic |
| **Database** | [PostgreSQL + pgcrypto](https://www.postgresql.org/docs/current/pgcrypto.html) via [Supabase](https://supabase.io/) | Encrypted storage and JSONB schema support |
| **Hosting** | [Render](https://render.com/) / Supabase | Low-cost managed deployment |
| **Auth** | OAuth 2.0 (Auth0 or Supabase Auth) | Secure identity and login |
| **Audit / Logging** | [OpenTelemetry](https://opentelemetry.io/) + SHA-256 hash chaining | Immutable, verifiable event logging |
| **CI/CD** | GitHub Actions | Automated build, test, deploy pipeline |

---

## ⚙️ Local Setup

```bash
# 1. Clone repo
git clone https://github.com/<your-handle>/lucid-mvp.git
cd lucid-mvp

# 2. Install dependencies
npm install

# 3. Start dev server
npm run dev

# 4. Run tests
npm test
