import { App, Notice, TFile } from "obsidian"

import type { ScheduleEvent } from "./calendar"
import { type CoreTemplatesAPI, getCoreTemplatesAPI } from "./coreTemplates"
import {
  cleanTitle,
  ensureFolderExists,
  formatDate,
  meetingNotePath
} from "./helpers"
import type { ResolvedAttendee } from "./people"
import {
  loadTemplate,
  renderCustomPlaceholders,
  renderMeetingTemplate
} from "./template"

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

  const trimmedTemplate = templatePath.trim()
  const templateFile = trimmedTemplate
    ? app.vault.getAbstractFileByPath(trimmedTemplate)
    : null
  const coreApi =
    templateFile instanceof TFile ? getCoreTemplatesAPI(app) : null

  await ensureFolderExists(app.vault, notePath)

  if (templateFile instanceof TFile && coreApi) {
    await createWithCoreTemplate(
      app,
      notePath,
      templateFile,
      coreApi,
      event,
      attendees
    )
    void new Notice("Created meeting note")
    return
  }

  const content = await renderFallbackContent(
    app,
    templateFile instanceof TFile ? templateFile : null,
    trimmedTemplate,
    event,
    attendees
  )
  await app.vault.create(notePath, content)
  await app.workspace.openLinkText(notePath, "")
  void new Notice("Created meeting note")
}

async function createWithCoreTemplate(
  app: App,
  notePath: string,
  templateFile: TFile,
  coreApi: CoreTemplatesAPI,
  event: ScheduleEvent,
  attendees: readonly ResolvedAttendee[]
): Promise<void> {
  const created = await app.vault.create(notePath, "")
  // Open with `openFile` rather than `openLinkText` because the core plugin's
  // insertTemplate inserts at the active editor's cursor -- we need a
  // deterministic active leaf before calling it.
  const leaf = app.workspace.getLeaf(false)
  await leaf.openFile(created)
  await coreApi.insertTemplate(templateFile)

  // Second pass for placeholders the core plugin doesn't know about
  // ({{attendees}}, {{location}}, etc.). Read from disk rather than the
  // editor so we don't depend on the editor view being in any particular
  // state after insertTemplate returns.
  const inserted = await app.vault.read(created)
  const replaced = renderCustomPlaceholders(inserted, event, attendees)
  if (replaced !== inserted) {
    await app.vault.modify(created, replaced)
  }
}

async function renderFallbackContent(
  app: App,
  templateFile: TFile | null,
  templatePath: string,
  event: ScheduleEvent,
  attendees: readonly ResolvedAttendee[]
): Promise<string> {
  // Resolved file present but core plugin missing -- read it ourselves.
  if (templateFile) {
    const raw = await loadTemplate(app, templatePath)
    if (raw !== null) {
      return renderMeetingTemplate(raw, event, attendees)
    }
  }
  return buildMeetingNoteContent(event, attendees)
}
