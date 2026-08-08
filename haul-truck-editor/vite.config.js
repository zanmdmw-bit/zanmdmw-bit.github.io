import { cp, mkdir } from "node:fs/promises";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"]
  },
  build: {
    outDir: "dist",
    emptyOutDir: true
  },
  plugins: [
    {
      name: "copy-editor-static-data",
      async closeBundle() {
        await mkdir("dist/data", { recursive: true });
        await mkdir("dist/assets", { recursive: true });
        await cp("data", "dist/data", { recursive: true });
        await cp("assets", "dist/assets", { recursive: true });
      }
    }
  ]
});
