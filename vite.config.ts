import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "app",
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "app/src"),
      "@shared": path.resolve(__dirname, "shared"),
      buffer: "buffer/",
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
  },
  envDir: "..",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
});

