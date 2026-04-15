import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['__tests__/**/*.test.ts'],
    environment: 'node',
    // Integration tests (spawn) are slower; give them more time
    testTimeout: 15000,
    // Run test files in sequence to avoid port/process conflicts in integration tests
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: false,
      },
    },
  },
});
