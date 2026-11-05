import { describe, expect, test } from "vitest"

import type { DailyScheduleSettings } from "./settings"
import { parseSettings } from "./settingsSchema"

const DEFAULTS: DailyScheduleSettings = {
  calendars: [],
  meetingNotePath: "meetings",
  meetingFilePattern: "YYYY/MM/YYYY-MM-DD - {{title}}",
  meetingTemplatePath: "",
  refreshIntervalMinutes: 15,
  ignorePatterns: ["commute", "lunch"],
  myEmails: [],
  peopleFolders: ["people"]
}

describe("parseSettings", () => {
  test("returns the defaults when nothing is saved", () => {
    expect(parseSettings(null, DEFAULTS)).toEqual(DEFAULTS)
    expect(parseSettings(undefined, DEFAULTS)).toEqual(DEFAULTS)
  })

  test("returns the defaults when the saved data is not an object", () => {
    expect(parseSettings("oops", DEFAULTS)).toEqual(DEFAULTS)
  })

  test("keeps valid saved values over the defaults", () => {
    const saved = {
      calendars: [
        { name: "Work", url: "https://example.com/a.ics", color: "#f00" }
      ],
      refreshIntervalMinutes: 30,
      peopleFolders: ["contacts"]
    }
    expect(parseSettings(saved, DEFAULTS)).toEqual({
      ...DEFAULTS,
      ...saved
    })
  })

  test("falls back per field, so one bad value keeps the rest", () => {
    const saved = {
      meetingNotePath: "notes/meetings",
      refreshIntervalMinutes: "soon",
      ignorePatterns: [1, 2]
    }
    expect(parseSettings(saved, DEFAULTS)).toEqual({
      ...DEFAULTS,
      meetingNotePath: "notes/meetings"
    })
  })

  test("drops a calendar list that has a malformed entry", () => {
    const saved = { calendars: [{ name: "Work" }] }
    expect(parseSettings(saved, DEFAULTS).calendars).toEqual([])
  })

  test("drops keys it does not know", () => {
    const saved = { myEmail: "old@example.com" }
    expect(parseSettings(saved, DEFAULTS)).toEqual(DEFAULTS)
  })
})
