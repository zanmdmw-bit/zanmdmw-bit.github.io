import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  root: "src-25d",
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
    assetsDir: "assets/editor-25d",
    sourcemap: false,
    rollupOptions: {
      output: {
        entryFileNames: "assets/editor-25d/editor-[hash].js",
        chunkFileNames: "assets/editor-25d/chunk-[hash].js",
        assetFileNames: "assets/editor-25d/[name]-[hash][extname]"
      }
    }
  },
  plugins: [
    {
      name: "preserve-legacy-3d-and-clean-25d-assets",
      apply: "build",
      async buildStart() {
        const projectRoot = process.cwd();
        const legacyDirectory = resolve(projectRoot, "3d");
        const legacyIndex = resolve(legacyDirectory, "index.html");
        try {
          await access(legacyIndex);
        } catch {
          const currentIndex = await readFile(resolve(projectRoot, "index.html"), "utf8");
          if (currentIndex.includes("矿卡 3D 模块化编辑器")) {
            await mkdir(legacyDirectory, { recursive: true });
            await writeFile(legacyIndex, currentIndex.replaceAll("./assets/app/", "../assets/app/"), "utf8");
          }
        }
        await rm(resolve(projectRoot, "assets/editor-25d"), { recursive: true, force: true });
      }
    }
  ]
});
