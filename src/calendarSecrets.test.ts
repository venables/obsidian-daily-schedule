import { describe, expect, test } from "bun:test"

import { migrateCalendarUrls, resolveCalendarFeeds } from "./calendarSecrets"

describe("migrateCalendarUrls", () => {
  test("moves each plain URL into a new secret", () => {
    const data = {
      meetingNotePath: "notes",
      calendars: [
        { name: "Work", url: "https://a.example/w.ics", color: "#f00" },
        { name: "Family & Friends", url: "https://a.example/f.ics", color: "" }
      ]
    }
    expect(migrateCalendarUrls(data, [])).toEqual({
      data: {
        meetingNotePath: "notes",
        calendars: [
          { name: "Work", urlSecret: "calendar-work", color: "#f00" },
          {
            name: "Family & Friends",
            urlSecret: "calendar-family-friends",
            color: ""
          }
        ]
      },
      secrets: [
        { id: "calendar-work", value: "https://a.example/w.ics" },
        { id: "calendar-family-friends", value: "https://a.example/f.ics" }
      ]
    })
  })

  test("adds a number when the ID is taken", () => {
    const data = {
      calendars: [
        { name: "Work", url: "https://a.example/1.ics", color: "" },
        { name: "work", url: "https://a.example/2.ics", color: "" }
      ]
    }
    const { secrets } = migrateCalendarUrls(data, ["calendar-work"])
    expect(secrets.map((s) => s.id)).toEqual([
      "calendar-work-2",
      "calendar-work-3"
    ])
  })

  test("uses a generic ID for a name with no letters or digits", () => {
    const data = { calendars: [{ name: "!!", url: "https://x", color: "" }] }
    expect(migrateCalendarUrls(data, []).secrets[0].id).toBe("calendar")
  })

  test("keeps calendars that already use a secret", () => {
    const data = {
      calendars: [{ name: "Work", urlSecret: "my-work", color: "" }]
    }
    expect(migrateCalendarUrls(data, [])).toEqual({ data, secrets: [] })
  })

  test("returns data with no calendars as it is", () => {
    expect(migrateCalendarUrls(null, [])).toEqual({ data: null, secrets: [] })
    expect(migrateCalendarUrls({ a: 1 }, [])).toEqual({
      data: { a: 1 },
      secrets: []
    })
  })
})

describe("resolveCalendarFeeds", () => {
  const secrets = new Map([["calendar-work", "https://a.example/w.ics"]])
  const getSecret = (id: string): string | null => secrets.get(id) ?? null

  test("replaces each secret ID with its URL", () => {
    const calendars = [
      { name: "Work", urlSecret: "calendar-work", color: "#f00" }
    ]
    expect(resolveCalendarFeeds(calendars, getSecret)).toEqual({
      feeds: [{ name: "Work", url: "https://a.example/w.ics", color: "#f00" }],
      missing: []
    })
  })

  test("lists calendars whose secret is empty or not found", () => {
    const calendars = [
      { name: "Gone", urlSecret: "calendar-gone", color: "" },
      { name: "Unset", urlSecret: "", color: "" }
    ]
    expect(resolveCalendarFeeds(calendars, getSecret)).toEqual({
      feeds: [],
      missing: ["Gone", "Unset"]
    })
  })
})
