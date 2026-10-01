// @ts-check
import { tanstackConfig } from '@tanstack/eslint-config'

export default [
  ...tanstackConfig,
  {
    rules: {
      'import/no-cycle': 'off',
      'import/order': 'off',
      'sort-imports': 'off',
      '@typescript-eslint/array-type': 'off',
      '@typescript-eslint/require-await': 'off',
      // Too noisy on defensive checks against runtime data, e.g. Drizzle types
      // `rows[0]` as always defined.
      '@typescript-eslint/no-unnecessary-condition': 'off',
      'pnpm/json-enforce-catalog': 'off',
    },
  },
  {
    // Components run in the browser. Server code is reached through server
    // functions, never imported directly (types are fine).
    files: ['src/**/*.tsx'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              // A regex, because `group` uses gitignore syntax where a leading
              // `#` starts a comment.
              regex: '^#/server/',
              allowTypeImports: true,
              message: 'Call a server function instead of importing server code.',
            },
          ],
        },
      ],
    },
  },
  {
    ignores: [
      '.output/**',
      '.nitro/**',
      '.tanstack/**',
      'dist/**',
      'src/routeTree.gen.ts',
      'eslint.config.js',
      'prettier.config.js',
    ],
  },
]
