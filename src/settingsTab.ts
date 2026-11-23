import {
  App,
  PluginSettingTab,
  type Setting,
  type SettingDefinitionItem
} from "obsidian"

import { CalendarModal } from "./calendarModal"
import { DEFAULT_MEETING_FILE_PATTERN, meetingNotePath } from "./helpers"
import type DailySchedulePlugin from "./main"
import {
  peopleFolderKey,
  readControlValue,
  settingsUpdate
} from "./settingControls"

const TEMPLATE_DESC =
  "Optional markdown file used as a template. Event placeholders: {{eventTitle}}, {{eventDate[:FMT]}}, {{eventTime[:FMT]}}, {{eventEndTime[:FMT]}}, {{eventLocation}}, {{eventDescription}}, {{eventAttendees}}, {{eventAttendeesYaml}}. Core Templates plugin placeholders ({{title}}, {{date[:FMT]}}, {{time[:FMT]}}) also work and resolve via the core plugin when it's enabled."

const FILENAME_DESC =
  "File path within the base folder. Supports Moment.js date tokens (YYYY, MM, MMM, DD, etc.) and {{title}}. The .md extension is added automatically."

const REFRESH_OPTIONS = {
  "5": "5",
  "10": "10",
  "15": "15",
  "30": "30",
  "60": "60"
}

export class DailyScheduleSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly plugin: DailySchedulePlugin
  ) {
    super(app, plugin)
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    return [
      this.calendarList(),
      this.meetingNotesGroup(),
      this.displayGroup(),
      this.peopleGroup(),
      this.peopleFolderList()
    ]
  }

  getControlValue(key: string): unknown {
    return readControlValue(this.plugin.settings, key)
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    const update = settingsUpdate(this.plugin.settings, key, value)
    if (Object.keys(update).length > 0) {
      await this.plugin.updateSettings(update)
    }
  }

  private calendarList(): SettingDefinitionItem {
    return {
      type: "list",
      heading: "Calendars",
      emptyState: "No calendars yet.",
      items: this.plugin.settings.calendars.map((cal, i) => ({
        name: cal.name || `Calendar ${i + 1}`,
        desc: cal.urlSecret
          ? `URL secret: ${cal.urlSecret}`
          : "No URL secret set",
        action: () => {
          this.openCalendarModal(i)
        }
      })),
      onDelete: (index) => {
        void this.removeCalendar(index)
      },
      addItem: {
        name: "Add calendar",
        action: () => {
          this.openCalendarModal(-1)
        }
      }
    }
  }

  private meetingNotesGroup(): SettingDefinitionItem {
    return {
      type: "group",
      heading: "Meeting notes",
      items: [
        {
          name: "Meeting note path",
          desc: "Base folder for meeting notes.",
          control: {
            type: "folder",
            key: "meetingNotePath",
            placeholder: "meetings"
          }
        },
        {
          name: "Meeting filename",
          desc: FILENAME_DESC,
          render: (setting) => {
            this.renderFilenameSetting(setting)
          }
        },
        {
          name: "Meeting note template",
          desc: TEMPLATE_DESC,
          control: {
            type: "file",
            key: "meetingTemplatePath",
            placeholder: "templates/meeting.md",
            filter: (file) => file.extension === "md"
          }
        },
        {
          name: "My emails",
          desc: "Your email addresses, filtered from attendee lists (comma-separated).",
          control: {
            type: "text",
            key: "myEmails",
            placeholder: "you@work.com, you@personal.com"
          }
        }
      ]
    }
  }

  private displayGroup(): SettingDefinitionItem {
    return {
      type: "group",
      heading: "Display",
      items: [
        {
          name: "Refresh interval",
          desc: "How often to re-fetch calendar events (minutes).",
          control: {
            type: "dropdown",
            key: "refreshIntervalMinutes",
            options: REFRESH_OPTIONS
          }
        },
        {
          name: "Ignore patterns",
          desc: "Event titles containing these words are hidden (comma-separated, case-insensitive).",
          control: {
            type: "textarea",
            key: "ignorePatterns",
            placeholder: "commute, lunch, focus time"
          }
        }
      ]
    }
  }

  private peopleGroup(): SettingDefinitionItem {
    return {
      type: "group",
      heading: "People lookup",
      items: [
        {
          name: "People folders",
          desc: "Folders to scan for person notes with email frontmatter. Attendees whose email appears in a person note's frontmatter are replaced with a wikilink."
        }
      ]
    }
  }

  private peopleFolderList(): SettingDefinitionItem {
    return {
      type: "list",
      emptyState: "No people folders.",
      items: this.plugin.settings.peopleFolders.map((_, i) => ({
        name: `Folder ${i + 1}`,
        control: {
          type: "folder",
          key: peopleFolderKey(i),
          placeholder: "people"
        }
      })),
      onDelete: (index) => {
        void this.removePeopleFolder(index)
      },
      addItem: {
        name: "Add folder",
        action: () => {
          void this.addPeopleFolder()
        }
      }
    }
  }

  /*
   * A plain text control cannot show the resolved path while the user types,
   * so this row renders its own input with a live preview.
   */
  private renderFilenameSetting(setting: Setting): void {
    setting.setName("Meeting filename").setDesc(FILENAME_DESC)
    const previewEl = setting.descEl.createDiv({ cls: "ds-filename-preview" })
    const updatePreview = (pattern: string): void => {
      const resolved = meetingNotePath(
        this.plugin.settings.meetingNotePath,
        pattern,
        new Date(),
        "Example Meeting"
      )
      previewEl.setText(`Preview: ${resolved}`)
    }

    setting.addText((text) =>
      text
        .setPlaceholder(DEFAULT_MEETING_FILE_PATTERN)
        .setValue(this.plugin.settings.meetingFilePattern)
        .onChange(async (value) => {
          updatePreview(value)
          await this.setControlValue("meetingFilePattern", value)
        })
    )
    updatePreview(this.plugin.settings.meetingFilePattern)
  }

  private openCalendarModal(index: number): void {
    new CalendarModal(this.app, this.plugin, index, () => {
      this.update()
    }).open()
  }

  private async removeCalendar(index: number): Promise<void> {
    const calendars = this.plugin.settings.calendars.filter(
      (_, i) => i !== index
    )
    await this.plugin.updateSettings({ calendars })
    this.update()
  }

  private async addPeopleFolder(): Promise<void> {
    const peopleFolders = [...this.plugin.settings.peopleFolders, ""]
    await this.plugin.updateSettings({ peopleFolders })
    this.update()
  }

  private async removePeopleFolder(index: number): Promise<void> {
    const peopleFolders = this.plugin.settings.peopleFolders.filter(
      (_, i) => i !== index
    )
    await this.plugin.updateSettings({ peopleFolders })
    this.update()
  }
}
