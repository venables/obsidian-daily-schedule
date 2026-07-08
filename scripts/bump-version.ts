// Bumps the plugin version in package.json and src/manifest.json in lockstep
// and records the new version -> minAppVersion mapping in versions.json (which
// the Obsidian community directory uses to serve the right build per app
// version). Run with: node scripts/bump-version.ts <patch|minor|major|x.y.z>
import { readFileSync, writeFileSync } from "node:fs"

type Release = "patch" | "minor" | "major"

function parseSemver(v: string): [number, number, number] {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v)
  if (!m) {
    throw new Error(`Not a semver version: ${v}`)
  }
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

function nextVersion(current: string, arg: string): string {
  if (/^\d+\.\d+\.\d+$/.test(arg)) {
    return arg
  }
  const [major, minor, patch] = parseSemver(current)
  switch (arg as Release) {
    case "patch":
      return `${major}.${minor}.${patch + 1}`
    case "minor":
      return `${major}.${minor + 1}.0`
    case "major":
      return `${major + 1}.0.0`
    default:
      throw new Error(
        `Usage: node scripts/bump-version.ts <patch|minor|major|x.y.z>`
      )
  }
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

const arg = process.argv[2]
if (!arg) {
  console.error("Usage: node scripts/bump-version.ts <patch|minor|major|x.y.z>")
  process.exit(1)
}

const pkg = readJson("package.json")
const manifest = readJson("src/manifest.json")

const current = String(pkg.version)
const version = nextVersion(current, arg)
const minAppVersion = String(manifest.minAppVersion)

writeJson("package.json", { ...pkg, version })
writeJson("src/manifest.json", { ...manifest, version })

let versions: Record<string, string> = {}
try {
  versions = readJson("versions.json") as Record<string, string>
} catch {
  // versions.json does not exist yet; start a fresh map.
}
writeJson("versions.json", { ...versions, [version]: minAppVersion })

console.log(`Bumped ${current} -> ${version} (minAppVersion ${minAppVersion})`)
console.log("Next:")
console.log(`  git commit -am "chore: release ${version}"`)
console.log(`  git tag ${version}`)
console.log("  git push --follow-tags")
