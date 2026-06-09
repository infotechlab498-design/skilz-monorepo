import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'frontend/dist', 'backend/functions/node_modules', '**/node_modules']),
  {
    files: ['backend/src/**/*.js', 'eslint.config.js'],
    languageOptions: {
      globals: globals.node,
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
  },
  {
    files: ['backend/functions/**/*.js'],
    languageOptions: {
      globals: globals.node,
      ecmaVersion: 'latest',
      sourceType: 'script',
    },
  },
  {
    files: ['frontend/**/*.{js,jsx}'],
    ignores: ['backend/**'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      // React 19 + strict hooks: flags many legitimate “reset when prop changes” patterns.
      'react-hooks/set-state-in-effect': 'off',
      'no-unused-vars': [
        'error',
        {
          // Framer Motion binds `motion` for <motion.div />; ESLint sometimes misses JSX usage.
          varsIgnorePattern: '^[A-Z_]|^motion$|^_',
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    files: ['frontend/src/context/**/*.{js,jsx}'],
    rules: {
      // Context modules export hooks + provider; fast refresh wants components-only.
      'react-refresh/only-export-components': 'off',
    },
  },
])
