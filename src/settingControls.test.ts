import { describe, expect, test } from "bun:test"

import { DEFAULT_MEETING_FILE_PATTERN } from "./helpers"
import {
  peopleFolderKey,
  readControlValue,
  settingsUpdate
} from "./settingControls"
import type { DailyScheduleSettings } from "./settings"

const SETTINGS: DailyScheduleSettings = {
  calendars: [],
  meetingNotePath: "meetings",
  meetingFilePattern: DEFAULT_MEETING_FILE_PATTERN,
  meetingTemplatePath: "templates/meeting.md",
  refreshIntervalMinutes: 15,
  ignorePatterns: ["commute", "lunch"],
  myEmails: ["me@work.com", "me@home.com"],
  peopleFolders: ["people", "contacts"]
}

describe("readControlValue", () => {
  test("returns plain string settings as they are", () => {
    expect(readControlValue(SETTINGS, "meetingNotePath")).toBe("meetings")
    expect(readControlValue(SETTINGS, "meetingTemplatePath")).toBe(
      "templates/meeting.md"
    )
  })

  test("joins list settings with a comma", () => {
    expect(readControlValue(SETTINGS, "myEmails")).toBe(
      "me@work.com, me@home.com"
    )
    expect(readControlValue(SETTINGS, "ignorePatterns")).toBe("commute, lunch")
  })

  test("returns the refresh interval as a dropdown option", () => {
    expect(readControlValue(SETTINGS, "refreshIntervalMinutes")).toBe("15")
  })

  test("returns one people folder by its index", () => {
    expect(readControlValue(SETTINGS, peopleFolderKey(1))).toBe("contacts")
  })

  test("returns undefined for a key it does not know", () => {
    expect(readControlValue(SETTINGS, "calendars")).toBeUndefined()
    expect(readControlValue(SETTINGS, peopleFolderKey(9))).toBeUndefined()
  })
})

describe("settingsUpdate", () => {
  test("trims paths and uses the default for an empty base folder", () => {
    expect(settingsUpdate(SETTINGS, "meetingNotePath", "  notes ")).toEqual({
      meetingNotePath: "notes"
    })
    expect(settingsUpdate(SETTINGS, "meetingNotePath", " ")).toEqual({
      meetingNotePath: "meetings"
    })
    expect(settingsUpdate(SETTINGS, "meetingTemplatePath", " ")).toEqual({
      meetingTemplatePath: ""
    })
  })

  test("uses the default filename pattern for an empty value", () => {
    expect(settingsUpdate(SETTINGS, "meetingFilePattern", "")).toEqual({
      meetingFilePattern: DEFAULT_MEETING_FILE_PATTERN
    })
  })

  test("splits comma lists and lowercases emails", () => {
    expect(
      settingsUpdate(SETTINGS, "myEmails", "Me@Work.com, ,you@home.com")
    ).toEqual({ myEmails: ["me@work.com", "you@home.com"] })
    expect(settingsUpdate(SETTINGS, "ignorePatterns", "Focus, lunch")).toEqual({
      ignorePatterns: ["Focus", "lunch"]
    })
  })

  test("accepts only positive whole refresh intervals", () => {
    expect(settingsUpdate(SETTINGS, "refreshIntervalMinutes", "30")).toEqual({
      refreshIntervalMinutes: 30
    })
    expect(settingsUpdate(SETTINGS, "refreshIntervalMinutes", "soon")).toEqual(
      {}
    )
    expect(settingsUpdate(SETTINGS, "refreshIntervalMinutes", "0")).toEqual({})
  })

  test("replaces one people folder and keeps the others", () => {
    expect(settingsUpdate(SETTINGS, peopleFolderKey(0), " team ")).toEqual({
      peopleFolders: ["team", "contacts"]
    })
  })

  test("ignores an unknown key, an index out of range or a non-string value", () => {
    expect(settingsUpdate(SETTINGS, "calendars", "x")).toEqual({})
    expect(settingsUpdate(SETTINGS, peopleFolderKey(5), "x")).toEqual({})
    expect(settingsUpdate(SETTINGS, "meetingNotePath", 42)).toEqual({})
  })
})
