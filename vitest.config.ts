import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: [
      'apps/server/test/**/*.test.ts',
      'apps/web/test/**/*.test.ts',
      'packages/shared/test/**/*.test.ts',
    ],
    testTimeout: 10000,
  },
});
