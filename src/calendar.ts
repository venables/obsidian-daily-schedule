import { requestUrl } from "obsidian"
import {
  convertIcsCalendar,
  extendByRecurrenceRule,
  getEventEnd,
  type IcsEvent,
  type IcsAttendee,
  type IcsDateObject
} from "ts-ics"

import { isSameDay } from "./helpers"
import type { CalendarSource } from "./settings"
import { instantFromTzWallClock } from "./timezone"

export interface ScheduleEvent {
  readonly uid: string
  readonly title: string
  readonly start: Date
  readonly end: Date | null
  readonly allDay: boolean
  readonly attendees: readonly IcsAttendee[]
  readonly location: string | null
  readonly description: string | null
  readonly calendarName: string
  readonly calendarColor: string
}

function icsDateToDate(d: IcsDateObject): Date {
  return d.date
}

function isAllDay(d: IcsDateObject): boolean {
  return d.type === "DATE"
}

// ts-ics parses VALUE=DATE as UTC midnight, so an event on April 22 becomes
// April 21 20:00 in Eastern Time. Rebuild the date at local midnight of the
// same calendar day so downstream date formatting/comparison reflects the
// ICS calendar date regardless of the viewer's timezone.
function normalizeAllDayDate(d: Date): Date {
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

function isAllDayOnDate(allDayDate: Date, today: Date): boolean {
  return (
    allDayDate.getUTCFullYear() === today.getFullYear() &&
    allDayDate.getUTCMonth() === today.getMonth() &&
    allDayDate.getUTCDate() === today.getDate()
  )
}

function computeEndDate(event: IcsEvent): Date | null {
  if (event.end) {
    return icsDateToDate(event.end)
  }
  if (!event.duration) {
    return null
  }

  try {
    return getEventEnd(event as Parameters<typeof getEventEnd>[0])
  } catch {
    return null
  }
}

function eventToScheduleEvent(
  event: IcsEvent,
  startDate: Date,
  calendarName: string,
  calendarColor: string
): ScheduleEvent {
  const allDay = isAllDay(event.start)

  // For recurring events, `startDate` is a new occurrence (e.g. today), but
  // `event.end` still points at the ORIGINAL event's end. Shift the end by
  // the delta between the original start and this occurrence so that e.g. a
  // daily 9:00-9:30 standup has end = today 9:30, not Jan 1 9:30.
  const originalStart = icsDateToDate(event.start)
  const originalEnd = computeEndDate(event)
  const durationMs =
    originalEnd && originalEnd.getTime() >= originalStart.getTime()
      ? originalEnd.getTime() - originalStart.getTime()
      : null
  const end: Date | null =
    durationMs !== null ? new Date(startDate.getTime() + durationMs) : null

  return {
    uid: event.uid,
    title: event.summary || "Untitled",
    start: allDay ? normalizeAllDayDate(startDate) : startDate,
    end: allDay && end ? normalizeAllDayDate(end) : end,
    allDay,
    attendees: event.attendees ?? [],
    location: event.location ?? null,
    description: event.description ?? null,
    calendarName,
    calendarColor
  }
}

function buildOverrideKey(uid: string, originalStart: Date): string {
  return `${uid}|${originalStart.getTime()}`
}

function hasMidnightUtcTime(d: Date): boolean {
  return (
    d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0
  )
}

// Workaround for a ts-ics bug: extendByRecurrenceRule strips the time-of-day
// from MONTHLY+BYDAY occurrences, returning them at 00:00 UTC. When DTSTART
// has a known TZID and the occurrence comes back at midnight UTC even though
// DTSTART isn't, re-anchor it to DTSTART's wall-clock time in DTSTART's
// timezone (the RFC 5545-correct behavior for TZID-bound rules). This also
// fixes downstream EXDATE matching and override suppression, both of which
// compare timestamps that the bug renders inconsistent.
function reanchorOccurrence(occ: Date, eventStart: IcsDateObject): Date {
  const tz = eventStart.local?.timezone
  const localStart = eventStart.local?.date
  if (!tz || !localStart) {
    return occ
  }
  if (!hasMidnightUtcTime(occ) || hasMidnightUtcTime(eventStart.date)) {
    return occ
  }
  return instantFromTzWallClock(
    occ.getUTCFullYear(),
    occ.getUTCMonth(),
    occ.getUTCDate(),
    localStart.getUTCHours(),
    localStart.getUTCMinutes(),
    localStart.getUTCSeconds(),
    tz
  )
}

function collectOverriddenOccurrences(
  events: readonly IcsEvent[]
): ReadonlySet<string> {
  const keys = new Set<string>()
  for (const event of events) {
    if (event.recurrenceId) {
      keys.add(buildOverrideKey(event.uid, event.recurrenceId.value.date))
    }
  }
  return keys
}

function expandEventsForToday(
  events: readonly IcsEvent[],
  today: Date,
  calendarName: string,
  calendarColor: string
): readonly ScheduleEvent[] {
  const todayEnd = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() + 1
  )

  // Overrides (VEVENTs with RECURRENCE-ID) replace a single occurrence of
  // their master. Suppress the original occurrence here so the override's own
  // VEVENT — processed below at its new DTSTART — is the only one that shows.
  const overriddenOccurrences = collectOverriddenOccurrences(events)

  const results: ScheduleEvent[] = []

  for (const event of events) {
    if (event.status === "CANCELLED") {
      continue
    }

    const eventStart = icsDateToDate(event.start)
    const allDay = isAllDay(event.start)
    const matchesToday = (d: Date) =>
      allDay ? isAllDayOnDate(d, today) : isSameDay(d, today)

    if (event.recurrenceRule) {
      const exceptionDates = (event.exceptionDates ?? []).map((ex) => ex.date)
      const exceptionTimes = new Set(exceptionDates.map((d) => d.getTime()))
      try {
        const occurrences = extendByRecurrenceRule(event.recurrenceRule, {
          start: eventStart,
          end: todayEnd,
          exceptions: exceptionDates
        })
        for (const occ of occurrences) {
          const adjusted = reanchorOccurrence(occ, event.start)
          // Re-check exceptions against the adjusted instant: ts-ics drops
          // EXDATE matches when its expansion strips the time-of-day, since
          // the parsed EXDATE timestamps then no longer line up.
          if (exceptionTimes.has(adjusted.getTime())) {
            continue
          }
          if (
            overriddenOccurrences.has(buildOverrideKey(event.uid, adjusted))
          ) {
            continue
          }
          if (matchesToday(adjusted)) {
            results.push(
              eventToScheduleEvent(event, adjusted, calendarName, calendarColor)
            )
          }
        }
      } catch (err) {
        console.warn(
          `[daily-schedule] Failed to expand RRULE for "${event.summary}":`,
          err
        )
        if (matchesToday(eventStart)) {
          results.push(
            eventToScheduleEvent(event, eventStart, calendarName, calendarColor)
          )
        }
      }
    } else {
      if (matchesToday(eventStart)) {
        results.push(
          eventToScheduleEvent(event, eventStart, calendarName, calendarColor)
        )
      }
    }
  }

  return results
}

export async function fetchCalendarEvents(
  sources: readonly CalendarSource[]
): Promise<readonly ScheduleEvent[]> {
  const allEvents: ScheduleEvent[] = []
  const today = new Date()

  const results = await Promise.allSettled(
    sources.map(async (source) => {
      const response = await requestUrl({ url: source.url })
      const calendar = convertIcsCalendar(undefined, response.text)
      const events = calendar.events ?? []
      return expandEventsForToday(events, today, source.name, source.color)
    })
  )

  for (const result of results) {
    if (result.status === "fulfilled") {
      allEvents.push(...result.value)
    } else {
      console.error("[daily-schedule] Failed to fetch calendar:", result.reason)
    }
  }

  const deduped = [...deduplicateByUid(allEvents)]
  return deduped.toSorted((a, b) => {
    if (a.allDay && !b.allDay) {
      return -1
    }
    if (!a.allDay && b.allDay) {
      return 1
    }
    return a.start.getTime() - b.start.getTime()
  })
}

export function filterIgnoredEvents(
  events: readonly ScheduleEvent[],
  ignorePatterns: readonly string[]
): readonly ScheduleEvent[] {
  const lowerPatterns = ignorePatterns
    .map((p) => p.toLowerCase())
    .filter(Boolean)
  if (lowerPatterns.length === 0) {
    return events
  }
  return events.filter((e) => {
    const title = e.title.toLowerCase()
    return !lowerPatterns.some((pattern) => title.includes(pattern))
  })
}

function deduplicateByUid(
  events: readonly ScheduleEvent[]
): readonly ScheduleEvent[] {
  const seen = new Set<string>()
  return events.filter((e) => {
    const key = `${e.uid}-${e.start.getTime()}`
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}
