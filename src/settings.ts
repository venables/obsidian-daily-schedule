import { App, Modal, PluginSettingTab, Setting } from "obsidian";
import type DailySchedulePlugin from "./main";

export interface CalendarSource {
  readonly name: string;
  readonly url: string;
  readonly color: string;
}

export interface DailyScheduleSettings {
  readonly calendars: readonly CalendarSource[];
  readonly meetingNotePath: string;
  readonly refreshIntervalMinutes: number;
  readonly ignorePatterns: readonly string[];
  readonly myEmails: readonly string[];
  readonly peopleFolders: readonly string[];
}

export const DEFAULT_SETTINGS: DailyScheduleSettings = {
  calendars: [],
  meetingNotePath: "meetings",
  refreshIntervalMinutes: 15,
  ignorePatterns: ["commute", "lunch"],
  myEmails: [],
  peopleFolders: ["people"],
};

const DEFAULT_COLORS = [
  "var(--interactive-accent)",
  "#e67e22",
  "#2ecc71",
  "#9b59b6",
  "#e74c3c",
  "#1abc9c",
];

export class DailyScheduleSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly plugin: DailySchedulePlugin,
  ) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Calendars" });
    this.renderCalendarList(containerEl);

    containerEl.createEl("h2", { text: "Meeting Notes" });

    new Setting(containerEl)
      .setName("Meeting note path")
      .setDesc("Base folder for meeting notes. YYYY/MM subfolders are created automatically.")
      .addText((text) =>
        text
          .setPlaceholder("meetings")
          .setValue(this.plugin.settings.meetingNotePath)
          .onChange(async (value) => {
            await this.plugin.updateSettings({ meetingNotePath: value.trim() || "meetings" });
          }),
      );

    new Setting(containerEl)
      .setName("My emails")
      .setDesc("Your email addresses, filtered from attendee lists (comma-separated).")
      .addText((text) =>
        text
          .setPlaceholder("you@work.com, you@personal.com")
          .setValue(this.plugin.settings.myEmails.join(", "))
          .onChange(async (value) => {
            const emails = value
              .split(",")
              .map((s) => s.trim().toLowerCase())
              .filter(Boolean);
            await this.plugin.updateSettings({ myEmails: emails });
          }),
      );

    containerEl.createEl("h2", { text: "Display" });

    new Setting(containerEl)
      .setName("Refresh interval")
      .setDesc("How often to re-fetch calendar events (minutes).")
      .addDropdown((dropdown) =>
        dropdown
          .addOptions({ "5": "5", "10": "10", "15": "15", "30": "30", "60": "60" })
          .setValue(String(this.plugin.settings.refreshIntervalMinutes))
          .onChange(async (value) => {
            await this.plugin.updateSettings({ refreshIntervalMinutes: Number(value) });
          }),
      );

    new Setting(containerEl)
      .setName("Ignore patterns")
      .setDesc(
        "Event titles containing these words are hidden (comma-separated, case-insensitive).",
      )
      .addTextArea((text) =>
        text
          .setPlaceholder("commute, lunch, focus time")
          .setValue(this.plugin.settings.ignorePatterns.join(", "))
          .onChange(async (value) => {
            const patterns = value
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            await this.plugin.updateSettings({ ignorePatterns: patterns });
          }),
      );

    containerEl.createEl("h2", { text: "People Lookup" });

    new Setting(containerEl)
      .setName("People folders")
      .setDesc("Folders to scan for person notes with email frontmatter (comma-separated).")
      .addTextArea((text) =>
        text
          .setPlaceholder("people, team")
          .setValue(this.plugin.settings.peopleFolders.join(", "))
          .onChange(async (value) => {
            const folders = value
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            await this.plugin.updateSettings({ peopleFolders: folders });
          }),
      );
  }

  private renderCalendarList(containerEl: HTMLElement): void {
    const calendars = this.plugin.settings.calendars;

    for (let i = 0; i < calendars.length; i++) {
      const cal = calendars[i];
      const setting = new Setting(containerEl)
        .setName(cal.name || `Calendar ${i + 1}`)
        .setDesc(cal.url ? truncateUrl(cal.url) : "No URL set");

      setting.addExtraButton((btn) =>
        btn
          .setIcon("pencil")
          .setTooltip("Edit")
          .onClick(() => {
            this.openCalendarModal(i);
          }),
      );

      setting.addExtraButton((btn) =>
        btn
          .setIcon("trash")
          .setTooltip("Remove")
          .onClick(async () => {
            const updated = calendars.filter((_, idx) => idx !== i);
            await this.plugin.updateSettings({ calendars: updated });
            this.display();
          }),
      );
    }

    new Setting(containerEl).addButton((btn) =>
      btn
        .setButtonText("Add calendar")
        .setCta()
        .onClick(() => {
          this.openCalendarModal(-1);
        }),
    );
  }

  private openCalendarModal(index: number): void {
    const existing = index >= 0 ? this.plugin.settings.calendars[index] : undefined;
    const defaultColor =
      DEFAULT_COLORS[this.plugin.settings.calendars.length % DEFAULT_COLORS.length];

    const plugin = this.plugin;
    const settingTab = this;

    let name = existing?.name ?? "";
    let url = existing?.url ?? "";
    let color = existing?.color ?? defaultColor;

    const modal = new (class extends Modal {
      onOpen() {
        const { contentEl } = this;
        contentEl.createEl("h3", { text: index >= 0 ? "Edit Calendar" : "Add Calendar" });

        new Setting(contentEl).setName("Name").addText((text) =>
          text
            .setPlaceholder("Work")
            .setValue(name)
            .onChange((v) => {
              name = v;
            }),
        );

        new Setting(contentEl).setName("ICS URL").addText((text) =>
          text
            .setPlaceholder("https://calendar.google.com/calendar/ical/.../basic.ics")
            .setValue(url)
            .onChange((v) => {
              url = v;
            }),
        );

        new Setting(contentEl).setName("Accent color").addColorPicker((cp) =>
          cp.setValue(color.startsWith("var(") ? "#5b8def" : color).onChange((v) => {
            color = v;
          }),
        );

        new Setting(contentEl).addButton((btn) =>
          btn
            .setButtonText("Save")
            .setCta()
            .onClick(async () => {
              if (!url.trim()) return;
              const entry: CalendarSource = {
                name: name.trim() || "Calendar",
                url: url.trim(),
                color,
              };

              const calendars = [...plugin.settings.calendars];
              if (index >= 0) {
                calendars[index] = entry;
              } else {
                calendars.push(entry);
              }

              await plugin.updateSettings({ calendars });
              this.close();
            }),
        );
      }

      onClose() {
        this.contentEl.empty();
        settingTab.display();
      }
    })(this.app);

    modal.open();
  }
}

function truncateUrl(url: string): string {
  return url.length > 60 ? url.slice(0, 57) + "..." : url;
}
