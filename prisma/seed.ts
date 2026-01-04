import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

// Simple hash function for demo purposes
function createHash(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

async function main() {
  console.log('🌱 Starting database seed...');

  // Create test user
  const testUser = await prisma.user.upsert({
    where: { email: 'demo@lucid.dev' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      email: 'demo@lucid.dev',
    },
  });

  console.log('✅ Created test user:', testUser.email);

  // Create sample vault data (mock encryption)
  const vaultEntry1 = await prisma.vaultData.create({
    data: {
      userId: testUser.id,
      category: 'personal',
      dataType: 'json',
      label: 'Personal Information',
      description: 'Basic personal details',
      tags: ['identity', 'kyc'],
      encryptedData: 'mock_encrypted_data_1',
      encryptedKey: 'mock_encrypted_key_1',
      iv: 'mock_iv_1:mock_auth_tag_1',
      schemaType: 'JSON-LD',
    },
  });

  const vaultEntry2 = await prisma.vaultData.create({
    data: {
      userId: testUser.id,
      category: 'health',
      dataType: 'json',
      label: 'Health Records',
      description: 'Medical history and prescriptions',
      tags: ['health', 'medical'],
      encryptedData: 'mock_encrypted_data_2',
      encryptedKey: 'mock_encrypted_key_2',
      iv: 'mock_iv_2:mock_auth_tag_2',
      schemaType: 'FHIR',
    },
  });

  const vaultEntry3 = await prisma.vaultData.create({
    data: {
      userId: testUser.id,
      category: 'financial',
      dataType: 'json',
      label: 'Bank Account Details',
      description: 'Primary checking account information',
      tags: ['finance', 'banking'],
      encryptedData: 'mock_encrypted_data_3',
      encryptedKey: 'mock_encrypted_key_3',
      iv: 'mock_iv_3:mock_auth_tag_3',
    },
  });

  console.log('✅ Created 3 vault entries');

  // Create sample consents
  const consent1 = await prisma.consent.create({
    data: {
      userId: testUser.id,
      vaultDataId: vaultEntry1.id,
      grantedTo: 'research-org-123',
      grantedToName: 'Medical Research Institute',
      grantedToEmail: 'data@research.org',
      accessLevel: 'read',
      purpose: 'Medical research study on demographics',
      endDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days from now
      ipAddress: '192.168.1.100',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    },
  });

  const consent2 = await prisma.consent.create({
    data: {
      userId: testUser.id,
      vaultDataId: vaultEntry2.id,
      grantedTo: 'healthcare-provider-456',
      grantedToName: 'General Hospital',
      grantedToEmail: 'records@hospital.com',
      accessLevel: 'export',
      purpose: 'Treatment and care coordination',
      revoked: true,
      revokedAt: new Date(),
      revokedReason: 'Changed healthcare provider',
      ipAddress: '192.168.1.100',
    },
  });

  console.log('✅ Created 2 consents (1 active, 1 revoked)');

  // Create audit log entries with hash chain
  const audit1 = await prisma.auditLog.create({
    data: {
      userId: testUser.id,
      vaultDataId: vaultEntry1.id,
      eventType: 'data_created',
      action: 'Created vault entry: Personal Information',
      actorId: testUser.id,
      actorType: 'user',
      actorName: 'Demo User',
      previousHash: null,
      currentHash: createHash(JSON.stringify({
        previousHash: null,
        eventType: 'data_created',
        userId: testUser.id,
        timestamp: new Date().toISOString(),
      })),
    },
  });

  const audit2 = await prisma.auditLog.create({
    data: {
      userId: testUser.id,
      vaultDataId: vaultEntry1.id,
      consentId: consent1.id,
      eventType: 'consent_granted',
      action: 'Granted read access to Medical Research Institute',
      actorId: testUser.id,
      actorType: 'user',
      actorName: 'Demo User',
      ipAddress: '192.168.1.100',
      previousHash: audit1.currentHash,
      currentHash: createHash(JSON.stringify({
        previousHash: audit1.currentHash,
        eventType: 'consent_granted',
        userId: testUser.id,
        timestamp: new Date().toISOString(),
      })),
    },
  });

  const audit3 = await prisma.auditLog.create({
    data: {
      userId: testUser.id,
      vaultDataId: vaultEntry1.id,
      consentId: consent1.id,
      eventType: 'access',
      action: 'Data accessed by Medical Research Institute',
      actorId: 'research-org-123',
      actorType: 'buyer',
      actorName: 'Medical Research Institute',
      ipAddress: '203.0.113.50',
      previousHash: audit2.currentHash,
      currentHash: createHash(JSON.stringify({
        previousHash: audit2.currentHash,
        eventType: 'access',
        userId: testUser.id,
        timestamp: new Date().toISOString(),
      })),
    },
  });

  const audit4 = await prisma.auditLog.create({
    data: {
      userId: testUser.id,
      vaultDataId: vaultEntry2.id,
      consentId: consent2.id,
      eventType: 'consent_revoked',
      action: 'Revoked consent for General Hospital',
      actorId: testUser.id,
      actorType: 'user',
      actorName: 'Demo User',
      ipAddress: '192.168.1.100',
      previousHash: audit3.currentHash,
      currentHash: createHash(JSON.stringify({
        previousHash: audit3.currentHash,
        eventType: 'consent_revoked',
        userId: testUser.id,
        timestamp: new Date().toISOString(),
      })),
    },
  });

  console.log('✅ Created 4 audit log entries with hash chain');

  console.log('🎉 Database seeding completed!');
  console.log('\nTest credentials:');
  console.log('  Email: demo@lucid.dev');
  console.log('  (Set up in Supabase Auth)');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
