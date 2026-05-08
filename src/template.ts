import type { Moment } from "moment"
import { App, TFile, moment as momentModule } from "obsidian"

import type { ScheduleEvent } from "./calendar"
import { cleanTitle, formatDate, formatTime } from "./helpers"
import type { ResolvedAttendee } from "./people"

// Mirrors the moment cast in helpers.ts -- runtime is a callable fn but the TS
// type is a namespace.
type CallableMoment = typeof momentModule & ((input: Date) => Moment)
// eslint-disable-next-line typescript-eslint/no-unsafe-type-assertion -- moment at runtime is a callable fn, but its TS type is a namespace
const moment = momentModule as unknown as CallableMoment

export const SUPPORTED_PLACEHOLDERS = [
  "title",
  "date",
  "time",
  "endTime",
  "location",
  "description",
  "attendees",
  "attendeesYaml"
] as const

export async function loadTemplate(
  app: App,
  path: string
): Promise<string | null> {
  const trimmed = path.trim()
  if (!trimmed) {
    return null
  }
  const file = app.vault.getAbstractFileByPath(trimmed)
  if (!(file instanceof TFile)) {
    return null
  }
  try {
    return await app.vault.read(file)
  } catch (err) {
    console.error("[daily-schedule] Failed to read template:", err)
    return null
  }
}

// Full render used when the core Templates plugin isn't available -- runs both
// passes ourselves so the user still gets {{date:FORMAT}} support.
export function renderMeetingTemplate(
  template: string,
  event: ScheduleEvent,
  attendees: readonly ResolvedAttendee[]
): string {
  const withBuiltins = renderBuiltinPlaceholders(template, event)
  return renderCustomPlaceholders(withBuiltins, event, attendees)
}

// Substitutes only the placeholders the core Templates plugin doesn't know
// about. Used after `insertTemplate` runs so we don't double-process
// {{title}} / {{date}} / {{time}}.
export function renderCustomPlaceholders(
  template: string,
  event: ScheduleEvent,
  attendees: readonly ResolvedAttendee[]
): string {
  const endMoment = event.end ? moment(event.end) : null

  // endTime supports an optional :FORMAT, like time/date.
  const withEndTime = template.replace(
    /\{\{endTime(?::([^}]+))?\}\}/g,
    (_match, fmt: string | undefined) => {
      if (event.allDay || !endMoment || !event.end) {
        return ""
      }
      return fmt ? endMoment.format(fmt) : formatTime(event.end)
    }
  )

  const values: Record<string, string> = {
    location: event.location ?? "",
    description: event.description ?? "",
    attendees: attendees.map((a) => a.wikiLink ?? a.name).join(", "),
    // Leading newline so inline use (`attendees: {{attendeesYaml}}`) expands
    // to a properly-indented YAML block. Empty stays empty so the inline
    // form renders as `attendees: ` (null) instead of a dangling newline.
    attendeesYaml:
      attendees.length === 0
        ? ""
        : "\n" +
          attendees
            .map((a) => (a.wikiLink ? `  - "${a.wikiLink}"` : `  - ${a.email}`))
            .join("\n")
  }

  // Unknown placeholders are left untouched so typos are visible instead of
  // silently dropped. Matches the behavior of Obsidian's core Templates plugin.
  return withEndTime.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    key in values ? values[key] : match
  )
}

// Replicates the core Templates plugin's substitutions for {{title}},
// {{date}}, {{date:FORMAT}}, {{time}}, {{time:FORMAT}}. Only used when the
// core plugin isn't enabled.
function renderBuiltinPlaceholders(
  template: string,
  event: ScheduleEvent
): string {
  const startMoment = moment(event.start)
  return template.replace(
    /\{\{(title|date|time)(?::([^}]+))?\}\}/g,
    (match, key: string, fmt: string | undefined) => {
      switch (key) {
        case "title":
          return cleanTitle(event.title)
        case "date":
          return fmt ? startMoment.format(fmt) : formatDate(event.start)
        case "time":
          if (event.allDay) {
            return ""
          }
          return fmt ? startMoment.format(fmt) : formatTime(event.start)
        default:
          return match
      }
    }
  )
}
