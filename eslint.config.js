'use strict';
const js = require('@eslint/js');
module.exports = [
  js.configs.recommended,
  {
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
      'prefer-const': 'warn',
      'no-var': 'error',
    },
    env: { node: true, es2022: true },
    parserOptions: { ecmaVersion: 2022 },
  }
];
