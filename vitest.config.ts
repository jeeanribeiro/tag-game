import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'shared',
          include: ['packages/shared/test/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'server',
          include: ['apps/server/test/**/*.test.ts'],
          testTimeout: 20_000,
          hookTimeout: 20_000,
        },
      },
    ],
  },
});
