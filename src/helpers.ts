import { Vault } from "obsidian"

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

export function meetingNotePath(
  basePath: string,
  date: Date,
  title: string
): string {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, "0")
  const dateStr = formatDate(date)
  const clean = cleanTitle(title)
  return `${basePath}/${yyyy}/${mm}/${dateStr} - ${clean}.md`
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
