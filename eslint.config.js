import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx,mjs}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: { ...globals.browser, __KIRJAUS_TESTIVERSIO__: 'readonly' },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  {
    // Vercel-funktiot, konfiguraatiot, node:test-testit ja skriptit ajetaan Nodessa.
    files: ['api/**/*.js', '*.config.js', '**/*.test.js', 'scripts/**/*.mjs'],
    languageOptions: {
      globals: globals.node,
    },
  },
])
