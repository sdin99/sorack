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
    // Eagerly transform the top of the import tree on dev-server start so
    // the first browser request lands on warm caches instead of triggering
    // a cascade of on-demand transforms. Cuts the "spinner → app" gap on
    // a hard reload from ~1.5s to a few hundred ms in practice.
    warmup: {
      clientFiles: [
        "./src/main.tsx",
        "./src/App.tsx",
        "./src/features/lab/LabDetail.tsx",
        "./src/features/lab/RunbookEditor.tsx",
        "./src/lib/data-source/SorackData.tsx",
      ],
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
  optimizeDeps: {
    // Pre-bundle big deps with esbuild on dev-server start. Without this,
    // every transitive ESM module is fetched/transformed on demand (dev's
    // no-bundle model) — the codemirror/xyflow/react-markdown/simple-icons
    // trees add up to hundreds of module requests on first load. Including
    // them here collapses each to a single pre-bundled chunk and also
    // sidesteps the mid-session optimizer reload that 404s for stale
    // dynamic-import URLs (the reason `mermaid` was added originally).
    include: [
      "mermaid",
      "react", "react-dom", "react-dom/client",
      "react-router-dom",
      "react-i18next", "i18next", "i18next-browser-languagedetector",
      "@tanstack/react-query",
      "@xyflow/react",
      "@dagrejs/dagre",
      "@uiw/react-codemirror",
      "@codemirror/autocomplete",
      "@codemirror/lang-markdown",
      "@codemirror/state",
      "@codemirror/view",
      "react-markdown",
      "remark-gfm",
      "rehype-highlight",
      "simple-icons",
      "dompurify",
      "marked",
    ],
  },
});
