import { Notice, Plugin } from "obsidian"

import { backfillAttendeeLinks } from "./backfill"
import {
  DEFAULT_SETTINGS,
  DailyScheduleSettingTab,
  type DailyScheduleSettings
} from "./settings"
import { ScheduleView, VIEW_TYPE } from "./view"

export default class DailySchedulePlugin extends Plugin {
  settings: DailyScheduleSettings = DEFAULT_SETTINGS
  private refreshIntervalId: number | null = null

  async onload(): Promise<void> {
    await this.loadSettings()

    this.registerView(VIEW_TYPE, (leaf) => new ScheduleView(leaf, this))

    this.addSettingTab(new DailyScheduleSettingTab(this.app, this))

    this.addRibbonIcon("calendar-clock", "Open daily schedule", () => {
      void this.activateView()
    })

    this.addCommand({
      id: "open-daily-schedule",
      name: "Open daily schedule",
      callback: () => {
        void this.activateView()
      }
    })

    this.addCommand({
      id: "refresh-daily-schedule",
      name: "Refresh daily schedule",
      callback: () => {
        this.refreshView()
      }
    })

    this.addCommand({
      id: "relink-meeting-attendees",
      name: "Relink meeting attendees",
      callback: () => {
        void this.relinkMeetingAttendees()
      }
    })

    this.app.workspace.onLayoutReady(() => {
      this.startRefreshInterval()
    })
  }

  onunload(): void {
    this.stopRefreshInterval()
  }

  async loadSettings(): Promise<void> {
    const data = await this.loadData()
    this.settings = { ...DEFAULT_SETTINGS, ...data }
  }

  async updateSettings(partial: Partial<DailyScheduleSettings>): Promise<void> {
    this.settings = { ...this.settings, ...partial }
    await this.saveData({ ...this.settings })

    // Restart refresh interval if it changed
    if ("refreshIntervalMinutes" in partial) {
      this.stopRefreshInterval()
      this.startRefreshInterval()
    }

    // `calendars` changes the set of sources, so we must re-fetch.
    // Everything else below is a pure display-time concern (filtering or
    // attendee resolution), so a re-render against the cached events is
    // enough — no network work.
    if ("calendars" in partial) {
      this.refreshView()
    } else if (
      "ignorePatterns" in partial ||
      "myEmails" in partial ||
      "peopleFolders" in partial
    ) {
      this.rerenderView()
    }
  }

  private async activateView(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE)
    if (existing.length > 0) {
      void this.app.workspace.revealLeaf(existing[0])
      return
    }

    const leaf = this.app.workspace.getRightLeaf(false)
    if (leaf) {
      await leaf.setViewState({ type: VIEW_TYPE, active: true })
      void this.app.workspace.revealLeaf(leaf)
    }
  }

  private async relinkMeetingAttendees(): Promise<void> {
    const result = await backfillAttendeeLinks(
      this.app,
      this.settings.meetingNotePath,
      this.settings.peopleFolders
    )
    void new Notice(
      `Relinked ${result.attendeesRelinked} attendee(s) across ${result.filesUpdated} note(s) (scanned ${result.filesScanned})`
    )
  }

  private refreshView(): void {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE)
    for (const leaf of leaves) {
      const view = leaf.view
      if (view instanceof ScheduleView) {
        void view.refresh()
      }
    }
  }

  private rerenderView(): void {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE)
    for (const leaf of leaves) {
      const view = leaf.view
      if (view instanceof ScheduleView) {
        view.rerender()
      }
    }
  }

  private startRefreshInterval(): void {
    this.stopRefreshInterval()
    const ms = this.settings.refreshIntervalMinutes * 60 * 1000
    this.refreshIntervalId = this.registerInterval(
      window.setInterval(() => this.refreshView(), ms)
    )
  }

  private stopRefreshInterval(): void {
    if (this.refreshIntervalId !== null) {
      window.clearInterval(this.refreshIntervalId)
      this.refreshIntervalId = null
    }
  }
}
