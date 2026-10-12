import { defineConfig } from 'vite';

// The gate (ring view, timeline, sound, glyph art) is shared with Farpoint at
// the repository root, so the dev server may read files from there too.
export default defineConfig({
  server: { fs: { allow: ['../..'] } },
});
