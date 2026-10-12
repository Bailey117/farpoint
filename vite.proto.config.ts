import { resolve } from 'node:path';
import { defineConfig } from 'vite';

// Builds the expedition prototype (proto/expedition.html) on its own.
export default defineConfig({
  build: {
    outDir: 'dist-proto',
    rollupOptions: { input: resolve(import.meta.dirname, 'proto/expedition.html') },
  },
});
