import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  root: resolve(__dirname, 'src/client'),
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    hmr: true,
  },
  build: {
    outDir: resolve(__dirname, 'dist/client'),
    emptyOutDir: true,
  },
});
