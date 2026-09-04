module.exports = {
  root: false,
  extends: ['@veridion/eslint-config/base'],
  parserOptions: {
    project: './tsconfig.json',
    tsconfigRootDir: __dirname,
  },
};
