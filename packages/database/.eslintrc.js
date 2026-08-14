const { createConfig } = require('@veridion/eslint-config/base');

const config = createConfig(__dirname);

/** @type {import('eslint').Linter.Config} */
module.exports = {
  ...config,
  ignorePatterns: [...config.ignorePatterns, 'src/generated/'],
};
