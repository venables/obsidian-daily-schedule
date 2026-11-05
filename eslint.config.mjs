import obsidianmd from "eslint-plugin-obsidianmd"
import { defineConfig, globalIgnores } from "eslint/config"

/*
 * Runs the same rule set as the Obsidian community plugin review, so a
 * release does not fail the directory scan. oxlint stays the main linter.
 */
export default defineConfig([
  globalIgnores(["node_modules", "dist", "scripts", "test", "*.config.ts"]),
  ...obsidianmd.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["eslint.config.mjs"]
        }
      }
    }
  }
])
