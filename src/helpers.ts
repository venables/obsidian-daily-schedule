import type { Moment } from "moment"
import { Vault, moment as momentModule } from "obsidian"

// Obsidian exports moment as `typeof Moment` (the namespace), which TypeScript
// doesn't treat as callable even though the runtime value is the callable
// moment function. Widen to include a call signature so we can invoke it.
type CallableMoment = typeof momentModule & ((input: Date) => Moment)
// eslint-disable-next-line typescript-eslint/no-unsafe-type-assertion -- moment at runtime is a callable fn, but its TS type is a namespace
const moment = momentModule as unknown as CallableMoment

const EMOJI_RE = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu
const UNSAFE_FILENAME_RE = /[/\\:*?"<>|]/g

export function removeEmoji(str: string): string {
  return str.replace(EMOJI_RE, "").trim()
}

export function cleanTitle(title: string): string {
  return removeEmoji(title)
    .replace(UNSAFE_FILENAME_RE, "-")
    .replace(/\s+/g, " ")
    .trim()
}

export function formatDate(date: Date): string {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, "0")
  const dd = String(date.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
}

export const DEFAULT_MEETING_FILE_PATTERN = "YYYY/MM/YYYY-MM-DD - {{title}}"

export function meetingNotePath(
  basePath: string,
  pattern: string,
  date: Date,
  title: string
): string {
  const effectivePattern =
    pattern.trim() === "" ? DEFAULT_MEETING_FILE_PATTERN : pattern.trim()

  // Split on the only non-date placeholder so the title can contain characters
  // (e.g. M, D) that would otherwise be consumed as Moment format tokens.
  const m = moment(date)
  const formatted = effectivePattern
    .split("{{title}}")
    .map((segment) => m.format(segment))
    .join(cleanTitle(title))

  const trimmedBase = basePath.replace(/\/+$/, "")
  const trimmedFile = formatted.replace(/^\/+/, "")
  const withExt = trimmedFile.endsWith(".md")
    ? trimmedFile
    : `${trimmedFile}.md`
  return trimmedBase ? `${trimmedBase}/${withExt}` : withExt
}

export async function ensureFolderExists(
  vault: Vault,
  filePath: string
): Promise<void> {
  const folderPath = filePath.split("/").slice(0, -1).join("/")
  if (!folderPath) {
    return
  }

  const parts = folderPath.split("/")
  let current = ""
  for (const part of parts) {
    current = current ? `${current}/${part}` : part
    if (!vault.getAbstractFileByPath(current)) {
      // eslint-disable-next-line no-await-in-loop -- parent folders must exist before children
      await vault.createFolder(current)
    }
  }
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}
