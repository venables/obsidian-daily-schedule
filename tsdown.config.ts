import { defineConfig } from "tsdown"

// Release defaults. dist/main.js is a GitHub release asset that users download,
// and an inline sourcemap made it ~9x larger. `pnpm dev` overrides both
// settings from the CLI so the watch build stays readable and debuggable.
export default defineConfig({
  entry: ["src/main.ts"],
  format: ["cjs"],
  outDir: "dist",
  outExtensions: () => ({ js: ".js" }),
  platform: "node",
  target: "es2022",
  sourcemap: false,
  minify: true,
  clean: false,
  dts: false,
  treeshake: true,
  deps: {
    neverBundle: ["obsidian", "electron"],
    onlyBundle: false
  }
})
