import { defineConfig } from "tsdown"

export default defineConfig({
  entry: ["src/main.ts"],
  format: ["cjs"],
  outDir: ".",
  outExtensions: () => ({ js: ".js" }),
  platform: "node",
  target: "es2022",
  sourcemap: "inline",
  clean: false,
  dts: false,
  treeshake: true,
  deps: {
    neverBundle: ["obsidian", "electron"],
    onlyBundle: false
  }
})
