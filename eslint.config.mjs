import eslint from '@eslint/js'
import prettier from 'eslint-config-prettier'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      'build.ts',
      'dist/**',
      'drizzle/**',
      'node_modules/**',
      'public/**',
      'styles/**',
      '**/*.css'
    ]
  },

  eslint.configs.recommended,

  ...tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    }
  },

  {
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/exhaustive-deps': 'error',
      'react-hooks/rules-of-hooks': 'error'
    }
  },

  // The api contract is imported by the browser bundle, so it must stay
  // dependency-clean: only `effect` and `@effect/platform`, no server code.
  {
    files: ['src/api/contract/**/*.ts'],
    ignores: ['src/api/contract/**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../**', '!../errors', '!../schemas'],
              message:
                'The contract folder must not import from the rest of the server — it is shipped to the browser.'
            },
            {
              group: ['node:*'],
              message:
                'Node built-ins are not available in the browser — the contract folder must stay platform-free.'
            },
            {
              group: ['drizzle-orm', 'drizzle-orm/*'],
              message:
                'Database code must not leak into the contract folder — model the wire shape instead.'
            }
          ]
        }
      ]
    }
  },

  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-unused-vars': 'error',
      '@typescript-eslint/prefer-nullish-coalescing': 'error'
    }
  },

  prettier
)
