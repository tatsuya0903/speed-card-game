import { defineConfig, globalIgnores } from 'eslint/config'
import tseslint from 'typescript-eslint'
import vueParser from 'vue-eslint-parser'
import pluginVue from 'eslint-plugin-vue'
import pluginPlaywright from 'eslint-plugin-playwright'
import pluginVitest from '@vitest/eslint-plugin'
import pluginOxlint from 'eslint-plugin-oxlint'
import skipFormatting from 'eslint-config-prettier/flat'

export default defineConfig(
  { files: ['**/*.{vue,ts,mts}'] },
  globalIgnores(['dist/**', 'coverage/**', 'playwright-report/**', 'test-results/**']),
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: { parser: tseslint.parser, extraFileExtensions: ['.vue'] },
    },
  },
  { ...pluginPlaywright.configs['flat/recommended'], files: ['e2e/**/*.spec.ts'] },
  { ...pluginVitest.configs.recommended, files: ['src/**/*.spec.ts'] },
  ...pluginOxlint.buildFromOxlintConfigFile('.oxlintrc.json'),
  skipFormatting,
)
