/**
 * API Integration Tests for /api/vault/[id]
 * Tests GET, PATCH, and DELETE endpoints for individual vault entries
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, PATCH, DELETE } from '../route';

// Mock Prisma BEFORE imports
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    vaultData: {
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

// Mock crypto functions
vi.mock('@/lib/crypto/encryption', () => ({
  encrypt: vi.fn(() => ({
    encrypted: 'mock-encrypted-data',
    iv: 'mock-iv-hex',
    authTag: 'mock-auth-tag-hex',
  })),
  decrypt: vi.fn((encrypted: string) => {
    return JSON.stringify({ field: 'decrypted-value' });
  }),
  getMasterKey: vi.fn(() => Buffer.from('test-key-32-bytes-long-for-test')),
}));

// Mock audit function
vi.mock('@/lib/db/queries/audit', () => ({
  createAuditLogEntry: vi.fn(),
}));

// Mock Supabase
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'test-user-id-123' } },
        error: null,
      }),
    },
  })),
}));

import { prisma } from '@/lib/db/prisma';
import { encrypt, decrypt } from '@/lib/crypto/encryption';
import { createAuditLogEntry } from '@/lib/db/queries/audit';

describe('GET /api/vault/[id]', () => {
  const mockUserId = 'test-user-id-123';
  const mockVaultEntry = {
    id: 'vault-123',
    userId: mockUserId,
    label: 'Test Entry',
    description: 'Test description',
    category: 'personal',
    dataType: 'json',
    encryptedData: 'encrypted-data',
    encryptedKey: 'master-key-1',
    iv: 'mock-iv:mock-auth-tag',
    tags: ['tag1', 'tag2'],
    schemaType: null,
    schemaVersion: '1.0',
    expiresAt: null,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return decrypted vault entry for authenticated user', async () => {
    vi.mocked(prisma.vaultData.findUnique).mockResolvedValue(mockVaultEntry as any);

    const request = new NextRequest('http://localhost:3000/api/vault/vault-123');
    const params = Promise.resolve({ id: 'vault-123' });
    const response = await GET(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      id: 'vault-123',
      userId: mockUserId,
      label: 'Test Entry',
      category: 'personal',
      data: { field: 'decrypted-value' },
    });
    expect(decrypt).toHaveBeenCalled();
  });

  it('should create audit log entry when accessing vault entry', async () => {
    vi.mocked(prisma.vaultData.findUnique).mockResolvedValue(mockVaultEntry as any);

    const request = new NextRequest('http://localhost:3000/api/vault/vault-123');
    const params = Promise.resolve({ id: 'vault-123' });
    await GET(request, { params });

    expect(createAuditLogEntry).toHaveBeenCalledWith({
      userId: mockUserId,
      vaultDataId: 'vault-123',
      eventType: 'data_accessed',
      action: `Accessed vault entry: ${mockVaultEntry.label}`,
      actorId: mockUserId,
      actorType: 'user',
      request,
    });
  });

  it('should return 401 when user is not authenticated', async () => {
    const { createClient } = await import('@/lib/supabase/server');
    vi.mocked(createClient).mockReturnValueOnce({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: null,
        }),
      },
    } as any);

    const request = new NextRequest('http://localhost:3000/api/vault/vault-123');
    const params = Promise.resolve({ id: 'vault-123' });
    const response = await GET(request, { params });
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data).toHaveProperty('error', 'Unauthorized');
  });

  it('should return 404 when vault entry does not exist', async () => {
    vi.mocked(prisma.vaultData.findUnique).mockResolvedValue(null);

    const request = new NextRequest('http://localhost:3000/api/vault/vault-999');
    const params = Promise.resolve({ id: 'vault-999' });
    const response = await GET(request, { params });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data).toHaveProperty('error', 'Not found');
  });

  it('should return 404 when vault entry belongs to different user', async () => {
    vi.mocked(prisma.vaultData.findUnique).mockResolvedValue({
      ...mockVaultEntry,
      userId: 'different-user-id',
    } as any);

    const request = new NextRequest('http://localhost:3000/api/vault/vault-123');
    const params = Promise.resolve({ id: 'vault-123' });
    const response = await GET(request, { params });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data).toHaveProperty('error', 'Not found');
  });
});

describe('PATCH /api/vault/[id]', () => {
  const mockUserId = 'test-user-id-123';
  const mockExistingEntry = {
    id: 'vault-123',
    userId: mockUserId,
    label: 'Original Label',
    description: 'Original description',
    category: 'personal',
    dataType: 'json',
    encryptedData: 'encrypted-data',
    encryptedKey: 'master-key-1',
    iv: 'mock-iv:mock-auth-tag',
    tags: ['tag1'],
    schemaType: null,
    schemaVersion: '1.0',
    expiresAt: null,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should update vault entry with valid data', async () => {
    vi.mocked(prisma.vaultData.findUnique).mockResolvedValue(mockExistingEntry as any);
    vi.mocked(prisma.vaultData.update).mockResolvedValue({
      ...mockExistingEntry,
      label: 'Updated Label',
    } as any);

    const request = new NextRequest('http://localhost:3000/api/vault/vault-123', {
      method: 'PATCH',
      body: JSON.stringify({ label: 'Updated Label' }),
    });

    const params = Promise.resolve({ id: 'vault-123' });
    const response = await PATCH(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      id: 'vault-123',
      label: 'Updated Label',
    });
    expect(prisma.vaultData.update).toHaveBeenCalledWith({
      where: { id: 'vault-123' },
      data: expect.objectContaining({
        label: 'Updated Label',
      }),
    });
  });

  it('should re-encrypt data when updating data field', async () => {
    vi.mocked(prisma.vaultData.findUnique).mockResolvedValue(mockExistingEntry as any);
    vi.mocked(prisma.vaultData.update).mockResolvedValue({
      ...mockExistingEntry,
      encryptedData: 'new-encrypted-data',
    } as any);

    const request = new NextRequest('http://localhost:3000/api/vault/vault-123', {
      method: 'PATCH',
      body: JSON.stringify({ data: { field: 'new-value' } }),
    });

    const params = Promise.resolve({ id: 'vault-123' });
    const response = await PATCH(request, { params });

    expect(response.status).toBe(200);
    expect(encrypt).toHaveBeenCalled();
    expect(prisma.vaultData.update).toHaveBeenCalledWith({
      where: { id: 'vault-123' },
      data: expect.objectContaining({
        encryptedData: 'mock-encrypted-data',
        iv: 'mock-iv-hex:mock-auth-tag-hex',
      }),
    });
  });

  it('should create audit log entry when updating vault entry', async () => {
    vi.mocked(prisma.vaultData.findUnique).mockResolvedValue(mockExistingEntry as any);
    vi.mocked(prisma.vaultData.update).mockResolvedValue({
      ...mockExistingEntry,
      label: 'Updated Label',
    } as any);

    const request = new NextRequest('http://localhost:3000/api/vault/vault-123', {
      method: 'PATCH',
      body: JSON.stringify({ label: 'Updated Label' }),
    });

    const params = Promise.resolve({ id: 'vault-123' });
    await PATCH(request, { params });

    expect(createAuditLogEntry).toHaveBeenCalledWith({
      userId: mockUserId,
      vaultDataId: 'vault-123',
      eventType: 'data_updated',
      action: expect.stringContaining('Updated vault entry'),
      actorId: mockUserId,
      actorType: 'user',
      request,
    });
  });

  it('should return 401 when user is not authenticated', async () => {
    const { createClient } = await import('@/lib/supabase/server');
    vi.mocked(createClient).mockReturnValueOnce({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: null,
        }),
      },
    } as any);

    const request = new NextRequest('http://localhost:3000/api/vault/vault-123', {
      method: 'PATCH',
      body: JSON.stringify({ label: 'Updated' }),
    });

    const params = Promise.resolve({ id: 'vault-123' });
    const response = await PATCH(request, { params });
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data).toHaveProperty('error', 'Unauthorized');
  });

  it('should return 404 when vault entry does not exist', async () => {
    vi.mocked(prisma.vaultData.findUnique).mockResolvedValue(null);

    const request = new NextRequest('http://localhost:3000/api/vault/vault-999', {
      method: 'PATCH',
      body: JSON.stringify({ label: 'Updated' }),
    });

    const params = Promise.resolve({ id: 'vault-999' });
    const response = await PATCH(request, { params });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data).toHaveProperty('error', 'Not found');
  });

  it('should return 400 on validation error', async () => {
    vi.mocked(prisma.vaultData.findUnique).mockResolvedValue(mockExistingEntry as any);

    const request = new NextRequest('http://localhost:3000/api/vault/vault-123', {
      method: 'PATCH',
      body: JSON.stringify({ category: 'invalid-category' }),
    });

    const params = Promise.resolve({ id: 'vault-123' });
    const response = await PATCH(request, { params });
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data).toHaveProperty('error', 'Validation failed');
  });

  it('should update multiple fields at once', async () => {
    vi.mocked(prisma.vaultData.findUnique).mockResolvedValue(mockExistingEntry as any);
    vi.mocked(prisma.vaultData.update).mockResolvedValue({
      ...mockExistingEntry,
      label: 'New Label',
      description: 'New description',
      tags: ['new-tag'],
    } as any);

    const request = new NextRequest('http://localhost:3000/api/vault/vault-123', {
      method: 'PATCH',
      body: JSON.stringify({
        label: 'New Label',
        description: 'New description',
        tags: ['new-tag'],
      }),
    });

    const params = Promise.resolve({ id: 'vault-123' });
    const response = await PATCH(request, { params });

    expect(response.status).toBe(200);
    expect(prisma.vaultData.update).toHaveBeenCalledWith({
      where: { id: 'vault-123' },
      data: expect.objectContaining({
        label: 'New Label',
        description: 'New description',
        tags: ['new-tag'],
      }),
    });
  });
});

describe('DELETE /api/vault/[id]', () => {
  const mockUserId = 'test-user-id-123';
  const mockVaultEntry = {
    id: 'vault-123',
    userId: mockUserId,
    label: 'Entry to Delete',
    description: null,
    category: 'personal',
    dataType: 'json',
    encryptedData: 'encrypted-data',
    encryptedKey: 'master-key-1',
    iv: 'mock-iv:mock-auth-tag',
    tags: [],
    schemaType: null,
    schemaVersion: '1.0',
    expiresAt: null,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should delete vault entry successfully', async () => {
    vi.mocked(prisma.vaultData.findUnique).mockResolvedValue(mockVaultEntry as any);
    vi.mocked(prisma.vaultData.delete).mockResolvedValue(mockVaultEntry as any);

    const request = new NextRequest('http://localhost:3000/api/vault/vault-123', {
      method: 'DELETE',
    });

    const params = Promise.resolve({ id: 'vault-123' });
    const response = await DELETE(request, { params });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ success: true });
    expect(prisma.vaultData.delete).toHaveBeenCalledWith({
      where: { id: 'vault-123' },
    });
  });

  it('should create audit log entry when deleting vault entry', async () => {
    vi.mocked(prisma.vaultData.findUnique).mockResolvedValue(mockVaultEntry as any);
    vi.mocked(prisma.vaultData.delete).mockResolvedValue(mockVaultEntry as any);

    const request = new NextRequest('http://localhost:3000/api/vault/vault-123', {
      method: 'DELETE',
    });

    const params = Promise.resolve({ id: 'vault-123' });
    await DELETE(request, { params });

    expect(createAuditLogEntry).toHaveBeenCalledWith({
      userId: mockUserId,
      vaultDataId: 'vault-123',
      eventType: 'data_deleted',
      action: `Deleted vault entry: ${mockVaultEntry.label}`,
      actorId: mockUserId,
      actorType: 'user',
      request,
    });
  });

  it('should return 401 when user is not authenticated', async () => {
    const { createClient } = await import('@/lib/supabase/server');
    vi.mocked(createClient).mockReturnValueOnce({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: null,
        }),
      },
    } as any);

    const request = new NextRequest('http://localhost:3000/api/vault/vault-123', {
      method: 'DELETE',
    });

    const params = Promise.resolve({ id: 'vault-123' });
    const response = await DELETE(request, { params });
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data).toHaveProperty('error', 'Unauthorized');
  });

  it('should return 404 when vault entry does not exist', async () => {
    vi.mocked(prisma.vaultData.findUnique).mockResolvedValue(null);

    const request = new NextRequest('http://localhost:3000/api/vault/vault-999', {
      method: 'DELETE',
    });

    const params = Promise.resolve({ id: 'vault-999' });
    const response = await DELETE(request, { params });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data).toHaveProperty('error', 'Not found');
  });

  it('should return 404 when trying to delete another user\'s entry', async () => {
    vi.mocked(prisma.vaultData.findUnique).mockResolvedValue({
      ...mockVaultEntry,
      userId: 'different-user-id',
    } as any);

    const request = new NextRequest('http://localhost:3000/api/vault/vault-123', {
      method: 'DELETE',
    });

    const params = Promise.resolve({ id: 'vault-123' });
    const response = await DELETE(request, { params });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data).toHaveProperty('error', 'Not found');
    expect(prisma.vaultData.delete).not.toHaveBeenCalled();
  });
});
