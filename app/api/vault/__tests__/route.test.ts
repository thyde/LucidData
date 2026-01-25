/**
 * API Integration Tests for /api/vault
 * Tests GET and POST endpoints for vault entries
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from '../route';

// Mock dependencies BEFORE imports
vi.mock('@/lib/services/vault.service', () => ({
  vaultService: {
    getUserVaultData: vi.fn(),
    createVaultData: vi.fn(),
  },
}));

vi.mock('@/lib/services/audit.service', () => ({
  auditService: {
    createAuditLogEntry: vi.fn(),
  },
}));

vi.mock('@/lib/services/error-logger', () => ({
  logDatabaseError: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'test-user-id-123', email: 'test@example.com' } },
        error: null,
      }),
    },
  })),
}));

// Mock user service to prevent database calls during auth
vi.mock('@/lib/services/user.service', () => ({
  userService: {
    ensureUserExists: vi.fn().mockResolvedValue({ id: 'test-user-id-123', email: 'test@example.com' }),
  },
}));

import { vaultService } from '@/lib/services/vault.service';
import { auditService } from '@/lib/services/audit.service';
import { logDatabaseError } from '@/lib/services/error-logger';
import { HTTP_STATUS } from '@/lib/constants';

describe('GET /api/vault', () => {
  const mockUserId = 'test-user-id-123';
  const mockVaultData = [
    {
      id: 'vault-1',
      userId: mockUserId,
      label: 'Test Entry 1',
      category: 'personal',
      data: { field: 'value1' },
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'vault-2',
      userId: mockUserId,
      label: 'Test Entry 2',
      category: 'health',
      data: { field: 'value2' },
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return authenticated user\'s vault entries', async () => {
    vi.mocked(vaultService.getUserVaultData).mockResolvedValue(mockVaultData as any);

    const request = new NextRequest('http://localhost:3000/api/vault');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveLength(2);
    expect(data[0]).toMatchObject({
      id: 'vault-1',
      userId: mockUserId,
      label: 'Test Entry 1',
      category: 'personal',
    });
    expect(vaultService.getUserVaultData).toHaveBeenCalledWith(mockUserId);
  });

  it('should create audit log entry when listing vault entries', async () => {
    vi.mocked(vaultService.getUserVaultData).mockResolvedValue(mockVaultData as any);

    const request = new NextRequest('http://localhost:3000/api/vault');
    await GET(request);

    expect(auditService.createAuditLogEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: mockUserId,
        eventType: 'data_accessed',
        action: 'Listed vault entries',
        actorId: mockUserId,
        actorType: 'user',
        metadata: { count: mockVaultData.length },
      })
    );
  });

  it('should return empty array when user has no vault entries', async () => {
    vi.mocked(vaultService.getUserVaultData).mockResolvedValue([]);

    const request = new NextRequest('http://localhost:3000/api/vault');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual([]);
  });

  it('should return 500 on service error', async () => {
    vi.mocked(vaultService.getUserVaultData).mockRejectedValue(new Error('Database error'));

    const request = new NextRequest('http://localhost:3000/api/vault');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(HTTP_STATUS.INTERNAL_SERVER_ERROR);
    expect(data).toHaveProperty('error');
    expect(logDatabaseError).toHaveBeenCalled();
  });
});

describe('POST /api/vault', () => {
  const mockUserId = 'test-user-id-123';
  const validPayload = {
    label: 'Test Entry',
    category: 'personal',
    dataType: 'json',
    data: { field: 'value' },
  };

  const mockCreatedEntry = {
    id: 'vault-123',
    userId: mockUserId,
    ...validPayload,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create encrypted vault entry with valid data', async () => {
    vi.mocked(vaultService.createVaultData).mockResolvedValue(mockCreatedEntry as any);

    const request = new NextRequest('http://localhost:3000/api/vault', {
      method: 'POST',
      body: JSON.stringify(validPayload),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(HTTP_STATUS.CREATED);
    expect(data).toMatchObject({
      id: mockCreatedEntry.id,
      userId: mockCreatedEntry.userId,
      label: mockCreatedEntry.label,
      category: mockCreatedEntry.category,
      dataType: mockCreatedEntry.dataType,
    });
    expect(vaultService.createVaultData).toHaveBeenCalledWith(
      mockUserId,
      expect.objectContaining(validPayload)
    );
  });

  it('should create audit log entry when creating vault entry', async () => {
    vi.mocked(vaultService.createVaultData).mockResolvedValue(mockCreatedEntry as any);

    const request = new NextRequest('http://localhost:3000/api/vault', {
      method: 'POST',
      body: JSON.stringify(validPayload),
    });

    await POST(request);

    expect(auditService.createAuditLogEntry).toHaveBeenCalledWith({
      userId: mockUserId,
      vaultDataId: mockCreatedEntry.id,
      eventType: 'data_created',
      action: `Created vault entry: ${validPayload.label}`,
      actorId: mockUserId,
      actorType: 'user',
      metadata: { category: validPayload.category },
    });
  });

  it('should return 400 on validation error - missing required fields', async () => {
    const invalidPayload = {
      // Missing label and category
      data: { field: 'value' },
    };

    const request = new NextRequest('http://localhost:3000/api/vault', {
      method: 'POST',
      body: JSON.stringify(invalidPayload),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
    expect(data).toHaveProperty('error', 'Validation failed');
    expect(data).toHaveProperty('details');
    expect(vaultService.createVaultData).not.toHaveBeenCalled();
  });

  it('should return 400 on validation error - invalid category', async () => {
    const invalidPayload = {
      label: 'Test',
      category: 'invalid-category',
      data: { field: 'value' },
    };

    const request = new NextRequest('http://localhost:3000/api/vault', {
      method: 'POST',
      body: JSON.stringify(invalidPayload),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(HTTP_STATUS.BAD_REQUEST);
    expect(data).toHaveProperty('error', 'Validation failed');
  });

  it('should handle expiresAt date conversion', async () => {
    const payloadWithExpiry = {
      ...validPayload,
      expiresAt: '2025-12-31T23:59:59.000Z',
    };

    vi.mocked(vaultService.createVaultData).mockResolvedValue({
      ...mockCreatedEntry,
      expiresAt: new Date(payloadWithExpiry.expiresAt),
    } as any);

    const request = new NextRequest('http://localhost:3000/api/vault', {
      method: 'POST',
      body: JSON.stringify(payloadWithExpiry),
    });

    const response = await POST(request);

    expect(response.status).toBe(HTTP_STATUS.CREATED);
    expect(vaultService.createVaultData).toHaveBeenCalledWith(
      mockUserId,
      expect.objectContaining({
        expiresAt: expect.any(Date),
      })
    );
  });

  it('should return 500 on service error', async () => {
    vi.mocked(vaultService.createVaultData).mockRejectedValue(new Error('Encryption error'));

    const request = new NextRequest('http://localhost:3000/api/vault', {
      method: 'POST',
      body: JSON.stringify(validPayload),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(HTTP_STATUS.INTERNAL_SERVER_ERROR);
    expect(data).toHaveProperty('error');
    expect(logDatabaseError).toHaveBeenCalled();
  });

  it('should accept all valid categories', async () => {
    const categories = ['personal', 'health', 'financial', 'credentials', 'other'];

    for (const category of categories) {
      vi.clearAllMocks();
      vi.mocked(vaultService.createVaultData).mockResolvedValue({
        ...mockCreatedEntry,
        category,
      } as any);

      const request = new NextRequest('http://localhost:3000/api/vault', {
        method: 'POST',
        body: JSON.stringify({ ...validPayload, category }),
      });

      const response = await POST(request);
      expect(response.status).toBe(HTTP_STATUS.CREATED);
    }
  });

  it('should accept optional fields (description, tags, schemaType)', async () => {
    const payloadWithOptionals = {
      ...validPayload,
      description: 'Test description',
      tags: ['tag1', 'tag2'],
      schemaType: 'schema.org/Person',
      schemaVersion: '1.0',
    };

    vi.mocked(vaultService.createVaultData).mockResolvedValue({
      ...mockCreatedEntry,
      ...payloadWithOptionals,
    } as any);

    const request = new NextRequest('http://localhost:3000/api/vault', {
      method: 'POST',
      body: JSON.stringify(payloadWithOptionals),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(HTTP_STATUS.CREATED);
    expect(data).toMatchObject(payloadWithOptionals);
  });
});
