# Database Schema - LucidData

Complete Prisma data models for the LucidData platform. All models include relationships and important field documentation.

## User (`users`)

```prisma
model User {
  id                String   @id @default(uuid())
  email             String   @unique
  encryptionKeyHash String?  // For future user-controlled encryption
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  
  vaultData    VaultData[]
  consents     Consent[]
  auditLogs    AuditLog[]
  exportRequests ExportRequest[]
}
```

**Note:** Synced with Supabase Auth users via `auth.users` table.

---

## VaultData (`vault_data`)

```prisma
model VaultData {
  id            String   @id @default(uuid())
  userId        String
  encryptedData String   // AES-256-GCM encrypted JSON
  iv            String   // Format: "iv:authTag" (hex strings)
  keyId         String   @default("master-key-1")
  label         String
  category      VaultCategory // personal, health, financial, credentials, other
  tags          String[]
  schemaType    String?  // e.g., "Person", "MedicalRecord"
  schemaVersion String?  // For JSON-LD/FHIR portability
  expiresAt     DateTime?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  consents  Consent[]
  auditLogs AuditLog[]
}
```

**Encryption:** Field-level encryption on `encryptedData`. Metadata (`label`, `category`, `tags`) unencrypted for queryability.

**IV Format:** Store as `"hexIv:hexAuthTag"` - colon-separated hex strings from encryption.

---

## Consent (`consents`)

```prisma
model Consent {
  id            String      @id @default(uuid())
  userId        String
  vaultDataId   String?
  grantedTo     String      // Organization/service name
  purpose       String
  permissions   Permission[] // read, export, verify
  status        ConsentStatus // active, revoked, expired
  startDate     DateTime
  endDate       DateTime?
  revokedAt     DateTime?
  revokedBy     String?
  revokedReason String?
  consentText   String
  termsVersion  String
  ipAddress     String?
  userAgent     String?
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt
  
  user       User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  vaultData  VaultData?  @relation(fields: [vaultDataId], references: [id], onDelete: SetNull)
  auditLogs  AuditLog[]
}
```

**Time-bound permissions:** Use `startDate`, `endDate` for temporal access control. Revocation tracked with `revokedAt`, `revokedBy`, `revokedReason`.

---

## AuditLog (`audit_logs`)

```prisma
model AuditLog {
  id            String   @id @default(uuid())
  userId        String
  vaultDataId   String?
  consentId     String?
  eventType     EventType // data_created, data_accessed, consent_granted, etc.
  action        String
  actorId       String
  actorType     ActorType // user, system, service
  currentHash   String   // SHA-256 hash of current log entry
  previousHash  String?  // SHA-256 hash of previous log entry (hash chain)
  ipAddress     String?
  userAgent     String?
  metadata      Json?
  success       Boolean  @default(true)
  errorMessage  String?
  timestamp     DateTime @default(now())
  
  user      User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  vaultData VaultData? @relation(fields: [vaultDataId], references: [id], onDelete: SetNull)
  consent   Consent?   @relation(fields: [consentId], references: [id], onDelete: SetNull)
}
```

**Hash chain:** Each entry's `currentHash` includes `previousHash`, creating tamper-evident trail. Verify integrity with `verifyHashChain()` from `lib/crypto/hashing.ts`.

**Immutability:** Audit logs are append-only. Never modify existing entries.

---

## ExportRequest (`export_requests`)

```prisma
model ExportRequest {
  id               String        @id @default(uuid())
  userId           String
  format           ExportFormat  // json_ld, verifiable_credential, csv
  status           ExportStatus  // pending, processing, completed, failed
  includeCategories VaultCategory[]
  includeAuditLog  Boolean      @default(false)
  fileUrl          String?
  expiresAt        DateTime?
  errorMessage     String?
  requestedAt      DateTime     @default(now())
  completedAt      DateTime?
  
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

**Data portability:** Enables users to export their data in open standards (JSON-LD, VerifiableCredential, CSV).

---

## Key Relationships

### User → VaultData (1:N)
- User can have multiple vault entries
- Cascade delete: Deleting user deletes all vault data

### User → Consent (1:N)
- User manages multiple consent grants
- Cascade delete: Deleting user deletes all consents

### VaultData → Consent (1:N)
- A vault entry can have multiple consents
- Soft delete on consent: `onDelete: SetNull` (keeps vault data)

### User → AuditLog (1:N)
- User has immutable audit trail
- All operations logged with hash chain

---

## Security Considerations

1. **Encryption:** `VaultData.encryptedData` is AES-256-GCM encrypted. Metadata (`label`, `category`, `tags`) remains queryable.

2. **Hash Chain:** `AuditLog` entries form an immutable chain via `currentHash` and `previousHash`. Modifications are detectable.

3. **User Filtering:** All queries MUST filter by `userId`. Never expose data across user boundaries.

4. **Time-bound Access:** `Consent.startDate` and `Consent.endDate` enforce temporal access control.

5. **Revocation:** Consents can be revoked with reason tracking via `revokedAt`, `revokedBy`, `revokedReason`.
