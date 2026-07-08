import { describe, expect, test } from "vitest"

import { rewriteAttendeeLine, rewriteAttendeesBlock } from "./backfill"
import type { EmailMap } from "./people"

const emailMap: EmailMap = new Map([
  ["jane@example.com", "Jane Doe"],
  ["john@example.com", "John Smith"]
])

describe("rewriteAttendeeLine", () => {
  test("rewrites a bare raw-email list line to a wikilink", () => {
    expect(rewriteAttendeeLine("  - jane@example.com", emailMap)).toBe(
      '  - "[[Jane Doe]]"'
    )
  })

  test("rewrites a quoted raw-email list line", () => {
    expect(rewriteAttendeeLine('  - "john@example.com"', emailMap)).toBe(
      '  - "[[John Smith]]"'
    )
  })

  test("leaves an existing wikilink untouched", () => {
    expect(rewriteAttendeeLine('  - "[[Jane Doe]]"', emailMap)).toBeNull()
  })

  test("leaves an unknown email untouched", () => {
    expect(rewriteAttendeeLine("  - stranger@example.com", emailMap)).toBeNull()
  })
})

describe("rewriteAttendeesBlock", () => {
  test("rewrites only lines inside the attendees block", () => {
    const input = [
      "---",
      "attendees:",
      "  - jane@example.com",
      '  - "[[John Smith]]"',
      "tags:",
      "  - jane@example.com",
      "---"
    ].join("\n")

    const { content, changes } = rewriteAttendeesBlock(input, emailMap)

    expect(changes).toBe(1)
    const lines = content.split("\n")
    expect(lines[2]).toBe('  - "[[Jane Doe]]"')
    // The `jane@...` under `tags:` is outside the attendees block, untouched.
    expect(lines[5]).toBe("  - jane@example.com")
  })

  test("returns zero changes when no raw emails resolve", () => {
    const input = ["attendees:", '  - "[[Jane Doe]]"'].join("\n")
    expect(rewriteAttendeesBlock(input, emailMap).changes).toBe(0)
  })
})
