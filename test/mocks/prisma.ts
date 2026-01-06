/**
 * Prisma mock for testing
 * Provides a mock Prisma client for unit tests
 */

import { PrismaClient } from '@prisma/client';
import { mockDeep, mockReset, DeepMockProxy } from 'vitest-mock-extended';

// Create a deep mock of Prisma Client
export const prismaMock = mockDeep<PrismaClient>() as unknown as DeepMockProxy<PrismaClient>;

// Reset mock before each test
beforeEach(() => {
  mockReset(prismaMock);
});

// Export function to get fresh mock instance
export function getPrismaMock() {
  return prismaMock;
}
