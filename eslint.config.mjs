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
    /*
     * The disable comments in src/ target oxlint, which checks them. ESLint
     * does not enable most of those rules, so it would report each one as
     * unused.
     */
    linterOptions: { reportUnusedDisableDirectives: "off" },
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["eslint.config.mjs"]
        }
      }
    }
  },
  {
    files: ["package.json"],
    rules: {
      // moment is a dev dependency for the test stub; Obsidian bundles its own.
      "depend/ban-dependencies": "off"
    }
  }
])
