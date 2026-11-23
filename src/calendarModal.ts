import { App, Modal, SecretComponent, Setting } from "obsidian"

import type DailySchedulePlugin from "./main"
import type { CalendarSource } from "./settings"

const DEFAULT_COLORS = [
  "var(--interactive-accent)",
  "#e67e22",
  "#2ecc71",
  "#9b59b6",
  "#e74c3c",
  "#1abc9c"
]

function nextDefaultColor(calendarCount: number): string {
  return DEFAULT_COLORS[calendarCount % DEFAULT_COLORS.length]
}

/*
 * Adds a calendar when `index` is -1, otherwise edits the calendar at that
 * index. `onSaved` runs when the modal closes, so the settings tab can
 * rebuild its list.
 */
export class CalendarModal extends Modal {
  private name: string
  private urlSecret: string
  private color: string

  constructor(
    app: App,
    private readonly plugin: DailySchedulePlugin,
    private readonly index: number,
    private readonly onSaved: () => void
  ) {
    super(app)
    const existing = plugin.settings.calendars.at(index)
    const isEdit = index >= 0 && existing !== undefined
    this.name = isEdit ? existing.name : ""
    this.urlSecret = isEdit ? existing.urlSecret : ""
    this.color = isEdit
      ? existing.color
      : nextDefaultColor(plugin.settings.calendars.length)
  }

  onOpen() {
    const { contentEl } = this
    this.setTitle(this.index >= 0 ? "Edit calendar" : "Add calendar")

    new Setting(contentEl).setName("Name").addText((text) =>
      text
        .setPlaceholder("Work")
        .setValue(this.name)
        .onChange((v) => {
          this.name = v
        })
    )

    new Setting(contentEl)
      .setName("Calendar URL")
      .setDesc(
        "Pick or create a secret that holds the ICS feed URL. Obsidian keeps secrets out of the plugin settings file."
      )
      .addComponent((el) =>
        new SecretComponent(this.app, el)
          .setValue(this.urlSecret)
          .onChange((v) => {
            this.urlSecret = v ?? ""
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
          await this.save()
        })
    )
  }

  onClose() {
    this.contentEl.empty()
    this.onSaved()
  }

  private async save(): Promise<void> {
    if (!this.urlSecret) {
      return
    }
    const entry: CalendarSource = {
      name: this.name.trim() || "Calendar",
      urlSecret: this.urlSecret,
      color: this.color
    }
    const current = this.plugin.settings.calendars
    const calendars =
      this.index >= 0
        ? current.map((cal, i) => (i === this.index ? entry : cal))
        : [...current, entry]

    await this.plugin.updateSettings({ calendars })
    this.close()
  }
}
