import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  root: "src",
  base: "./",
  publicDir: false,
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
    fs: {
      allow: [resolve(process.cwd())]
    }
  },
  build: {
    outDir: "..",
    emptyOutDir: false,
    assetsDir: "assets/app",
    sourcemap: false,
    rollupOptions: {
      output: {
        entryFileNames: "assets/app/editor-[hash].js",
        chunkFileNames: "assets/app/chunk-[hash].js",
        assetFileNames: "assets/app/[name]-[hash][extname]"
      }
    }
  },
  plugins: [
    {
      name: "clean-editor-build-assets",
      async buildStart() {
        await rm(resolve(process.cwd(), "assets/app"), { recursive: true, force: true });
      }
    }
  ]
});
