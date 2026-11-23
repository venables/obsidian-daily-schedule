import { DEFAULT_MEETING_FILE_PATTERN } from "./helpers"

export interface CalendarSource {
  readonly name: string
  /** SecretStorage ID of the secret that holds the ICS URL. */
  readonly urlSecret: string
  readonly color: string
}

export interface DailyScheduleSettings {
  readonly calendars: readonly CalendarSource[]
  readonly meetingNotePath: string
  readonly meetingFilePattern: string
  readonly meetingTemplatePath: string
  readonly refreshIntervalMinutes: number
  readonly ignorePatterns: readonly string[]
  readonly myEmails: readonly string[]
  readonly peopleFolders: readonly string[]
}

export const DEFAULT_SETTINGS: DailyScheduleSettings = {
  calendars: [],
  meetingNotePath: "meetings",
  meetingFilePattern: DEFAULT_MEETING_FILE_PATTERN,
  meetingTemplatePath: "",
  refreshIntervalMinutes: 15,
  ignorePatterns: ["commute", "lunch"],
  myEmails: [],
  peopleFolders: ["people"]
}
