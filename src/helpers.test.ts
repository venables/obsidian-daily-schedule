import { describe, expect, test } from "bun:test"

import {
  addDays,
  cleanTitle,
  formatDate,
  isSameDay,
  meetingNotePath,
  removeEmoji,
  startOfDay,
  vaultPath
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

describe("startOfDay", () => {
  test("drops the time of day", () => {
    expect(startOfDay(new Date(2026, 6, 7, 14, 32, 9))).toEqual(
      new Date(2026, 6, 7)
    )
  })
})

describe("addDays", () => {
  test("moves forward across a month boundary", () => {
    expect(addDays(new Date(2026, 6, 31), 1)).toEqual(new Date(2026, 7, 1))
  })

  test("moves backward across a year boundary", () => {
    expect(addDays(new Date(2026, 0, 1), -1)).toEqual(new Date(2025, 11, 31))
  })

  test("keeps the time of day", () => {
    expect(addDays(new Date(2026, 6, 7, 9, 30), 2)).toEqual(
      new Date(2026, 6, 9, 9, 30)
    )
  })

  test("does not mutate its input", () => {
    const original = new Date(2026, 6, 7)
    addDays(original, 5)
    expect(original).toEqual(new Date(2026, 6, 7))
  })
})

describe("vaultPath", () => {
  test("returns an empty string for an unset path", () => {
    expect(vaultPath("")).toBe("")
    expect(vaultPath("   ")).toBe("")
  })

  test("trims and normalizes slashes", () => {
    expect(vaultPath("  /meetings//2026/  ")).toBe("meetings/2026")
    expect(vaultPath("templates\\meeting.md")).toBe("templates/meeting.md")
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
