import { App, MarkdownView, Notice, TFile, type WorkspaceLeaf } from "obsidian"

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
  // The core path may have left an empty stub if its cleanup failed; reuse it
  // rather than throwing "file already exists" from a blind vault.create.
  const stub = app.vault.getAbstractFileByPath(notePath)
  if (stub instanceof TFile) {
    await app.vault.modify(stub, content)
  } else {
    await app.vault.create(notePath, content)
  }
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
  let openedLeaf: WorkspaceLeaf | null = null
  try {
    // insertTemplate inserts at the active editor's cursor, so make our new
    // file the active editor first.
    openedLeaf = app.workspace.getLeaf(false)
    await openedLeaf.openFile(created)
    await coreApi.insertTemplate(templateFile)

    // insertTemplate writes into the editor buffer, not directly to disk, so
    // the second pass must read/write through the editor. Read from the
    // leaf we opened rather than the active view -- a fast user click can
    // shift the active view between awaits, and silently leaving the note
    // with un-substituted placeholders is the bug we're trying to avoid.
    const view = openedLeaf.view
    if (!(view instanceof MarkdownView) || view.file?.path !== created.path) {
      throw new Error(
        `Editor for new note ${notePath} is unavailable after insertTemplate`
      )
    }
    const content = view.editor.getValue()
    // If the user clicked away to a different leaf during the await on
    // insertTemplate, the core plugin may have inserted into that other
    // editor and left ours empty. Bail out so the catch cleans up the stub
    // and the outer fallback renders the template ourselves.
    if (content === "") {
      throw new Error(
        `insertTemplate left ${notePath} empty (user click-away?)`
      )
    }
    const replaced = renderEventPlaceholders(content, event, attendees)
    if (replaced !== content) {
      view.editor.setValue(replaced)
    }
    // Force persistence so the rendered note lands on disk immediately
    // rather than waiting for the editor's autosave debounce. A user
    // closing the tab right after creation would otherwise lose the
    // second-pass substitutions.
    await view.save()
  } catch (err) {
    // Detach the leaf before deleting so the editor doesn't hold the soon-
    // to-be-removed file open as a broken tab. Only detach if the leaf
    // still shows our file -- a user click-away during the awaits could
    // have already pointed it at something else, and we shouldn't close
    // an unrelated tab. detach itself can throw if the leaf is already
    // gone -- swallow that so we still attempt deletion.
    try {
      const leafView = openedLeaf?.view
      if (
        leafView instanceof MarkdownView &&
        leafView.file?.path === created.path
      ) {
        openedLeaf?.detach()
      }
    } catch (detachErr) {
      console.error("[daily-schedule] Failed to detach leaf:", detachErr)
    }
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
