import obsidianmd from "eslint-plugin-obsidianmd"

/*
 * Runs the rule set of the Obsidian community plugin review, so a release
 * does not fail the directory scan. `bun run lint:obsidian` runs this file;
 * `bun run lint` uses .oxlintrc.json for everything else.
 */
export default [
  { ignores: ["node_modules", "dist", "scripts", "test", "*.config.ts"] },
  ...obsidianmd.configs.recommended,
  {
    /*
     * The disable comments in src/ target the .oxlintrc.json rules, which
     * this config does not enable, so each one would be reported as unused.
     */
    linterOptions: { reportUnusedDisableDirectives: "off" }
  },
  {
    files: ["package.json"],
    rules: {
      // moment is a dev dependency for the test stub; Obsidian bundles its own.
      "depend/ban-dependencies": "off"
    }
  }
]
