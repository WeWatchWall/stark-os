import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: resolve(__dirname, 'index.html'),
    },
  },
  resolve: {
    alias: {
      '@stark-o/browser-cli': resolve(__dirname, '../../packages/browser-cli/src'),
      '@stark-o/shared': resolve(__dirname, '../../packages/shared/src'),
    },
  },
});
