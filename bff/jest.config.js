module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/server.ts',
    '!src/utils/queue.ts',    // p-limit wrapper; always mocked in tests
    '!src/middleware/apiKey.ts', // config is frozen at module init; tested via integration
  ],
  coverageThreshold: {
    global: { branches: 70, functions: 90, lines: 90 },
  },
  // p-limit v6 and yocto-queue are ESM-only; mock the queue wrapper to avoid
  // the ESM/CJS boundary in Jest's transform pipeline.
  moduleNameMapper: {
    '^../utils/queue$': '<rootDir>/src/test/__mocks__/queue.ts',
    '^../../utils/queue$': '<rootDir>/src/test/__mocks__/queue.ts',
  },
};
