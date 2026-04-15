import { App, TFile, TFolder } from "obsidian"

export type EmailMap = ReadonlyMap<string, string>

export function buildEmailMap(
  app: App,
  peopleFolders: readonly string[]
): EmailMap {
  const map = new Map<string, string>()

  for (const folderPath of peopleFolders) {
    const folder = app.vault.getAbstractFileByPath(folderPath)
    if (!(folder instanceof TFolder)) {
      continue
    }

    for (const child of folder.children) {
      if (!(child instanceof TFile) || child.extension !== "md") {
        continue
      }

      const cache = app.metadataCache.getFileCache(child)
      if (!cache?.frontmatter) {
        continue
      }

      const emails = extractEmails(cache.frontmatter)
      for (const email of emails) {
        map.set(email, child.basename)
      }
    }
  }

  return map
}

function extractEmails(
  frontmatter: Record<string, unknown>
): readonly string[] {
  const results: string[] = []

  const emailField = frontmatter.email
  const emailsField = frontmatter.emails

  for (const field of [emailField, emailsField]) {
    if (!field) {
      continue
    }
    if (typeof field === "string") {
      results.push(field.toLowerCase().trim())
    } else if (Array.isArray(field)) {
      for (const item of field) {
        if (typeof item === "string") {
          results.push(item.toLowerCase().trim())
        }
      }
    }
  }

  return results
}

export interface ResolvedAttendee {
  readonly name: string
  readonly email: string
  readonly wikiLink: string | null
}

export function resolveAttendees(
  attendees: readonly { readonly email: string; readonly name?: string }[],
  emailMap: EmailMap,
  myEmails: readonly string[]
): readonly ResolvedAttendee[] {
  const myEmailSet = new Set(
    myEmails.map((e) => e.toLowerCase().trim()).filter(Boolean)
  )
  const seen = new Set<string>()

  return attendees
    .filter((a) => {
      const email = a.email.toLowerCase().trim()
      if (myEmailSet.has(email)) {
        return false
      }
      if (seen.has(email)) {
        return false
      }
      seen.add(email)
      return true
    })
    .map((a) => {
      const email = a.email.toLowerCase().trim()
      const personName = emailMap.get(email)

      if (personName) {
        return { name: personName, email, wikiLink: `[[${personName}]]` }
      }

      const displayName = a.name?.trim() || email.split("@")[0]
      return { name: displayName, email, wikiLink: null }
    })
}
