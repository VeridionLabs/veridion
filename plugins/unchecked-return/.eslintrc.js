module.exports = {
  root: true,
  extends: ['@veridion/eslint-config'],
  parserOptions: {
    tsconfigRootDir: __dirname,
    project: ['./tsconfig.json'],
  },
};
