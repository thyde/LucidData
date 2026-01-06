/**
 * Supabase mock for testing
 * Provides mock Supabase client and auth methods
 */

import { vi } from 'vitest';

export const mockSupabaseUser = {
  id: 'test-user-id-123',
  email: 'test@example.com',
  aud: 'authenticated',
  role: 'authenticated',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

export const mockSupabaseSession = {
  access_token: 'mock-access-token',
  refresh_token: 'mock-refresh-token',
  expires_in: 3600,
  token_type: 'bearer',
  user: mockSupabaseUser,
};

export const createMockSupabaseClient = () => ({
  auth: {
    getUser: vi.fn().mockResolvedValue({
      data: { user: mockSupabaseUser },
      error: null,
    }),
    getSession: vi.fn().mockResolvedValue({
      data: { session: mockSupabaseSession },
      error: null,
    }),
    signUp: vi.fn().mockResolvedValue({
      data: { user: mockSupabaseUser, session: mockSupabaseSession },
      error: null,
    }),
    signInWithPassword: vi.fn().mockResolvedValue({
      data: { user: mockSupabaseUser, session: mockSupabaseSession },
      error: null,
    }),
    signOut: vi.fn().mockResolvedValue({
      error: null,
    }),
    onAuthStateChange: vi.fn().mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    }),
  },
  from: vi.fn(),
});

// Mock the Supabase client creation functions
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => createMockSupabaseClient(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => createMockSupabaseClient(),
}));
