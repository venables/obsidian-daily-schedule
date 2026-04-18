import { ItemView, WorkspaceLeaf } from "obsidian"

import {
  fetchCalendarEvents,
  filterIgnoredEvents,
  type ScheduleEvent
} from "./calendar"
import { formatDate, formatTime } from "./helpers"
import type DailySchedulePlugin from "./main"
import {
  buildMeetingNotePath,
  buildMeetingNoteContent,
  createOrOpenMeetingNote
} from "./meeting"
import { buildEmailMap, resolveAttendees, type EmailMap } from "./people"
import { loadTemplate, renderMeetingTemplate } from "./template"

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
  private lastFetchDate = ""

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

  async refresh(): Promise<void> {
    const today = formatDate(new Date())

    // If the day changed, clear stale events
    if (this.lastFetchDate !== today) {
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

    try {
      this.events = await fetchCalendarEvents(settings.calendars)
      this.lastFetchDate = today
    } catch (err) {
      console.error("[daily-schedule] Fetch failed:", err)
      if (this.events.length === 0) {
        this.renderError()
        return
      }
      // Keep showing stale events on refresh failure
    }

    this.rerender()
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
    const now = new Date()
    const dateStr = formatDate(now)
    const dayName = now.toLocaleDateString([], { weekday: "long" })

    const header = container.createEl("div", { cls: "ds-header" })
    header.createEl("span", { cls: "ds-date", text: dateStr })
    header.createEl("span", { cls: "ds-day", text: dayName })
  }

  private renderEvents(): void {
    const { contentEl } = this
    const { settings } = this.plugin
    contentEl.empty()
    contentEl.addClass("ds-container")
    this.renderHeader(contentEl)

    const visible = filterIgnoredEvents(this.events, settings.ignorePatterns)

    if (visible.length === 0) {
      contentEl.createEl("p", { cls: "ds-message", text: "No events today." })
      return
    }

    const now = new Date()
    const list = contentEl.createEl("div", { cls: "ds-event-list" })
    const hasAttendees = visible.some((e) => e.attendees.length > 0)
    const emailMap: EmailMap | null = hasAttendees
      ? buildEmailMap(this.app, settings.peopleFolders)
      : null

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

      const card = list.createEl("div", {
        cls: `ds-event-card${isPast ? " ds-event-past" : ""}${isCurrent ? " ds-event-current" : ""}`
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

    const template = await loadTemplate(this.app, settings.meetingTemplatePath)
    const content = template
      ? renderMeetingTemplate(template, event, attendees)
      : buildMeetingNoteContent(event, attendees)

    await createOrOpenMeetingNote(this.app, notePath, content)
  }
}
