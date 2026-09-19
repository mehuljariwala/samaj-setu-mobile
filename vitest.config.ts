import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * The matchmaking suite, which used to run from its own project.
 *
 * It needs the `@/` alias the rest of the app is written against, because the
 * engine now lives in lib/ and imports its config through that alias rather
 * than by relative path.
 */
export default defineConfig({
  resolve: {
    alias: { '@': resolve(import.meta.dirname, '.') },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
