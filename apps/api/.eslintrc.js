const { createConfig } = require('@veridion/eslint-config/base');

/** @type {import('eslint').Linter.Config} */
const config = createConfig(__dirname);

module.exports = {
  ...config,
  rules: {
    ...config.rules,
    '@typescript-eslint/no-unsafe-assignment': 'off',
    '@typescript-eslint/no-unsafe-call': 'off',
    '@typescript-eslint/no-unsafe-member-access': 'off',
    '@typescript-eslint/no-unsafe-return': 'off',
    '@typescript-eslint/no-unsafe-argument': 'off',
    '@typescript-eslint/require-await': 'off',
  },
};
