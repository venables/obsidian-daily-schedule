import * as v from "valibot"

import type { DailyScheduleSettings } from "./settings"

const CalendarSourceSchema = v.object({
  name: v.string(),
  url: v.string(),
  color: v.string()
})

const StringListSchema = v.array(v.string())

function field<TSchema extends v.GenericSchema>(
  schema: TSchema,
  fallback: v.InferOutput<TSchema>
) {
  return v.fallback(v.optional(schema, fallback), fallback)
}

function settingsSchema(defaults: DailyScheduleSettings) {
  return v.object({
    calendars: field(v.array(CalendarSourceSchema), [...defaults.calendars]),
    meetingNotePath: field(v.string(), defaults.meetingNotePath),
    meetingFilePattern: field(v.string(), defaults.meetingFilePattern),
    meetingTemplatePath: field(v.string(), defaults.meetingTemplatePath),
    refreshIntervalMinutes: field(v.number(), defaults.refreshIntervalMinutes),
    ignorePatterns: field(StringListSchema, [...defaults.ignorePatterns]),
    myEmails: field(StringListSchema, [...defaults.myEmails]),
    peopleFolders: field(StringListSchema, [...defaults.peopleFolders])
  })
}

/*
 * Plugin.loadData() returns untyped JSON from data.json. Validate each field
 * on its own, so one bad or outdated value falls back to its default and the
 * other saved settings survive.
 */
export function parseSettings(
  data: unknown,
  defaults: DailyScheduleSettings
): DailyScheduleSettings {
  const schema = v.fallback(settingsSchema(defaults), { ...defaults })
  return v.parse(schema, data ?? {})
}
