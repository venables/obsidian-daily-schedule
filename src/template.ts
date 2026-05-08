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

// Event-derived placeholders we always own. The core Templates plugin's
// {{title}} / {{date}} / {{time}} are deliberately kept distinct so users can
// pick "this event" (event*) or "right now / this file" (core) without overlap.
export const EVENT_PLACEHOLDERS = [
  "eventTitle",
  "eventDate",
  "eventTime",
  "eventEndTime",
  "eventLocation",
  "eventDescription",
  "eventAttendees",
  "eventAttendeesYaml"
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

// Full render used when the core Templates plugin isn't available -- handles
// both event* placeholders AND replicates the core plugin's {{title}}, {{date}},
// {{time}} (with optional :FORMAT) so a single template renders identically
// either way.
export function renderMeetingTemplate(
  template: string,
  notePath: string,
  event: ScheduleEvent,
  attendees: readonly ResolvedAttendee[]
): string {
  const withCore = renderCoreEquivalentPlaceholders(template, notePath)
  return renderEventPlaceholders(withCore, event, attendees)
}

// Substitutes only the event* placeholders. Used after the core plugin's
// insertTemplate has filled in {{title}} / {{date}} / {{time}}.
export function renderEventPlaceholders(
  template: string,
  event: ScheduleEvent,
  attendees: readonly ResolvedAttendee[]
): string {
  const startMoment = moment(event.start)
  const endMoment = event.end ? moment(event.end) : null

  const withFormatted = template.replace(
    /\{\{(eventDate|eventTime|eventEndTime)(?::([^}]+))?\}\}/g,
    (match, key: string, fmt: string | undefined) => {
      switch (key) {
        case "eventDate":
          return fmt ? startMoment.format(fmt) : formatDate(event.start)
        case "eventTime":
          if (event.allDay) {
            return ""
          }
          return fmt ? startMoment.format(fmt) : formatTime(event.start)
        case "eventEndTime":
          if (event.allDay || !endMoment || !event.end) {
            return ""
          }
          return fmt ? endMoment.format(fmt) : formatTime(event.end)
        default:
          return match
      }
    }
  )

  const values: Record<string, string> = {
    eventTitle: cleanTitle(event.title),
    eventLocation: event.location ?? "",
    eventDescription: event.description ?? "",
    eventAttendees: attendees.map((a) => a.wikiLink ?? a.name).join(", "),
    // Leading newline so inline use (`attendees: {{eventAttendeesYaml}}`)
    // expands to a properly-indented YAML block. Empty stays empty so the
    // inline form renders as `attendees: ` (null) instead of a dangling
    // newline.
    eventAttendeesYaml:
      attendees.length === 0
        ? ""
        : "\n" +
          attendees
            .map((a) => (a.wikiLink ? `  - "${a.wikiLink}"` : `  - ${a.email}`))
            .join("\n")
  }

  // Unknown placeholders are left untouched so typos are visible instead of
  // silently dropped. Matches the behavior of Obsidian's core Templates plugin.
  return withFormatted.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    key in values ? values[key] : match
  )
}

// Replicates the core Templates plugin's substitutions for {{title}},
// {{date}}, {{date:FORMAT}}, {{time}}, {{time:FORMAT}}. {{title}} maps to the
// note's filename basename (matching the core plugin); {{date}} / {{time}} use
// the current clock with sensible defaults that match the core plugin's
// out-of-the-box behavior.
function renderCoreEquivalentPlaceholders(
  template: string,
  notePath: string
): string {
  const basename = notePath.split("/").pop()?.replace(/\.md$/i, "") ?? ""
  const now = moment(new Date())

  return template.replace(
    /\{\{(title|date|time)(?::([^}]+))?\}\}/g,
    (match, key: string, fmt: string | undefined) => {
      switch (key) {
        case "title":
          return basename
        case "date":
          return now.format(fmt ?? "YYYY-MM-DD")
        case "time":
          return now.format(fmt ?? "HH:mm")
        default:
          return match
      }
    }
  )
}
