import { fileURLToPath, URL } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  // Load every variable for this mode (not only VITE_*). These stay in the Node
  // process and never reach the browser bundle.
  const env = loadEnv(mode, process.cwd(), "");

  // Django runs here during local development (README: uvicorn on :8000).
  // The dev server proxies to it, so the browser stays same-origin and no CORS is needed.
  const apiTarget = env.VITE_DEV_API_PROXY || "http://127.0.0.1:8000";

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    // `server` and `preview` apply only to `vite` / `vite preview`.
    // `vite build` (Vercel) ignores them.
    // server: {
    //   host: "127.0.0.1",
    //   port: 5173, // must differ from the Django port the proxy points at
    //   strictPort: true,
    //   // proxy: {
    //   //   "/api": { target: apiTarget, changeOrigin: true },
    //   //   "/ws": { target: apiTarget, ws: true, changeOrigin: true },
    //   // },
    // },
    // preview: {
    //   host: "127.0.0.1",
    //   port: 5173,
    //   strictPort: true,
    // },
    build: {
      // Don't ship source maps publicly: they expose the full source.
      // If you add Sentry later, use "hidden" and upload the maps in CI, then delete them from dist.
      sourcemap: false,
      target: "es2022",
      cssMinify: true,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ["react", "react-dom", "react-router-dom"],
          },
        },
      },
    },
  };
});
