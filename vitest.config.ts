import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    environment: 'node',
    include: ['layers/base/app/**/*.test.ts', 'layers/base/app/**/*.spec.ts'],
  },
});