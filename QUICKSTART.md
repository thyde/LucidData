# Lucid MVP - Quick Start Guide

## 🚀 Your Development Environment is Ready!

Everything is set up and running. Here's how to start developing.

## 📍 Current Status

✅ All services are running
✅ Database is initialized and seeded
✅ Application is accessible at http://localhost:3000

## 🔗 Service URLs

| Service | URL | Purpose |
|---------|-----|---------|
| **Web Application** | http://localhost:3000 | Main Next.js app |
| **Supabase Studio** | http://127.0.0.1:54323 | Database admin & Auth management |
| **Supabase API** | http://127.0.0.1:54321 | REST API & Auth endpoints |
| **Mailpit** | http://127.0.0.1:54324 | Email testing (view sent emails) |
| **Database** | postgresql://postgres:postgres@127.0.0.1:54322/postgres | PostgreSQL connection |

## 🎯 Next Steps

### 1. Create Your Test User

1. Open Supabase Studio: http://127.0.0.1:54323
2. Go to **Authentication** → **Users**
3. Click **Add user** → **Create new user**
4. Enter:
   - Email: `demo@lucid.dev`
   - Password: _(choose a secure password)_
   - User ID: `00000000-0000-0000-0000-000000000001` (to match seeded data)
5. Click **Create user**

### 2. Test the Application

1. Open http://localhost:3000
2. Click **Login**
3. Sign in with `demo@lucid.dev` and your password
4. Explore the dashboard with pre-seeded data:
   - 3 vault entries (personal, health, financial)
   - 2 consents (1 active, 1 revoked)
   - 4 audit log entries with hash chain

### 3. Explore Supabase Studio

**View Database Tables:**
- Click **Table Editor** to see your data
- Tables: users, vault_data, consents, audit_logs, export_requests

**Manage Authentication:**
- Click **Authentication** to manage users
- View user sessions and sign-in activity

**Test Email Flow:**
- Any auth emails will appear in Mailpit at http://127.0.0.1:54324

## 🛠️ Development Workflow

### Starting the Development Server

The server is already running! If you need to restart it:

```bash
npm run dev
```

### Accessing Local Supabase

```bash
# Check Supabase status
npx supabase status

# Access Supabase Studio
npx supabase studio

# View logs
npx supabase logs

# Stop Supabase
npx supabase stop

# Start Supabase
npx supabase start
```

### Working with Prisma

```bash
# Generate Prisma client (after schema changes)
npx dotenv -e .env.local -- npx prisma generate

# Create a new migration
npx dotenv -e .env.local -- npx prisma migrate dev --name your_migration_name

# Reset database and re-seed
npx dotenv -e .env.local -- npx prisma migrate reset

# Open Prisma Studio
npx dotenv -e .env.local -- npx prisma studio

# Seed database
npx dotenv -e .env.local -- npx prisma db seed
```

### Viewing Database

**Option 1: Supabase Studio** (Recommended)
- Go to http://127.0.0.1:54323
- Click **Table Editor**

**Option 2: Prisma Studio**
```bash
npx dotenv -e .env.local -- npx prisma studio
```

**Option 3: Direct SQL Connection**
```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

## 📁 Key Files

| File | Purpose |
|------|---------|
| [.env.local](.env.local) | Environment variables (local dev) |
| [prisma/schema.prisma](prisma/schema.prisma) | Database schema |
| [app/](app/) | Next.js pages and API routes |
| [lib/crypto/](lib/crypto/) | Encryption utilities |
| [lib/supabase/](lib/supabase/) | Supabase clients |
| [SETUP.md](SETUP.md) | Detailed setup documentation |

## 🔒 Security Notes

### Current Configuration

- **Encryption Key**: A 256-bit AES key has been generated in `.env.local`
- **Database**: Local PostgreSQL with default credentials (postgres/postgres)
- **Auth**: Supabase Auth with email provider enabled
- **Email Confirmations**: Disabled for local development

### ⚠️ For Production

When deploying to production:

1. **Update .env.local** with production Supabase credentials:
   ```bash
   # Uncomment and fill these in .env.local:
   # NEXT_PUBLIC_SUPABASE_URL=https://ebcilokuvbdkhkqfjaup.supabase.co
   # NEXT_PUBLIC_SUPABASE_ANON_KEY=<from-supabase-dashboard>
   # SUPABASE_SERVICE_ROLE_KEY=<from-supabase-dashboard>
   # DATABASE_URL=postgresql://postgres:9C#3QM62pk.vL/t@db.ebcilokuvbdkhkqfjaup.supabase.co:5432/postgres
   ```

2. **Keep the same ENCRYPTION_KEY**:
   - ⚠️ CRITICAL: Use the same encryption key in production
   - Changing it will make existing encrypted data unreadable
   - Store it securely (e.g., in Vercel/AWS secrets manager)

3. **Enable email confirmations**:
   - In Supabase dashboard: Authentication → Settings
   - Enable "Confirm email"
   - Configure SMTP for production emails

4. **Update site URL**:
   - In Supabase dashboard: Authentication → URL Configuration
   - Set Site URL to your production domain
   - Add allowed redirect URLs

## 🐛 Troubleshooting

### Server Won't Start

```bash
# Kill any process on port 3000
npx kill-port 3000

# Clear Next.js cache
rm -rf .next

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

### Database Connection Issues

```bash
# Restart Supabase
npx supabase stop
npx supabase start

# Check status
npx supabase status
```

### Prisma Issues

```bash
# Regenerate Prisma client
npx dotenv -e .env.local -- npx prisma generate

# Reset database
npx dotenv -e .env.local -- npx prisma migrate reset
```

### Authentication Issues

1. Check Supabase is running: `npx supabase status`
2. Verify `.env.local` has correct Supabase URLs
3. Clear browser cookies for localhost
4. Check user exists in Supabase Studio

## 📚 Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [Prisma Documentation](https://www.prisma.io/docs)
- [Full Setup Guide](SETUP.md)
- [Project Strategy](LucidStrategy.pdf)

## 💡 What's Next?

The current implementation uses **placeholder/mock data** in the API routes. Here's what you can work on:

### Phase 1: Real Vault Implementation
- Implement actual encryption/decryption in vault API routes
- Connect UI to real encrypted data
- Add vault data creation/update/delete

### Phase 2: Consent Management
- Build real consent granting/revocation flow
- Implement consent verification
- Add consent expiration handling

### Phase 3: Audit Logging
- Implement real-time audit logging
- Add hash chain verification
- Build tamper detection alerts

### Phase 4: Export Functionality
- Implement data export in multiple formats
- Add JSON-LD and Verifiable Credentials support
- Build secure download mechanism

See [SETUP.md](SETUP.md) for detailed implementation examples and architecture notes.

---

**Happy coding! 🎉**

For questions or issues, refer to the detailed [SETUP.md](SETUP.md) guide.
