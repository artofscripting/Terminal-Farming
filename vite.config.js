import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist/web',
    emptyOutDir: true,
  },
  server: {
    open: true,
  },
});
