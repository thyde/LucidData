/**
 * Global Setup for Playwright E2E Tests
 *
 * This file runs once before all E2E tests.
 * It loads environment variables from .env.test to ensure
 * the Next.js dev server uses the correct test configuration.
 */

import { config } from 'dotenv';
import path from 'path';

export default async function globalSetup() {
  // Load .env.test for E2E tests
  // This ensures the webServer uses test encryption keys and database
  const envPath = path.resolve(process.cwd(), '.env.test');
  config({ path: envPath });

  console.log('✅ Loaded .env.test for E2E tests');
  console.log('📍 Environment:', {
    DATABASE_URL: process.env.DATABASE_URL?.replace(/:[^:]*@/, ':***@'), // Hide password
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY?.substring(0, 10) + '...',
    SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NODE_ENV: process.env.NODE_ENV,
  });
}
