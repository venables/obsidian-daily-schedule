import { App, TFile } from "obsidian"

import type { ScheduleEvent } from "./calendar"
import { cleanTitle, formatDate, formatTime } from "./helpers"
import type { ResolvedAttendee } from "./people"

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

export function renderMeetingTemplate(
  template: string,
  event: ScheduleEvent,
  attendees: readonly ResolvedAttendee[]
): string {
  const values: Record<string, string> = {
    title: cleanTitle(event.title),
    date: formatDate(event.start),
    time: event.allDay ? "" : formatTime(event.start),
    endTime: event.allDay || !event.end ? "" : formatTime(event.end),
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
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    key in values ? values[key] : match
  )
}
