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
  renderEventPlaceholders,
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
    try {
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
    } catch (err) {
      console.error(
        "[daily-schedule] Core templates path failed; falling back",
        err
      )
      // Fall through to the fallback renderer below.
    }
  }

  const content = await renderFallbackContent(
    app,
    notePath,
    templateFile instanceof TFile ? trimmedTemplate : "",
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
  try {
    // insertTemplate inserts at the active editor's cursor, so make our new
    // file the active editor first.
    const leaf = app.workspace.getLeaf(false)
    await leaf.openFile(created)
    await coreApi.insertTemplate(templateFile)

    // insertTemplate writes into the editor buffer, not directly to disk.
    // vault.process is editor-aware: if the file is open in an editor it
    // operates on the editor's content and writes back through it, which
    // avoids the race a plain vault.read/modify would lose.
    await app.vault.process(created, (data) =>
      renderEventPlaceholders(data, event, attendees)
    )
  } catch (err) {
    // Don't leave an empty stub behind -- the next click would early-return on
    // existence and silently open a blank note.
    await app.vault.delete(created).catch((delErr) => {
      console.error("[daily-schedule] Failed to clean up empty stub:", delErr)
    })
    throw err
  }
}

async function renderFallbackContent(
  app: App,
  notePath: string,
  templatePath: string,
  event: ScheduleEvent,
  attendees: readonly ResolvedAttendee[]
): Promise<string> {
  if (templatePath) {
    const raw = await loadTemplate(app, templatePath)
    if (raw !== null) {
      return renderMeetingTemplate(raw, notePath, event, attendees)
    }
  }
  return buildMeetingNoteContent(event, attendees)
}
