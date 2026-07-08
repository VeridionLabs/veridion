const { resolve } = require('path');

/**
 * Creates a base ESLint configuration for TypeScript projects.
 * @param {string} projectRoot - The root directory of the project/package.
 * @returns {import('eslint').Linter.Config}
 */
function createConfig(projectRoot) {
  return {
    root: true,
    parser: '@typescript-eslint/parser',
    parserOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      project: resolve(projectRoot, 'tsconfig.json'),
      tsconfigRootDir: projectRoot,
    },
    plugins: ['@typescript-eslint', 'import', 'simple-import-sort', 'unused-imports'],
    extends: [
      'eslint:recommended',
      'plugin:@typescript-eslint/recommended',
      'plugin:@typescript-eslint/recommended-requiring-type-checking',
      'plugin:import/recommended',
      'plugin:import/typescript',
      'prettier',
    ],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      'import/no-default-export': 'off',
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      'unused-imports/no-unused-imports': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
    settings: {
      'import/resolver': {
        typescript: true,
        node: true,
      },
    },
    ignorePatterns: [
      'node_modules/',
      'dist/',
      '.next/',
      '.turbo/',
      'coverage/',
      '*.js',
      '*.mjs',
      '*.cjs',
    ],
  };
}

module.exports = { createConfig };
