import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    // Vite 5+ host validation. Set this to your dev host(s); a leading dot
    // matches all subdomains. Customize for your environment.
    allowedHosts: [".sorack.com", "localhost"],
    // /api/* → local Hono server (same container in dev pod).
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
  optimizeDeps: {
    // Pre-bundle big lazy-loaded deps so the first dynamic import doesn't
    // trip the mid-session optimizer reload that 404s for the browser's
    // stale cached chunk URL.
    include: ["mermaid"],
  },
});
