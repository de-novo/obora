import { resolve } from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  root: resolve(__dirname, "src/client"),
  server: {
    host: "127.0.0.1",
    port: 5174,
    strictPort: false,
    hmr: true,
  },
  build: {
    outDir: resolve(__dirname, "dist/client"),
    emptyOutDir: true,
  },
});
