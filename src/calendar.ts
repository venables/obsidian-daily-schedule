import ICAL from "ical.js"
import { requestUrl } from "obsidian"

import { isSameDay } from "./helpers"
import type { CalendarSource } from "./settings"

export interface Attendee {
  readonly email: string
  readonly name: string | null
  readonly partstat: string | null
}

export interface ScheduleEvent {
  readonly uid: string
  readonly title: string
  readonly start: Date
  readonly end: Date | null
  readonly allDay: boolean
  readonly attendees: readonly Attendee[]
  readonly location: string | null
  readonly description: string | null
  readonly calendarName: string
  readonly calendarColor: string
}

function registerTimezones(root: ICAL.Component): void {
  for (const vtz of root.getAllSubcomponents("vtimezone")) {
    const tz = new ICAL.Timezone(vtz)
    if (!ICAL.TimezoneService.has(tz.tzid)) {
      ICAL.TimezoneService.register(tz)
    }
  }
}

// All-day events use VALUE=DATE, which iCal.js parses with `isDate=true` and
// no timezone. Build a local-midnight Date for the same calendar day so date
// comparisons and rendering reflect the ICS date regardless of viewer TZ.
function allDayToLocalDate(time: ICAL.Time): Date {
  return new Date(time.year, time.month - 1, time.day)
}

function isAllDayOnDate(allDayDate: Date, today: Date): boolean {
  return (
    allDayDate.getFullYear() === today.getFullYear() &&
    allDayDate.getMonth() === today.getMonth() &&
    allDayDate.getDate() === today.getDate()
  )
}

function readAttendees(component: ICAL.Component): readonly Attendee[] {
  const props = component.getAllProperties("attendee")
  return props.map((p) => {
    const raw = String(p.getFirstValue() ?? "")
    const email = raw.replace(/^mailto:/i, "").trim()
    return {
      email,
      name: p.getFirstParameter("cn") || null,
      partstat: p.getFirstParameter("partstat") || null
    }
  })
}

function readStatus(component: ICAL.Component): string | null {
  const value = component.getFirstPropertyValue("status")
  return value == null ? null : String(value)
}

function timeToDate(time: ICAL.Time): Date {
  if (time.isDate) {
    return allDayToLocalDate(time)
  }
  return time.toJSDate()
}

function buildScheduleEvent(
  event: ICAL.Event,
  source: ICAL.Event,
  start: ICAL.Time,
  end: ICAL.Time | null,
  calendarName: string,
  calendarColor: string
): ScheduleEvent {
  const allDay = start.isDate
  return {
    uid: event.uid,
    title: event.summary || "Untitled",
    start: timeToDate(start),
    end: end ? timeToDate(end) : null,
    allDay,
    attendees: readAttendees(source.component),
    location: event.location || null,
    description: event.description || null,
    calendarName,
    calendarColor
  }
}

function eventMatchesToday(start: ICAL.Time, today: Date): boolean {
  if (start.isDate) {
    return isAllDayOnDate(allDayToLocalDate(start), today)
  }
  return isSameDay(start.toJSDate(), today)
}

interface UidGroup {
  master: ICAL.Component | null
  overrides: ICAL.Component[]
}

function groupEventsByUid(root: ICAL.Component): Map<string, UidGroup> {
  const groups = new Map<string, UidGroup>()
  for (const ve of root.getAllSubcomponents("vevent")) {
    const uid = String(ve.getFirstPropertyValue("uid") ?? "")
    if (!uid) {
      continue
    }
    let group = groups.get(uid)
    if (!group) {
      group = { master: null, overrides: [] }
      groups.set(uid, group)
    }
    if (ve.hasProperty("recurrence-id")) {
      group.overrides.push(ve)
    } else {
      group.master = ve
    }
  }
  return groups
}

// ICAL.Event's default constructor auto-relates EVERY VEVENT with a
// RECURRENCE-ID in the parent VCALENDAR — regardless of UID. That pollution
// causes another event's override to shadow ours during iteration. Pass our
// own overrides explicitly and turn on strictExceptions to opt out.
function buildEvent(
  component: ICAL.Component,
  overrides: ICAL.Component[]
): ICAL.Event {
  return new ICAL.Event(component, {
    strictExceptions: true,
    exceptions: overrides
  })
}

function expandRecurringEvent(
  master: ICAL.Event,
  today: Date,
  todayEnd: Date,
  calendarName: string,
  calendarColor: string
): readonly ScheduleEvent[] {
  const results: ScheduleEvent[] = []
  const endTime = ICAL.Time.fromJSDate(todayEnd, false)

  try {
    const iter = master.iterator()
    let next = iter.next()
    while (next && next.compare(endTime) < 0) {
      const details = master.getOccurrenceDetails(next)
      const occurrenceEvent = details.item
      if (readStatus(occurrenceEvent.component) !== "CANCELLED") {
        if (eventMatchesToday(details.startDate, today)) {
          results.push(
            buildScheduleEvent(
              occurrenceEvent,
              occurrenceEvent,
              details.startDate,
              details.endDate,
              calendarName,
              calendarColor
            )
          )
        }
      }
      next = iter.next()
    }
  } catch (err) {
    console.warn(
      `[daily-schedule] Failed to expand RRULE for "${master.summary}":`,
      err
    )
  }

  return results
}

function expandEventsForToday(
  root: ICAL.Component,
  today: Date,
  calendarName: string,
  calendarColor: string
): readonly ScheduleEvent[] {
  const todayEnd = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() + 1
  )

  const results: ScheduleEvent[] = []

  for (const group of groupEventsByUid(root).values()) {
    if (group.master) {
      if (readStatus(group.master) === "CANCELLED") {
        continue
      }
      const master = buildEvent(group.master, group.overrides)
      if (master.isRecurring()) {
        results.push(
          ...expandRecurringEvent(
            master,
            today,
            todayEnd,
            calendarName,
            calendarColor
          )
        )
      } else if (eventMatchesToday(master.startDate, today)) {
        results.push(
          buildScheduleEvent(
            master,
            master,
            master.startDate,
            master.endDate,
            calendarName,
            calendarColor
          )
        )
      }
      continue
    }

    // Orphan overrides: master VEVENT not in the feed (rare, but iCloud and
    // some exporters do this). Treat each override as a single occurrence.
    for (const override of group.overrides) {
      if (readStatus(override) === "CANCELLED") {
        continue
      }
      const ev = buildEvent(override, [])
      if (eventMatchesToday(ev.startDate, today)) {
        results.push(
          buildScheduleEvent(
            ev,
            ev,
            ev.startDate,
            ev.endDate,
            calendarName,
            calendarColor
          )
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
      const jcal = ICAL.parse(response.text)
      const root = new ICAL.Component(jcal)
      registerTimezones(root)
      return expandEventsForToday(root, today, source.name, source.color)
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
