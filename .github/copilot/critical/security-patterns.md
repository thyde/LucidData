# Security Patterns - LucidData

Critical security patterns for encryption, audit logging, and authentication. These patterns are non-negotiable for production safety.

## Encryption (AES-256-GCM)

**Always use utilities from `lib/crypto/encryption.ts`:**

```typescript
import { encrypt, decrypt, getMasterKey } from '@/lib/crypto/encryption';

// Encrypting vault data
const masterKey = getMasterKey(); // Reads ENCRYPTION_KEY from env
const { encrypted, iv, authTag } = encrypt(
  JSON.stringify(sensitiveData),
  masterKey
);

// Store in database
await prisma.vaultData.create({
  data: {
    encryptedData: encrypted,
    iv: `${iv}:${authTag}`, // Format: "hexIv:hexAuthTag"
    // ... other fields
  }
});

// Decrypting vault data
const [ivHex, authTagHex] = vaultEntry.iv.split(':');
const decrypted = decrypt(
  vaultEntry.encryptedData,
  masterKey,
  ivHex,
  authTagHex
);
const data = JSON.parse(decrypted);
```

**Rules:**
- Always encrypt `VaultData.encryptedData` before storing
- Never log or expose decrypted data
- Store IV and authTag in `iv` field as `"iv:authTag"` (hex strings)
- Use `getMasterKey()` - never access `process.env.ENCRYPTION_KEY` directly
- IV is randomly generated per encryption - do not reuse

---

## Audit Logging (Hash Chains)

**Always use utilities from `lib/crypto/hashing.ts`:**

```typescript
import { createAuditHash, verifyHashChain } from '@/lib/crypto/hashing';

// Get previous log entry's hash
const previousLog = await prisma.auditLog.findFirst({
  where: { userId },
  orderBy: { timestamp: 'desc' },
  select: { currentHash: true },
});

// Create new audit log with hash chain
const currentHash = createAuditHash(
  previousLog?.currentHash ?? null,
  {
    userId,
    eventType: 'data_accessed',
    action: 'User viewed vault entry',
    actorId: user.id,
    actorType: 'user',
    timestamp: new Date(),
  }
);

await prisma.auditLog.create({
  data: {
    userId,
    currentHash,
    previousHash: previousLog?.currentHash ?? null,
    // ... other fields
  }
});

// Verify hash chain integrity
const logs = await prisma.auditLog.findMany({
  where: { userId },
  orderBy: { timestamp: 'asc' },
});
const isValid = verifyHashChain(logs);
```

**Rules:**
- Create audit log for ALL vault/consent operations (create, read, update, delete, grant, revoke)
- Always include `previousHash` to maintain chain integrity
- Use `verifyHashChain()` before displaying audit logs to clients
- Never modify existing audit log entries (immutable by design)
- Hash chain breaks if any entry is modified - this is detectable

### Event Types

Common `eventType` values:
- `data_created` - Vault entry created
- `data_updated` - Vault entry modified
- `data_deleted` - Vault entry removed
- `data_accessed` - Vault entry read
- `consent_granted` - Consent permission given
- `consent_revoked` - Consent permission revoked
- `export_requested` - Data export initiated
- `export_completed` - Data export finished

---

## Authentication (Supabase)

**Always validate auth in API routes:**

```typescript
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  
  if (error || !user) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }
  
  // User is authenticated, proceed with business logic
  // user.id is the authenticated user's ID
}
```

**Client Components:**

```typescript
'use client';
import { createClient } from '@/lib/supabase/client';

export function MyComponent() {
  const supabase = createClient();
  // Use for client-side auth operations
}
```

**Rules:**
- API routes: Use `@/lib/supabase/server` (always await `createClient()`)
- Client Components: Use `@/lib/supabase/client`
- Server Components: Use `@/lib/supabase/server`
- Always check `user` exists before proceeding (never assume authentication)
- Use `user.id` to filter database queries (never trust client-provided user IDs)

### Session Management

- Sessions are managed server-side via Supabase cookies
- Middleware (`lib/supabase/middleware.ts`) refreshes sessions automatically
- Protected layouts redirect unauthenticated users to `/login`

---

## Data Ownership & Privacy

### User Data Filtering (Critical)

Every database query that touches user data MUST filter by `userId`:

```typescript
// ✅ CORRECT - User data is filtered
await prisma.vaultData.findMany({
  where: { userId: user.id },
});

// ❌ WRONG - Data could leak to other users
await prisma.vaultData.findMany({
  // Missing userId filter!
});
```

### Never Trust Client-Provided IDs

```typescript
// ❌ WRONG - User can query other users' data by changing id parameter
const data = await prisma.vaultData.findUnique({
  where: { id: params.id }, // What about userId?
});

// ✅ CORRECT - Verify ownership before returning
const data = await prisma.vaultData.findUnique({
  where: {
    id: params.id,
    userId: user.id, // Ensures user owns this data
  },
});

if (!data) {
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
```

---

## Error Handling Security

Never expose sensitive information in error messages:

```typescript
// ❌ WRONG - Exposes encryption details to client
catch (error) {
  return NextResponse.json(
    { error: `Decryption failed: ${error.message}` },
    { status: 500 }
  );
}

// ✅ CORRECT - Generic error, details logged server-side
catch (error) {
  console.error('Vault data decryption error:', error); // Server logs
  return NextResponse.json(
    { error: 'Failed to retrieve vault entry' },
    { status: 500 }
  );
}
```

---

## Environment Variables (Critical)

```bash
# Encryption key (256-bit AES, base64-encoded)
# NEVER change in production - all data becomes unreadable
ENCRYPTION_KEY=sdEZsqV241TgWLfqENE8yG37OKdWd+FR0PcnAAkX6jQ=

# Database connection
DATABASE_URL=postgresql://user:password@host:5432/luciddata

# Supabase configuration
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
```

**⚠️ Critical:** Never commit `.env.local` to git. Environment variables are secrets.

---

## Testing Security Patterns

Before pushing to production:

1. **Encryption:**
   - Verify encrypted data cannot be read without the key
   - Verify IV/authTag are included and correctly formatted
   - Test key rotation scenarios

2. **Audit Logging:**
   - Verify hash chain is unbroken for all operations
   - Verify `verifyHashChain()` detects modified entries
   - Test with multiple users to ensure isolation

3. **Authentication:**
   - Verify unauthorized requests are rejected
   - Verify user ID filtering works across all queries
   - Test with expired/invalid tokens

4. **Error Handling:**
   - Verify sensitive data doesn't leak in error messages
   - Verify proper HTTP status codes are returned
   - Verify errors are logged server-side for debugging
