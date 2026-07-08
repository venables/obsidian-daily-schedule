import { describe, expect, test } from "vitest"

import { resolveAttendees, type EmailMap } from "./people"

const emailMap: EmailMap = new Map([
  ["jane@example.com", "Jane Doe"],
  ["john@example.com", "John Smith"]
])

describe("resolveAttendees", () => {
  test("maps a known email to a wikilink", () => {
    const [resolved] = resolveAttendees(
      [{ email: "jane@example.com", name: "Jane" }],
      emailMap,
      []
    )
    expect(resolved).toEqual({
      name: "Jane Doe",
      email: "jane@example.com",
      wikiLink: "[[Jane Doe]]"
    })
  })

  test("falls back to display name for an unknown email", () => {
    const [resolved] = resolveAttendees(
      [{ email: "stranger@example.com", name: "Stranger Danger" }],
      emailMap,
      []
    )
    expect(resolved).toEqual({
      name: "Stranger Danger",
      email: "stranger@example.com",
      wikiLink: null
    })
  })

  test("falls back to the email local-part when there is no display name", () => {
    const [resolved] = resolveAttendees(
      [{ email: "nobody@example.com", name: null }],
      emailMap,
      []
    )
    expect(resolved.name).toBe("nobody")
    expect(resolved.wikiLink).toBeNull()
  })

  test("filters out my own emails, case-insensitively", () => {
    const resolved = resolveAttendees(
      [{ email: "ME@example.com" }, { email: "jane@example.com" }],
      emailMap,
      ["me@example.com"]
    )
    expect(resolved.map((a) => a.email)).toEqual(["jane@example.com"])
  })

  test("dedupes repeated attendees by email", () => {
    const resolved = resolveAttendees(
      [
        { email: "jane@example.com" },
        { email: "JANE@example.com" },
        { email: "john@example.com" }
      ],
      emailMap,
      []
    )
    expect(resolved.map((a) => a.email)).toEqual([
      "jane@example.com",
      "john@example.com"
    ])
  })
})
