// Test-only stand-in for the `obsidian` package, which ships type
// declarations with no runtime implementation. vitest aliases `obsidian` to
// this file (see vitest.config.ts) so the pure modules under test can be
// imported without the Obsidian app. Only the surface the tested code touches
// at module-load time is provided; extend as tests grow.
import moment from "moment"

export { moment }

export class TFile {}
export class TFolder {}
export class Vault {}
export class App {}

export function requestUrl(): never {
  throw new Error("requestUrl is not available in tests")
}
