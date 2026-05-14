module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: ['agents/**/*.js', 'publishers/**/*.js', 'utils/**/*.js', 'ultraflow/**/*.js'],
  coverageThreshold: { global: { branches: 60, functions: 70, lines: 70, statements: 70 } },
};
