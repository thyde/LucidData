import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTypeScript from 'eslint-config-next/typescript'
import prettier from 'eslint-config-prettier/flat'

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  prettier,
  {
    files: ['**/__tests__/**/*', '**/*.test.ts', '**/*.test.tsx', 'test/**/*'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    // LD-609: the shared package runs in browsers, the phone app, and the
    // extension, so it may not depend on the web framework, the server, or
    // anything Node-only. Tests may use Node to read fixtures.
    files: ['packages/core/src/**/*.ts'],
    ignores: ['packages/core/src/**/__tests__/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['next', 'next/*', 'react', 'react-dom', 'react/*', '@/*', '@supabase/*', 'server-only', 'stripe'],
              message: 'packages/core is shared with the phone app and the extension. Keep framework and server code in the web app.',
            },
            {
              group: ['node:*', 'crypto', 'fs', 'fs/*', 'path', 'os', 'child_process', 'http', 'https', 'net', 'stream', 'buffer', 'util', 'zlib'],
              message: 'packages/core may not use Node built-ins. Web Crypto and text helpers come from crypto/runtime.ts.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'Use globalThis, so the code also runs outside a browser.' },
        { name: 'document', message: 'DOM access belongs in the web app.' },
        { name: 'process', message: 'Environment access belongs in the app that runs the code.' },
        { name: 'Buffer', message: 'Buffer is Node-only. Use the helpers in crypto/runtime.ts.' },
      ],
    },
  },
  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'coverage/**',
    'playwright-report/**',
    'test-results/**',
    'next-env.d.ts',
    'public/sw.js',
    'public/sw.js.map',
    'public/workbox-*.js',
    'public/swe-worker-*.js',
  ]),
])
