import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,        // you're using assert/supertest, so globals=false is fine
    include: ['tests/**/*.test.ts'],
    fileParallelism: false,
    coverage: { reporter: ['text'] },
    // threads: false,
  }
});