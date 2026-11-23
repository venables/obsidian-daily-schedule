import * as v from "valibot"

import type { CalendarFeed } from "./calendar"
import type { CalendarSource } from "./settings"

/*
 * Calendar ICS URLs carry a private token, so the plugin keeps them in
 * Obsidian's SecretStorage and saves only the secret ID in data.json.
 */

export interface PendingSecret {
  readonly id: string
  readonly value: string
}

interface ConvertedCalendar {
  readonly entry: unknown
  readonly secret?: PendingSecret
}

interface Migration {
  readonly data: unknown
  readonly secrets: readonly PendingSecret[]
}

const LegacyCalendarSchema = v.object({
  name: v.string(),
  url: v.string(),
  color: v.string()
})

const StoredDataSchema = v.looseObject({
  calendars: v.array(v.unknown())
})

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

function uniqueSecretId(name: string, taken: ReadonlySet<string>): string {
  const slug = slugify(name)
  const base = slug ? `calendar-${slug}` : "calendar"
  const candidates = [
    base,
    ...Array.from({ length: taken.size + 1 }, (_, i) => `${base}-${i + 2}`)
  ]
  return candidates.find((id) => !taken.has(id)) ?? base
}

/*
 * Converts calendars in order, so each new secret ID is unique against the
 * existing IDs and the IDs given to earlier calendars.
 */
function convertCalendars(
  entries: readonly unknown[],
  taken: ReadonlySet<string>
): readonly ConvertedCalendar[] {
  if (entries.length === 0) {
    return []
  }
  const [first, ...rest] = entries
  const legacy = v.safeParse(LegacyCalendarSchema, first)
  if (!legacy.success) {
    return [{ entry: first }, ...convertCalendars(rest, taken)]
  }
  const { name, url, color } = legacy.output
  const id = uniqueSecretId(name, taken)
  return [
    { entry: { name, urlSecret: id, color }, secret: { id, value: url } },
    ...convertCalendars(rest, new Set([...taken, id]))
  ]
}

/*
 * Moves each plain `url` from saved calendar data into a new secret, and
 * replaces it with a `urlSecret` reference. Returns the rewritten data and
 * the secrets to store.
 */
export function migrateCalendarUrls(
  data: unknown,
  existingSecretIds: readonly string[]
): Migration {
  const stored = v.safeParse(StoredDataSchema, data)
  if (!stored.success) {
    return { data, secrets: [] }
  }

  const converted = convertCalendars(
    stored.output.calendars,
    new Set(existingSecretIds)
  )
  const secrets = converted.flatMap((c) => (c.secret ? [c.secret] : []))

  return secrets.length === 0
    ? { data, secrets: [] }
    : {
        data: { ...stored.output, calendars: converted.map((c) => c.entry) },
        secrets
      }
}

export function resolveCalendarFeeds(
  calendars: readonly CalendarSource[],
  getSecret: (id: string) => string | null
): {
  readonly feeds: readonly CalendarFeed[]
  readonly missing: readonly string[]
} {
  const resolved = calendars.map((cal) => ({
    cal,
    url: cal.urlSecret ? getSecret(cal.urlSecret) : null
  }))
  return {
    feeds: resolved.flatMap(({ cal, url }) =>
      url ? [{ name: cal.name, url, color: cal.color }] : []
    ),
    missing: resolved.flatMap(({ cal, url }) => (url ? [] : [cal.name]))
  }
}
