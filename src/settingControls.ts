import { DEFAULT_MEETING_FILE_PATTERN } from "./helpers"
import { DEFAULT_SETTINGS, type DailyScheduleSettings } from "./settings"

/*
 * Maps the control keys of the declarative settings tab to the plugin
 * settings. The controls show strings, so list and number settings are
 * converted in both directions here.
 */

type SettingsUpdate = Partial<DailyScheduleSettings>

const PEOPLE_FOLDER_PREFIX = "peopleFolders."

export function peopleFolderKey(index: number): string {
  return `${PEOPLE_FOLDER_PREFIX}${index}`
}

function peopleFolderIndex(key: string): number | undefined {
  if (!key.startsWith(PEOPLE_FOLDER_PREFIX)) {
    return undefined
  }
  const index = Number(key.slice(PEOPLE_FOLDER_PREFIX.length))
  return Number.isInteger(index) && index >= 0 ? index : undefined
}

function parseCsv(value: string): readonly string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
}

export function readControlValue(
  settings: DailyScheduleSettings,
  key: string
): string | undefined {
  switch (key) {
    case "meetingNotePath":
    case "meetingFilePattern":
    case "meetingTemplatePath":
      return settings[key]
    case "myEmails":
    case "ignorePatterns":
      return settings[key].join(", ")
    case "refreshIntervalMinutes":
      return String(settings.refreshIntervalMinutes)
    default: {
      const index = peopleFolderIndex(key)
      return index === undefined ? undefined : settings.peopleFolders[index]
    }
  }
}

function parseRefreshInterval(value: string): SettingsUpdate {
  const minutes = Number(value)
  return Number.isInteger(minutes) && minutes > 0
    ? { refreshIntervalMinutes: minutes }
    : {}
}

function replacePeopleFolder(
  folders: readonly string[],
  index: number,
  value: string
): SettingsUpdate {
  return index < folders.length
    ? {
        peopleFolders: folders.map((f, i) => (i === index ? value.trim() : f))
      }
    : {}
}

export function settingsUpdate(
  settings: DailyScheduleSettings,
  key: string,
  value: unknown
): SettingsUpdate {
  if (typeof value !== "string") {
    return {}
  }
  switch (key) {
    case "meetingNotePath":
      return {
        meetingNotePath: value.trim() || DEFAULT_SETTINGS.meetingNotePath
      }
    case "meetingFilePattern":
      return {
        meetingFilePattern: value.trim() || DEFAULT_MEETING_FILE_PATTERN
      }
    case "meetingTemplatePath":
      return { meetingTemplatePath: value.trim() }
    case "myEmails":
      return { myEmails: parseCsv(value).map((s) => s.toLowerCase()) }
    case "ignorePatterns":
      return { ignorePatterns: parseCsv(value) }
    case "refreshIntervalMinutes":
      return parseRefreshInterval(value)
    default: {
      const index = peopleFolderIndex(key)
      return index === undefined
        ? {}
        : replacePeopleFolder(settings.peopleFolders, index, value)
    }
  }
}
