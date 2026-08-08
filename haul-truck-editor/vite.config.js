import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  root: "src",
  base: "./",
  publicDir: resolve(process.cwd(), "public"),
  server: {
    host: "0.0.0.0"
  },
  build: {
    outDir: "..",
    emptyOutDir: false,
    assetsDir: "assets/nikki",
    sourcemap: false,
    rollupOptions: {
      output: {
        entryFileNames: "assets/nikki/viewer-[hash].js",
        chunkFileNames: "assets/nikki/chunk-[hash].js",
        assetFileNames: "assets/nikki/[name]-[hash][extname]"
      }
    }
  }
});
