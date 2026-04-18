import { App, Modal, PluginSettingTab, Setting, debounce } from "obsidian"

import type DailySchedulePlugin from "./main"
import { FolderSuggest, MarkdownFileSuggest } from "./suggest"

export interface CalendarSource {
  readonly name: string
  readonly url: string
  readonly color: string
}

export interface DailyScheduleSettings {
  readonly calendars: readonly CalendarSource[]
  readonly meetingNotePath: string
  readonly meetingTemplatePath: string
  readonly refreshIntervalMinutes: number
  readonly ignorePatterns: readonly string[]
  readonly myEmails: readonly string[]
  readonly peopleFolders: readonly string[]
}

export const DEFAULT_SETTINGS: DailyScheduleSettings = {
  calendars: [],
  meetingNotePath: "meetings",
  meetingTemplatePath: "",
  refreshIntervalMinutes: 15,
  ignorePatterns: ["commute", "lunch"],
  myEmails: [],
  peopleFolders: ["people"]
}

const DEFAULT_COLORS = [
  "var(--interactive-accent)",
  "#e67e22",
  "#2ecc71",
  "#9b59b6",
  "#e74c3c",
  "#1abc9c"
]

// Trailing-edge debounce on text input so we save+re-render once the user
// pauses typing, instead of on every keystroke. 300ms is short enough to feel
// immediate and long enough to coalesce a typical typing burst.
const SETTINGS_DEBOUNCE_MS = 300

function parseCsv(value: string): readonly string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
}

export class DailyScheduleSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly plugin: DailySchedulePlugin
  ) {
    super(app, plugin)
  }

  display(): void {
    const { containerEl } = this
    containerEl.empty()

    const saveMeetingNotePath = debounce(
      (value: string) => {
        void this.plugin.updateSettings({
          meetingNotePath: value.trim() || "meetings"
        })
      },
      SETTINGS_DEBOUNCE_MS,
      true
    )

    const saveMyEmails = debounce(
      (value: string) => {
        const emails = parseCsv(value).map((s) => s.toLowerCase())
        void this.plugin.updateSettings({ myEmails: emails })
      },
      SETTINGS_DEBOUNCE_MS,
      true
    )

    const saveIgnorePatterns = debounce(
      (value: string) => {
        void this.plugin.updateSettings({ ignorePatterns: parseCsv(value) })
      },
      SETTINGS_DEBOUNCE_MS,
      true
    )

    const saveMeetingTemplatePath = debounce(
      (value: string) => {
        void this.plugin.updateSettings({
          meetingTemplatePath: value.trim()
        })
      },
      SETTINGS_DEBOUNCE_MS,
      true
    )

    containerEl.createEl("h2", { text: "Calendars" })
    this.renderCalendarList(containerEl)

    containerEl.createEl("h2", { text: "Meeting Notes" })

    new Setting(containerEl)
      .setName("Meeting note path")
      .setDesc(
        "Base folder for meeting notes. YYYY/MM subfolders are created automatically."
      )
      .addText((text) => {
        text
          .setPlaceholder("meetings")
          .setValue(this.plugin.settings.meetingNotePath)
          .onChange(saveMeetingNotePath)
        void new FolderSuggest(this.app, text.inputEl)
      })

    new Setting(containerEl)
      .setName("Meeting note template")
      .setDesc(
        "Optional markdown file used as a template. Placeholders: {{title}}, {{date}}, {{time}}, {{endTime}}, {{location}}, {{description}}, {{attendees}}, {{attendeesYaml}}."
      )
      .addText((text) => {
        text
          .setPlaceholder("templates/meeting.md")
          .setValue(this.plugin.settings.meetingTemplatePath)
          .onChange(saveMeetingTemplatePath)
        void new MarkdownFileSuggest(this.app, text.inputEl)
      })

    new Setting(containerEl)
      .setName("My emails")
      .setDesc(
        "Your email addresses, filtered from attendee lists (comma-separated)."
      )
      .addText((text) =>
        text
          .setPlaceholder("you@work.com, you@personal.com")
          .setValue(this.plugin.settings.myEmails.join(", "))
          .onChange(saveMyEmails)
      )

    containerEl.createEl("h2", { text: "Display" })

    new Setting(containerEl)
      .setName("Refresh interval")
      .setDesc("How often to re-fetch calendar events (minutes).")
      .addDropdown((dropdown) =>
        dropdown
          .addOptions({
            "5": "5",
            "10": "10",
            "15": "15",
            "30": "30",
            "60": "60"
          })
          .setValue(String(this.plugin.settings.refreshIntervalMinutes))
          .onChange(async (value) => {
            await this.plugin.updateSettings({
              refreshIntervalMinutes: Number(value)
            })
          })
      )

    new Setting(containerEl)
      .setName("Ignore patterns")
      .setDesc(
        "Event titles containing these words are hidden (comma-separated, case-insensitive)."
      )
      .addTextArea((text) =>
        text
          .setPlaceholder("commute, lunch, focus time")
          .setValue(this.plugin.settings.ignorePatterns.join(", "))
          .onChange(saveIgnorePatterns)
      )

    containerEl.createEl("h2", { text: "People Lookup" })
    this.renderPeopleFolders(containerEl)
  }

  private renderCalendarList(containerEl: HTMLElement): void {
    const calendars = this.plugin.settings.calendars

    for (let i = 0; i < calendars.length; i++) {
      const cal = calendars[i]
      const setting = new Setting(containerEl)
        .setName(cal.name || `Calendar ${i + 1}`)
        .setDesc(cal.url ? truncateUrl(cal.url) : "No URL set")

      setting.addExtraButton((btn) =>
        btn
          .setIcon("pencil")
          .setTooltip("Edit")
          .onClick(() => {
            this.openCalendarModal(i)
          })
      )

      setting.addExtraButton((btn) =>
        btn
          .setIcon("trash")
          .setTooltip("Remove")
          .onClick(async () => {
            const updated = calendars.filter((_, idx) => idx !== i)
            await this.plugin.updateSettings({ calendars: updated })
            this.display()
          })
      )
    }

    new Setting(containerEl).addButton((btn) =>
      btn
        .setButtonText("Add calendar")
        .setCta()
        .onClick(() => {
          this.openCalendarModal(-1)
        })
    )
  }

  private renderPeopleFolders(containerEl: HTMLElement): void {
    const folders = this.plugin.settings.peopleFolders

    new Setting(containerEl)
      .setName("People folders")
      .setDesc(
        "Folders to scan for person notes with email frontmatter. Attendees whose email appears in a person note's frontmatter are replaced with a wikilink."
      )

    for (let i = 0; i < folders.length; i++) {
      const row = new Setting(containerEl)

      const savePath = debounce(
        (value: string) => {
          // Read from live settings rather than the closed-over `folders`,
          // so a debounced save that fires after an "Add folder" click sees
          // the new row and doesn't clobber it.
          const current = this.plugin.settings.peopleFolders
          const updated = current.map((f, idx) => (idx === i ? value : f))
          void this.plugin.updateSettings({ peopleFolders: updated })
        },
        SETTINGS_DEBOUNCE_MS,
        true
      )

      row.addText((text) => {
        text.setPlaceholder("people").setValue(folders[i]).onChange(savePath)
        void new FolderSuggest(this.app, text.inputEl)
      })

      row.addExtraButton((btn) =>
        btn
          .setIcon("trash")
          .setTooltip("Remove")
          .onClick(async () => {
            const updated = folders.filter((_, idx) => idx !== i)
            await this.plugin.updateSettings({ peopleFolders: updated })
            this.display()
          })
      )
    }

    new Setting(containerEl).addButton((btn) =>
      btn
        .setButtonText("Add folder")
        .setCta()
        .onClick(async () => {
          await this.plugin.updateSettings({
            peopleFolders: [...folders, ""]
          })
          this.display()
        })
    )
  }

  private openCalendarModal(index: number): void {
    const existing =
      index >= 0 ? this.plugin.settings.calendars[index] : undefined
    const defaultColor =
      DEFAULT_COLORS[
        this.plugin.settings.calendars.length % DEFAULT_COLORS.length
      ]

    const modal = new CalendarModal(
      this.app,
      this.plugin,
      index,
      existing,
      defaultColor,
      () => {
        this.display()
      }
    )
    modal.open()
  }
}

class CalendarModal extends Modal {
  private readonly plugin: DailySchedulePlugin
  private readonly index: number
  private readonly onSaved: () => void
  private name: string
  private url: string
  private color: string

  constructor(
    app: App,
    plugin: DailySchedulePlugin,
    index: number,
    existing: CalendarSource | undefined,
    defaultColor: string,
    onSaved: () => void
  ) {
    super(app)
    this.plugin = plugin
    this.index = index
    this.onSaved = onSaved
    this.name = existing?.name ?? ""
    this.url = existing?.url ?? ""
    this.color = existing?.color ?? defaultColor
  }

  onOpen() {
    const { contentEl } = this
    contentEl.createEl("h3", {
      text: this.index >= 0 ? "Edit Calendar" : "Add Calendar"
    })

    new Setting(contentEl).setName("Name").addText((text) =>
      text
        .setPlaceholder("Work")
        .setValue(this.name)
        .onChange((v) => {
          this.name = v
        })
    )

    new Setting(contentEl).setName("ICS URL").addText((text) =>
      text
        .setPlaceholder(
          "https://calendar.google.com/calendar/ical/.../basic.ics"
        )
        .setValue(this.url)
        .onChange((v) => {
          this.url = v
        })
    )

    new Setting(contentEl).setName("Accent color").addColorPicker((cp) =>
      cp
        .setValue(this.color.startsWith("var(") ? "#5b8def" : this.color)
        .onChange((v) => {
          this.color = v
        })
    )

    new Setting(contentEl).addButton((btn) =>
      btn
        .setButtonText("Save")
        .setCta()
        .onClick(async () => {
          if (!this.url.trim()) {
            return
          }
          const entry: CalendarSource = {
            name: this.name.trim() || "Calendar",
            url: this.url.trim(),
            color: this.color
          }

          const calendars = [...this.plugin.settings.calendars]
          if (this.index >= 0) {
            calendars[this.index] = entry
          } else {
            calendars.push(entry)
          }

          await this.plugin.updateSettings({ calendars })
          this.close()
        })
    )
  }

  onClose() {
    this.contentEl.empty()
    this.onSaved()
  }
}

function truncateUrl(url: string): string {
  return url.length > 60 ? url.slice(0, 57) + "..." : url
}
