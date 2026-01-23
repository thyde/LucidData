import { defineConfig, configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    name: 'lucid-mvp',
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    globals: true,
    exclude: [...configDefaults.exclude, '**/__tests__/e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'test/',
        '**/*.config.*',
        '**/*.d.ts',
        '.next/',
        'dist/',
        'coverage/',
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/*.spec.ts',
        '**/*.spec.tsx',
      ],
      include: [
        'lib/**/*.ts',
        'lib/**/*.tsx',
        'app/**/*.ts',
        'app/**/*.tsx',
        'components/**/*.tsx',
      ],
      all: true,
      lines: 80,
      functions: 80,
      branches: 80,
      statements: 80,
    },
    testTimeout: 10000,
    hookTimeout: 10000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
