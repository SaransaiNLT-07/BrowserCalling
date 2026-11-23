import { fileURLToPath, URL } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const apiTarget = process.env.VITE_DEV_API_PROXY ?? "http://127.0.0.1:8000";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  // server: {
  //   host: "127.0.0.1",
  //   port: 8000,
  //   strictPort: true,
  //   proxy: {
  //     "/api": { target: apiTarget, changeOrigin: true },
  //     "/ws": { target: apiTarget, ws: true, changeOrigin: true },
  //   },
  // },
  // preview: {
  //   host: "127.0.0.1",
  //   port: 8743,
  //   strictPort: true,
  // },
  build: {
    sourcemap: true,
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
});
