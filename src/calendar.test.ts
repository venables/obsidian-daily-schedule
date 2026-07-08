import ICAL from "ical.js"
import { describe, expect, test } from "vitest"

import {
  expandEventsForToday,
  filterIgnoredEvents,
  type ScheduleEvent
} from "./calendar"

// Fixed reference day for every fixture: Tuesday, 2026-07-07. Fixtures use
// floating (no TZID, no Z) DTSTART values so they resolve to local time and
// stay deterministic regardless of the machine's timezone.
const TODAY = new Date(2026, 6, 7)

function ics(...vevents: string[]): ICAL.Component {
  const body = vevents.map((v) => `BEGIN:VEVENT\n${v}\nEND:VEVENT`).join("\n")
  const raw = `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//test//EN\n${body}\nEND:VCALENDAR`
  return new ICAL.Component(ICAL.parse(raw))
}

function expand(root: ICAL.Component): readonly ScheduleEvent[] {
  return expandEventsForToday(root, TODAY, "Work", "#abc")
}

describe("expandEventsForToday: single events", () => {
  test("returns a non-recurring event scheduled today", () => {
    const events = expand(
      ics(
        [
          "UID:a@x",
          "SUMMARY:Standup",
          "DTSTART:20260707T090000",
          "DTEND:20260707T093000"
        ].join("\n")
      )
    )
    expect(events).toHaveLength(1)
    expect(events[0].title).toBe("Standup")
    expect(events[0].start.getHours()).toBe(9)
    expect(events[0].allDay).toBe(false)
  })

  test("excludes a non-recurring event scheduled yesterday", () => {
    const events = expand(
      ics(
        ["UID:a@x", "SUMMARY:Yesterday", "DTSTART:20260706T090000"].join("\n")
      )
    )
    expect(events).toHaveLength(0)
  })

  test("returns an all-day event on today's date with a local-midnight start", () => {
    const events = expand(
      ics(
        ["UID:a@x", "SUMMARY:Holiday", "DTSTART;VALUE=DATE:20260707"].join("\n")
      )
    )
    expect(events).toHaveLength(1)
    expect(events[0].allDay).toBe(true)
    expect(events[0].start.getFullYear()).toBe(2026)
    expect(events[0].start.getMonth()).toBe(6)
    expect(events[0].start.getDate()).toBe(7)
    expect(events[0].start.getHours()).toBe(0)
  })

  test("skips a cancelled event", () => {
    const events = expand(
      ics(
        [
          "UID:a@x",
          "SUMMARY:Cancelled",
          "STATUS:CANCELLED",
          "DTSTART:20260707T090000"
        ].join("\n")
      )
    )
    expect(events).toHaveLength(0)
  })
})

describe("expandEventsForToday: recurrence", () => {
  test("expands a daily RRULE to exactly one occurrence today, preserving wall-clock time", () => {
    const events = expand(
      ics(
        [
          "UID:a@x",
          "SUMMARY:Daily standup",
          "DTSTART:20260701T091500",
          "RRULE:FREQ=DAILY"
        ].join("\n")
      )
    )
    expect(events).toHaveLength(1)
    expect(events[0].start.getHours()).toBe(9)
    expect(events[0].start.getMinutes()).toBe(15)
    expect(events[0].start.getDate()).toBe(7)
  })

  test("honors a RECURRENCE-ID override that reschedules today's occurrence", () => {
    const events = expand(
      ics(
        [
          "UID:a@x",
          "SUMMARY:Daily standup",
          "DTSTART:20260701T090000",
          "RRULE:FREQ=DAILY"
        ].join("\n"),
        [
          "UID:a@x",
          "SUMMARY:Daily standup (moved)",
          "RECURRENCE-ID:20260707T090000",
          "DTSTART:20260707T140000",
          "DTEND:20260707T150000"
        ].join("\n")
      )
    )
    expect(events).toHaveLength(1)
    expect(events[0].start.getHours()).toBe(14)
    expect(events[0].title).toBe("Daily standup (moved)")
  })

  test("does not let one UID's override shadow another UID's series", () => {
    const events = expand(
      ics(
        [
          "UID:a@x",
          "SUMMARY:Series A",
          "DTSTART:20260701T090000",
          "RRULE:FREQ=DAILY"
        ].join("\n"),
        [
          "UID:b@x",
          "SUMMARY:Series B",
          "DTSTART:20260701T110000",
          "RRULE:FREQ=DAILY"
        ].join("\n"),
        [
          "UID:b@x",
          "SUMMARY:Series B (moved)",
          "RECURRENCE-ID:20260707T110000",
          "DTSTART:20260707T150000"
        ].join("\n")
      )
    )
    const hours = events
      .map((e) => e.start.getHours())
      .toSorted((a, b) => a - b)
    // A stays at 09:00 (unpolluted); B's today occurrence is the 15:00 override.
    expect(hours).toEqual([9, 15])
  })

  test("returns an orphan RECURRENCE-ID override (no master in the feed) once", () => {
    const events = expand(
      ics(
        [
          "UID:a@x",
          "SUMMARY:Orphan occurrence",
          "RECURRENCE-ID:20260707T090000",
          "DTSTART:20260707T090000"
        ].join("\n")
      )
    )
    expect(events).toHaveLength(1)
    expect(events[0].title).toBe("Orphan occurrence")
    expect(events[0].start.getHours()).toBe(9)
  })
})

describe("expandEventsForToday: recurrence windowing", () => {
  test("still returns today's occurrence for a years-old daily series", () => {
    const events = expand(
      ics(
        [
          "UID:a@x",
          "SUMMARY:Ancient standup",
          "DTSTART:20230101T090000",
          "RRULE:FREQ=DAILY"
        ].join("\n")
      )
    )
    expect(events).toHaveLength(1)
    expect(events[0].start.getDate()).toBe(7)
    expect(events[0].start.getHours()).toBe(9)
  })

  test("catches an override that moves an occurrence from within the lookback onto today", () => {
    // Original recurrence 10 days ago, moved onto today: falls inside the
    // 32-day lookback window, so it is still found.
    const events = expand(
      ics(
        [
          "UID:a@x",
          "SUMMARY:Daily standup",
          "DTSTART:20230101T090000",
          "RRULE:FREQ=DAILY"
        ].join("\n"),
        [
          "UID:a@x",
          "SUMMARY:Moved forward",
          "RECURRENCE-ID:20260627T090000",
          "DTSTART:20260707T083000"
        ].join("\n")
      )
    )
    const moved = events.find((e) => e.title === "Moved forward")
    expect(moved).toBeDefined()
    expect(moved?.start.getHours()).toBe(8)
    expect(moved?.start.getMinutes()).toBe(30)
  })

  test("does not return an override moved from before the lookback window (documented trade-off)", () => {
    // Original recurrence 60 days ago (> RRULE_LOOKBACK_DAYS), moved onto
    // today. Iteration starts inside the window, so this occurrence's original
    // position is never visited and the moved event does not appear. This test
    // pins the accepted limitation of the windowed expansion.
    const events = expand(
      ics(
        [
          "UID:a@x",
          "SUMMARY:Daily standup",
          "DTSTART:20230101T090000",
          "RRULE:FREQ=DAILY"
        ].join("\n"),
        [
          "UID:a@x",
          "SUMMARY:Moved from long ago",
          "RECURRENCE-ID:20260508T090000",
          "DTSTART:20260707T083000"
        ].join("\n")
      )
    )
    expect(events.some((e) => e.title === "Moved from long ago")).toBe(false)
  })

  test("handles a weekly series that ended in the past without throwing", () => {
    const events = expand(
      ics(
        [
          "UID:a@x",
          "SUMMARY:Old weekly",
          "DTSTART:20250101T090000",
          "RRULE:FREQ=WEEKLY;UNTIL=20250201T090000"
        ].join("\n")
      )
    )
    expect(events).toHaveLength(0)
  })
})

describe("filterIgnoredEvents", () => {
  function titled(title: string): ScheduleEvent {
    return {
      uid: title,
      title,
      start: TODAY,
      end: null,
      allDay: false,
      attendees: [],
      location: null,
      description: null,
      calendarName: "Work",
      calendarColor: "#abc"
    }
  }

  const events: readonly ScheduleEvent[] = [
    titled("Commute to office"),
    titled("Design Review"),
    titled("LUNCH break")
  ]

  test("hides events whose title contains any pattern, case-insensitively", () => {
    const visible = filterIgnoredEvents(events, ["commute", "lunch"])
    expect(visible.map((e) => e.title)).toEqual(["Design Review"])
  })

  test("returns the input unchanged when there are no patterns", () => {
    expect(filterIgnoredEvents(events, [])).toHaveLength(3)
    expect(filterIgnoredEvents(events, ["  "])).toHaveLength(3)
  })
})
