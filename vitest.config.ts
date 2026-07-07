import { fileURLToPath } from "node:url"

import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: {
      // The `obsidian` package is types-only at runtime; point it at a stub
      // that provides the pieces the pure modules import.
      obsidian: fileURLToPath(
        new URL("./test/obsidian-stub.ts", import.meta.url)
      )
    }
  },
  test: {
    include: ["src/**/*.test.ts"]
  }
})
