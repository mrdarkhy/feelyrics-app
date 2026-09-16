import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import next from 'eslint-config-next';

export default tseslint.config(
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'out/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'drizzle/**',
      'next-env.d.ts',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...next,

  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      eqeqeq: ['error', 'smart'],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },

  /**
   * Architectural boundary: the domain layer is pure. It must not import from
   * any other layer, from React, or from Next.js. Everything it needs is either
   * standard library or passed in.
   */
  {
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@/application/*',
                '@/infrastructure/*',
                '@/app/*',
                '@/components/*',
                '@/actions/*',
                'next',
                'next/*',
                'react',
                'react-dom',
                'drizzle-orm',
                'drizzle-orm/*',
              ],
              message:
                'The domain layer must stay pure: no framework, UI, or persistence imports.',
            },
          ],
        },
      ],
    },
  },

  /**
   * The application layer may depend on the domain and on its own ports, but
   * never on a concrete adapter or on the UI.
   */
  {
    files: ['src/application/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@/infrastructure/*',
                '@/app/*',
                '@/components/*',
                'next',
                'next/*',
                'react',
                'react-dom',
                'drizzle-orm',
                'drizzle-orm/*',
              ],
              message:
                'The application layer talks to ports, not to adapters or the UI.',
            },
          ],
        },
      ],
    },
  },

  {
    files: ['scripts/**/*.ts', 'tests/**/*.ts', '*.config.ts', '*.config.mjs'],
    rules: {
      'no-console': 'off',
    },
  },
);
