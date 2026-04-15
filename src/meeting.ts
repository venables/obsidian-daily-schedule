import { App, Notice } from "obsidian"

import type { ScheduleEvent } from "./calendar"
import {
  cleanTitle,
  ensureFolderExists,
  formatDate,
  meetingNotePath
} from "./helpers"
import type { ResolvedAttendee } from "./people"

export function buildMeetingNotePath(
  basePath: string,
  event: ScheduleEvent
): string {
  return meetingNotePath(basePath, event.start, event.title)
}

export function buildMeetingNoteContent(
  event: ScheduleEvent,
  attendees: readonly ResolvedAttendee[]
): string {
  const dateStr = formatDate(event.start)
  const title = cleanTitle(event.title)

  const attendeeYaml = attendees
    .map((a) => (a.wikiLink ? `  - "${a.wikiLink}"` : `  - ${a.email}`))
    .join("\n")

  const attendeeInline = attendees.map((a) => a.wikiLink ?? a.name).join(", ")

  const lines = [
    "---",
    "type: meeting",
    `date: ${dateStr}`,
    `title: "${title}"`
  ]

  if (attendees.length > 0) {
    lines.push("attendees:")
    lines.push(attendeeYaml)
  }

  lines.push("tags:")
  lines.push("  - meetings")
  lines.push("---")
  lines.push("")
  lines.push(`# ${title}`)
  lines.push("")
  lines.push(`**Date**: ${dateStr}`)

  if (attendees.length > 0) {
    lines.push(`**Attendees**: ${attendeeInline}`)
  }

  if (event.location) {
    lines.push(`**Location**: ${event.location}`)
  }

  lines.push("")
  lines.push("## Agenda")
  lines.push("")
  lines.push("")
  lines.push("## Notes")
  lines.push("")
  lines.push("")
  lines.push("## Action Items")
  lines.push("")
  lines.push("- [ ] ")
  lines.push("")

  return lines.join("\n")
}

export async function createOrOpenMeetingNote(
  app: App,
  notePath: string,
  content: string
): Promise<void> {
  const existing = app.vault.getAbstractFileByPath(notePath)

  if (existing) {
    await app.workspace.openLinkText(notePath, "")
    void new Notice("Opened existing meeting note")
    return
  }

  await ensureFolderExists(app.vault, notePath)
  await app.vault.create(notePath, content)
  await app.workspace.openLinkText(notePath, "")
  void new Notice("Created meeting note")
}
