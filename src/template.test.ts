import { describe, expect, test } from "vitest"

import type { ScheduleEvent } from "./calendar"
import type { ResolvedAttendee } from "./people"
import { renderMeetingTemplate } from "./template"

function makeEvent(overrides: Partial<ScheduleEvent> = {}): ScheduleEvent {
  return {
    uid: "uid-1",
    title: "Design Review 🎨",
    start: new Date(2026, 3, 15, 9, 30),
    end: new Date(2026, 3, 15, 10, 0),
    allDay: false,
    attendees: [],
    location: "Zoom",
    description: "Quarterly design sync",
    calendarName: "Work",
    calendarColor: "#000",
    ...overrides
  }
}

const attendees: readonly ResolvedAttendee[] = [
  { name: "Jane Doe", email: "jane@example.com", wikiLink: "[[Jane Doe]]" },
  { name: "stranger", email: "stranger@example.com", wikiLink: null }
]

const path = "meetings/2026/04/2026-04-15 - Design Review.md"

describe("renderMeetingTemplate event placeholders", () => {
  test("substitutes eventTitle with emoji and unsafe chars stripped", () => {
    expect(
      renderMeetingTemplate("# {{eventTitle}}", path, makeEvent(), [])
    ).toBe("# Design Review")
  })

  test("substitutes eventDate default and formatted", () => {
    expect(
      renderMeetingTemplate(
        "{{eventDate}} / {{eventDate:YYYY}}",
        path,
        makeEvent(),
        []
      )
    ).toBe("2026-04-15 / 2026")
  })

  test("formats eventTime with an explicit format", () => {
    expect(
      renderMeetingTemplate("{{eventTime:HH:mm}}", path, makeEvent(), [])
    ).toBe("09:30")
  })

  test("renders empty eventTime for an all-day event", () => {
    expect(
      renderMeetingTemplate(
        "start={{eventTime}}end",
        path,
        makeEvent({ allDay: true }),
        []
      )
    ).toBe("start=end")
  })

  test("substitutes location and description", () => {
    expect(
      renderMeetingTemplate(
        "{{eventLocation}}: {{eventDescription}}",
        path,
        makeEvent(),
        []
      )
    ).toBe("Zoom: Quarterly design sync")
  })

  test("renders eventAttendees as comma-separated names/wikilinks", () => {
    expect(
      renderMeetingTemplate("{{eventAttendees}}", path, makeEvent(), attendees)
    ).toBe("[[Jane Doe]], stranger")
  })

  test("renders eventAttendeesYaml as a leading-newline YAML list", () => {
    expect(
      renderMeetingTemplate(
        "attendees:{{eventAttendeesYaml}}",
        path,
        makeEvent(),
        attendees
      )
    ).toBe('attendees:\n  - "[[Jane Doe]]"\n  - stranger@example.com')
  })

  test("renders empty eventAttendeesYaml for zero attendees", () => {
    expect(
      renderMeetingTemplate(
        "attendees:{{eventAttendeesYaml}}",
        path,
        makeEvent(),
        []
      )
    ).toBe("attendees:")
  })
})

describe("renderMeetingTemplate core placeholders", () => {
  test("substitutes title with the note's basename", () => {
    expect(renderMeetingTemplate("# {{title}}", path, makeEvent(), [])).toBe(
      "# 2026-04-15 - Design Review"
    )
  })

  test("honors the core plugin's configured date and time formats", () => {
    const rendered = renderMeetingTemplate("{{date}}", path, makeEvent(), [], {
      dateFormat: "DD.MM.YYYY",
      timeFormat: "h:mm A"
    })
    // Rendered against the current clock; assert the SHAPE the format implies.
    expect(rendered).toMatch(/^\d{2}\.\d{2}\.\d{4}$/)
  })

  test("leaves an unknown placeholder untouched", () => {
    expect(renderMeetingTemplate("{{nope}}", path, makeEvent(), [])).toBe(
      "{{nope}}"
    )
  })

  test("does not resolve inherited object keys like {{toString}}", () => {
    expect(
      renderMeetingTemplate(
        "{{toString}} {{eventTitle}}",
        path,
        makeEvent(),
        []
      )
    ).toBe("{{toString}} Design Review")
  })
})
