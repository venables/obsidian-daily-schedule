import { App, Notice } from "obsidian"

import type { ScheduleEvent } from "./calendar"
import { getCoreTemplatesFormats } from "./coreTemplates"
import {
  cleanTitle,
  ensureFolderExists,
  formatDate,
  meetingNotePath
} from "./helpers"
import type { ResolvedAttendee } from "./people"
import { loadTemplate, renderMeetingTemplate } from "./template"

export function buildMeetingNotePath(
  basePath: string,
  pattern: string,
  event: ScheduleEvent
): string {
  return meetingNotePath(basePath, pattern, event.start, event.title)
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

export async function createMeetingNote(
  app: App,
  notePath: string,
  templatePath: string,
  event: ScheduleEvent,
  attendees: readonly ResolvedAttendee[]
): Promise<void> {
  const existing = app.vault.getAbstractFileByPath(notePath)
  if (existing) {
    await app.workspace.openLinkText(notePath, "")
    void new Notice("Opened existing meeting note")
    return
  }

  // Render the full note (frontmatter included) BEFORE creating the file, so
  // the MarkdownView's first paint already sees frontmatter and mounts the
  // Properties widget. The previous flow (create an empty stub, open it, let
  // the core Templates plugin insert into the editor buffer) initialized the
  // view against empty content -- the widget stayed hidden until the user
  // navigated away and back, and every await was a race against user clicks.
  const content = await renderNoteContent(
    app,
    notePath,
    templatePath,
    event,
    attendees
  )
  await ensureFolderExists(app.vault, notePath)
  await app.vault.create(notePath, content)
  await app.workspace.openLinkText(notePath, "")
  void new Notice("Created meeting note")
}

async function renderNoteContent(
  app: App,
  notePath: string,
  templatePath: string,
  event: ScheduleEvent,
  attendees: readonly ResolvedAttendee[]
): Promise<string> {
  const raw = await loadTemplate(app, templatePath)
  if (raw === null) {
    return buildMeetingNoteContent(event, attendees)
  }
  return renderMeetingTemplate(
    raw,
    notePath,
    event,
    attendees,
    getCoreTemplatesFormats(app)
  )
}
