// Test-only stand-in for the `obsidian` package, which ships type
// declarations with no runtime implementation. test/setup.ts registers this
// file as the `obsidian` module (see bunfig.toml) so the pure modules under
// test can be imported without the Obsidian app. Only the surface the tested
// code touches at module-load time is provided; extend as tests grow.
import moment from "moment"

export { moment }

export class TFile {}
export class TFolder {}
export class Vault {}
export class App {}

/*
 * Mirrors Obsidian's normalizePath: collapse repeated and back slashes, strip
 * leading and trailing slashes, swap non-breaking spaces, and NFC-normalize.
 * An empty result becomes "/", as in the real implementation.
 */
export function normalizePath(path: string): string {
  const cleaned = path
    .replace(/[\\/]+/g, "/")
    .replace(/^\/|\/$/g, "")
    .replace(/\u00A0|\u202F/g, " ")
    .normalize("NFC")
  return cleaned === "" ? "/" : cleaned
}

export function requestUrl(): never {
  throw new Error("requestUrl is not available in tests")
}
