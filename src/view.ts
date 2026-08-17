import { ItemView, WorkspaceLeaf, setIcon } from "obsidian"

import {
  fetchCalendarEvents,
  filterIgnoredEvents,
  type ScheduleEvent
} from "./calendar"
import { addDays, formatDate, formatTime, startOfDay } from "./helpers"
import type DailySchedulePlugin from "./main"
import { buildMeetingNotePath, createMeetingNote } from "./meeting"
import { buildEmailMap, resolveAttendees, type EmailMap } from "./people"

declare module "obsidian" {
  interface App {
    setting: {
      open(): void
      openTabById(id: string): void
    }
  }
}

export const VIEW_TYPE = "daily-schedule-view"

export class ScheduleView extends ItemView {
  private events: readonly ScheduleEvent[] = []
  private eventsDate = ""
  // Days away from today, not an absolute date, so offset 0 still means
  // "today" after the clock rolls past midnight with the view left open.
  private dayOffset = 0
  // Identifies the newest in-flight fetch, so a slow response for a day the
  // user has already navigated away from cannot overwrite a newer one.
  private fetchToken = 0

  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: DailySchedulePlugin
  ) {
    super(leaf)
  }

  getViewType(): string {
    return VIEW_TYPE
  }

  getDisplayText(): string {
    return "Today's Schedule"
  }

  getIcon(): string {
    return "calendar-clock"
  }

  async onOpen(): Promise<void> {
    // Render the loading state synchronously, then fetch in the background.
    // Obsidian awaits onOpen during workspace restoration, so awaiting the
    // network round-trips here would delay every Obsidian startup.
    void this.refresh()
  }

  async onClose(): Promise<void> {
    // Nothing to clean up
  }

  private get selectedDate(): Date {
    return addDays(startOfDay(new Date()), this.dayOffset)
  }

  async refresh(): Promise<void> {
    const target = this.selectedDate
    const targetKey = formatDate(target)

    // If the selected day changed, clear events for the previous day
    if (this.eventsDate !== targetKey) {
      this.events = []
    }

    const { settings } = this.plugin

    if (settings.calendars.length === 0) {
      this.renderEmpty(
        "No calendars configured. Open plugin settings to add one."
      )
      return
    }

    // Show existing events while refreshing, or loading message if none
    if (this.events.length === 0) {
      this.renderLoading()
    }

    const token = ++this.fetchToken

    try {
      const fetched = await fetchCalendarEvents(settings.calendars, target)
      if (token !== this.fetchToken) {
        return
      }
      this.events = fetched
      this.eventsDate = targetKey
    } catch (err) {
      console.error("[daily-schedule] Fetch failed:", err)
      if (token !== this.fetchToken) {
        return
      }
      if (this.events.length === 0) {
        this.renderError()
        return
      }
      // Keep showing stale events on refresh failure
    }

    this.rerender()
  }

  private goToDay(offset: number): void {
    if (offset === this.dayOffset) {
      return
    }
    this.dayOffset = offset
    void this.refresh()
  }

  rerender(): void {
    const { settings } = this.plugin

    if (settings.calendars.length === 0) {
      this.renderEmpty(
        "No calendars configured. Open plugin settings to add one."
      )
      return
    }

    this.renderEvents()
  }

  private renderLoading(): void {
    const { contentEl } = this
    contentEl.empty()
    contentEl.addClass("ds-container")
    this.renderHeader(contentEl)
    contentEl.createEl("p", { cls: "ds-message", text: "Loading schedule..." })
  }

  private renderEmpty(message: string): void {
    const { contentEl } = this
    contentEl.empty()
    contentEl.addClass("ds-container")
    this.renderHeader(contentEl)

    const msg = contentEl.createEl("p", { cls: "ds-message", text: message })

    if (message.includes("settings")) {
      const link = msg.createEl("a", { text: " Open settings", href: "#" })
      link.addEventListener("click", (e) => {
        e.preventDefault()
        this.app.setting.open()
        this.app.setting.openTabById("daily-schedule")
      })
    }
  }

  private renderError(): void {
    const { contentEl } = this
    contentEl.empty()
    contentEl.addClass("ds-container")
    this.renderHeader(contentEl)

    const errorEl = contentEl.createEl("div", { cls: "ds-error" })
    errorEl.createEl("p", { text: "Failed to load calendar." })
    const retryBtn = errorEl.createEl("button", {
      text: "Retry",
      cls: "ds-retry-btn"
    })
    retryBtn.addEventListener("click", () => {
      void this.refresh()
    })
  }

  private renderHeader(container: HTMLElement): void {
    const selected = this.selectedDate
    const dateStr = formatDate(selected)
    const dayName = selected.toLocaleDateString([], { weekday: "long" })

    const header = container.createEl("div", { cls: "ds-header" })

    const left = header.createEl("div", { cls: "ds-header-left" })
    this.renderNavButton(left, "chevron-left", "Previous day", -1)
    this.renderDate(left, dateStr)
    this.renderNavButton(left, "chevron-right", "Next day", 1)

    const right = header.createEl("div", { cls: "ds-header-right" })
    const refreshBtn = right.createEl("button", {
      cls: "ds-refresh-btn clickable-icon",
      attr: { "aria-label": "Refresh schedule" }
    })
    setIcon(refreshBtn, "refresh-cw")
    refreshBtn.addEventListener("click", (e) => {
      e.stopPropagation()
      refreshBtn.classList.remove("ds-spinning")
      // Re-add on the next frame so the animation restarts cleanly on
      // rapid repeat clicks (adding an already-present class is a no-op).
      requestAnimationFrame(() => refreshBtn.classList.add("ds-spinning"))
      void this.refresh()
    })
    right.createEl("span", { cls: "ds-day", text: dayName })
  }

  // On any day but today the date doubles as the way back to today, so the
  // header stays on one line in a narrow sidebar.
  private renderDate(container: HTMLElement, dateStr: string): void {
    if (this.dayOffset === 0) {
      container.createEl("span", { cls: "ds-date", text: dateStr })
      return
    }

    const btn = container.createEl("button", {
      cls: "ds-date ds-date-btn",
      text: dateStr,
      attr: { "aria-label": "Back to today" }
    })
    btn.addEventListener("click", (e) => {
      e.stopPropagation()
      this.goToDay(0)
    })
  }

  private renderNavButton(
    container: HTMLElement,
    icon: string,
    label: string,
    delta: number
  ): void {
    const btn = container.createEl("button", {
      cls: "ds-nav-btn clickable-icon",
      attr: { "aria-label": label }
    })
    setIcon(btn, icon)
    btn.addEventListener("click", (e) => {
      e.stopPropagation()
      this.goToDay(this.dayOffset + delta)
    })
  }

  private renderEvents(): void {
    const { contentEl } = this
    const { settings } = this.plugin
    contentEl.empty()
    contentEl.addClass("ds-container")
    this.renderHeader(contentEl)

    const visible = filterIgnoredEvents(this.events, settings.ignorePatterns)

    if (visible.length === 0) {
      contentEl.createEl("p", {
        cls: "ds-message",
        text: this.dayOffset === 0 ? "No events today." : "No events this day."
      })
      return
    }

    const now = new Date()
    const list = contentEl.createEl("div", { cls: "ds-event-list" })
    const hasAttendees = visible.some((e) => e.attendees.length > 0)
    const emailMap: EmailMap | null = hasAttendees
      ? buildEmailMap(this.app, settings.peopleFolders)
      : null

    const myEmailSet = new Set(
      settings.myEmails.map((e) => e.toLowerCase().trim()).filter(Boolean)
    )

    for (const event of visible) {
      const isPast =
        !event.allDay && event.end
          ? event.end.getTime() < now.getTime()
          : !event.allDay &&
            event.start.getTime() < now.getTime() - 60 * 60 * 1000

      const isCurrent =
        !event.allDay && event.end
          ? event.start.getTime() <= now.getTime() &&
            event.end.getTime() > now.getTime()
          : false

      const isDeclined =
        myEmailSet.size > 0 &&
        event.attendees.some(
          (a) =>
            myEmailSet.has(a.email.toLowerCase().trim()) &&
            a.partstat === "DECLINED"
        )

      const card = list.createEl("div", {
        cls: `ds-event-card${isPast ? " ds-event-past" : ""}${isCurrent ? " ds-event-current" : ""}${isDeclined ? " ds-event-declined" : ""}`
      })

      if (event.calendarColor) {
        card.style.borderLeftColor = event.calendarColor
      }

      const timeText = event.allDay
        ? "All day"
        : event.end
          ? `${formatTime(event.start)} - ${formatTime(event.end)}`
          : formatTime(event.start)

      card.createEl("div", { cls: "ds-event-time", text: timeText })
      card.createEl("div", { cls: "ds-event-title", text: event.title })

      if (event.attendees.length > 0 && emailMap) {
        const resolved = resolveAttendees(
          event.attendees,
          emailMap,
          settings.myEmails
        )

        if (resolved.length > 0) {
          const names = resolved.map((a) => a.name).slice(0, 4)
          const suffix = resolved.length > 4 ? ` +${resolved.length - 4}` : ""
          card.createEl("div", {
            cls: "ds-event-attendees",
            text: `with ${names.join(", ")}${suffix}`
          })
        }
      }

      card.addEventListener("click", () => {
        void this.handleEventClick(event)
      })
    }
  }

  private async handleEventClick(event: ScheduleEvent): Promise<void> {
    const { settings } = this.plugin
    const notePath = buildMeetingNotePath(
      settings.meetingNotePath,
      settings.meetingFilePattern,
      event
    )

    const emailMap = buildEmailMap(this.app, settings.peopleFolders)
    const attendees = resolveAttendees(
      event.attendees,
      emailMap,
      settings.myEmails
    )

    await createMeetingNote(
      this.app,
      notePath,
      settings.meetingTemplatePath,
      event,
      attendees
    )
  }
}
