import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  // Node-context files (build config + dev scripts) — recognize Node globals
  // like process / __dirname so they aren't flagged as undefined.
  {
    files: ['scripts/**/*.js', 'vite.config.js', 'eslint.config.js', 'convert_seed.js'],
    languageOptions: {
      globals: globals.node,
    },
  },
])
