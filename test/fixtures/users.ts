/**
 * User test fixtures
 * Sample user data for testing
 */

import { User } from '@prisma/client';

export const mockUser: User = {
  id: '00000000-0000-0000-0000-000000000001',
  email: 'test@example.com',
  encryptionKeyHash: null,
  createdAt: new Date('2024-01-01T00:00:00.000Z'),
  updatedAt: new Date('2024-01-01T00:00:00.000Z'),
};

export const mockUsers: User[] = [
  mockUser,
  {
    id: '00000000-0000-0000-0000-000000000002',
    email: 'user2@example.com',
    encryptionKeyHash: null,
    createdAt: new Date('2024-01-02T00:00:00.000Z'),
    updatedAt: new Date('2024-01-02T00:00:00.000Z'),
  },
  {
    id: '00000000-0000-0000-0000-000000000003',
    email: 'user3@example.com',
    encryptionKeyHash: null,
    createdAt: new Date('2024-01-03T00:00:00.000Z'),
    updatedAt: new Date('2024-01-03T00:00:00.000Z'),
  },
];

export function createMockUser(overrides?: Partial<User>): User {
  return {
    ...mockUser,
    ...overrides,
  };
}
