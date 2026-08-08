import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
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
      name: "preserve-2d-and-sync-3d-entry",
      apply: "build",
      async buildStart() {
        const projectRoot = process.cwd();
        const twoDDirectory = resolve(projectRoot, "2d");
        const twoDIndex = resolve(twoDDirectory, "index.html");
        try {
          await access(twoDIndex);
        } catch {
          const currentIndex = await readFile(resolve(projectRoot, "index.html"), "utf8");
          if (currentIndex.includes("矿卡 2.5D 分层编辑器")) {
            await mkdir(twoDDirectory, { recursive: true });
            await writeFile(twoDIndex, currentIndex
              .replaceAll("./assets/editor-25d/", "../assets/editor-25d/")
              .replace('href="./3d/">查看保留的 3D 版本', 'href="../">返回正式 3D 版本'), "utf8");
          }
        }
        await rm(resolve(projectRoot, "assets/app"), { recursive: true, force: true });
      },
      async closeBundle() {
        const projectRoot = process.cwd();
        const builtIndex = await readFile(resolve(projectRoot, "index.html"), "utf8");
        const threeDDirectory = resolve(projectRoot, "3d");
        await mkdir(threeDDirectory, { recursive: true });
        await writeFile(resolve(threeDDirectory, "index.html"), builtIndex.replaceAll("./assets/app/", "../assets/app/"), "utf8");
      }
    }
  ]
});
