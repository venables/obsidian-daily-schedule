import { App, TFile, TFolder } from "obsidian"

import { buildEmailMap, type EmailMap } from "./people"

export interface BackfillResult {
  readonly filesScanned: number
  readonly filesUpdated: number
  readonly attendeesRelinked: number
}

export async function backfillAttendeeLinks(
  app: App,
  meetingFolderPath: string,
  peopleFolders: readonly string[]
): Promise<BackfillResult> {
  const emailMap = buildEmailMap(app, peopleFolders)
  const folder = app.vault.getAbstractFileByPath(meetingFolderPath)
  if (!(folder instanceof TFolder) || emailMap.size === 0) {
    return { filesScanned: 0, filesUpdated: 0, attendeesRelinked: 0 }
  }

  const files = collectMarkdownFiles(folder)
  let filesUpdated = 0
  let attendeesRelinked = 0

  for (const file of files) {
    const cache = app.metadataCache.getFileCache(file)
    if (!hasLinkableRawEmail(cache?.frontmatter, emailMap)) {
      continue
    }

    // eslint-disable-next-line no-await-in-loop -- sequential writes avoid
    // racing Obsidian's file handle; total I/O is bounded by match count
    const original = await app.vault.read(file)
    const { content, changes } = rewriteAttendeesBlock(original, emailMap)
    if (changes === 0) {
      continue
    }
    // eslint-disable-next-line no-await-in-loop -- see above
    await app.vault.modify(file, content)
    filesUpdated += 1
    attendeesRelinked += changes
  }

  return { filesScanned: files.length, filesUpdated, attendeesRelinked }
}

function collectMarkdownFiles(folder: TFolder): readonly TFile[] {
  const out: TFile[] = []
  for (const child of folder.children) {
    if (child instanceof TFolder) {
      out.push(...collectMarkdownFiles(child))
    } else if (child instanceof TFile && child.extension === "md") {
      out.push(child)
    }
  }
  return out
}

// Pre-flight check against the metadata cache so we skip a disk read whenever
// the frontmatter has no raw-email attendees that currently resolve.
function hasLinkableRawEmail(
  frontmatter: Record<string, unknown> | undefined,
  emailMap: EmailMap
): boolean {
  const attendees = frontmatter?.attendees
  if (!Array.isArray(attendees)) {
    return false
  }
  return attendees.some(
    (a) =>
      typeof a === "string" &&
      a.includes("@") &&
      emailMap.has(a.toLowerCase().trim())
  )
}

export function rewriteAttendeesBlock(
  content: string,
  emailMap: EmailMap
): { readonly content: string; readonly changes: number } {
  const lines = content.split("\n")
  let inBlock = false
  let changes = 0

  const rewritten = lines.map((line) => {
    if (/^attendees:\s*$/.test(line)) {
      inBlock = true
      return line
    }
    if (inBlock && !/^\s+-\s/.test(line)) {
      inBlock = false
      return line
    }
    if (!inBlock) {
      return line
    }

    const replacement = rewriteAttendeeLine(line, emailMap)
    if (replacement === null) {
      return line
    }
    changes += 1
    return replacement
  })

  return { content: rewritten.join("\n"), changes }
}

// Character class excludes `"`, `[`, `]`, whitespace — this ensures wiki-link
// lines (`  - "[[Alice]]"`) can't match, while bare or quoted raw emails do.
const RAW_EMAIL_LINE_RE = /^(\s*-\s+)"?([^\s"[\]]+@[^\s"[\]]+)"?\s*$/

export function rewriteAttendeeLine(
  line: string,
  emailMap: EmailMap
): string | null {
  const match = line.match(RAW_EMAIL_LINE_RE)
  if (!match) {
    return null
  }
  const [, prefix, email] = match
  const name = emailMap.get(email.toLowerCase().trim())
  if (!name) {
    return null
  }
  return `${prefix}"[[${name}]]"`
}
