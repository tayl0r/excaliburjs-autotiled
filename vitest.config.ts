import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@core': path.resolve(__dirname, 'src/core'),
      '@engine': path.resolve(__dirname, 'src/engine'),
      '@editor': path.resolve(__dirname, 'src/editor'),
      '@utils': path.resolve(__dirname, 'src/utils'),
    },
  },
  test: {
    globals: true,
  },
});
