import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', 'docs/**', '**/*.min.js'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['**/*.{js,mjs,cjs}', '**/*.config.ts'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    files: ['apps/web/**'],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    files: ['apps/server/**', 'scripts/**', '**/*.config.{js,ts,mjs}'],
    languageOptions: { globals: { ...globals.node } },
  },
  prettier,
);
