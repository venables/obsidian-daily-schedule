import { describe, expect, test } from "vitest"

import {
  cleanTitle,
  formatDate,
  isSameDay,
  meetingNotePath,
  removeEmoji
} from "./helpers"

describe("removeEmoji", () => {
  test("strips emoji and trims", () => {
    expect(removeEmoji("Standup 🚀")).toBe("Standup")
  })
})

describe("cleanTitle", () => {
  test("replaces filesystem-unsafe characters with dashes", () => {
    expect(cleanTitle('a/b\\c:d*e?f"g<h>i|j')).toBe("a-b-c-d-e-f-g-h-i-j")
  })

  test("collapses whitespace runs to single spaces", () => {
    expect(cleanTitle("Design   review\tsync")).toBe("Design review sync")
  })

  test("strips emoji", () => {
    expect(cleanTitle("Launch 🎉 party")).toBe("Launch party")
  })
})

describe("formatDate", () => {
  test("formats as zero-padded YYYY-MM-DD in local time", () => {
    expect(formatDate(new Date(2026, 0, 5))).toBe("2026-01-05")
  })
})

describe("isSameDay", () => {
  test("true for same calendar day, different times", () => {
    expect(isSameDay(new Date(2026, 6, 7, 1), new Date(2026, 6, 7, 23))).toBe(
      true
    )
  })

  test("false across a day boundary", () => {
    expect(isSameDay(new Date(2026, 6, 7, 23), new Date(2026, 6, 8, 1))).toBe(
      false
    )
  })
})

describe("meetingNotePath", () => {
  const date = new Date(2026, 3, 15)

  test("default pattern produces base/YYYY/MM/YYYY-MM-DD - Title.md", () => {
    expect(meetingNotePath("meetings", "", date, "Design Review")).toBe(
      "meetings/2026/04/2026-04-15 - Design Review.md"
    )
  })

  test("title with date-like characters is not consumed as format tokens", () => {
    // A title such as "MDY Sync" contains M, D, Y which are Moment tokens;
    // the split-on-{{title}} logic must keep them literal.
    expect(
      meetingNotePath("meetings", "YYYY-MM-DD - {{title}}", date, "MDY Sync")
    ).toBe("meetings/2026-04-15 - MDY Sync.md")
  })

  test("does not double the .md extension when the result already ends in .md", () => {
    expect(meetingNotePath("meetings", "{{title}}", date, "notes.md")).toBe(
      "meetings/notes.md"
    )
  })

  test("empty base folder yields a top-level path", () => {
    expect(meetingNotePath("", "{{title}}", date, "Sync")).toBe("Sync.md")
  })

  test("cleans unsafe characters out of the title segment", () => {
    expect(meetingNotePath("meetings", "{{title}}", date, "A/B: sync")).toBe(
      "meetings/A-B- sync.md"
    )
  })
})
