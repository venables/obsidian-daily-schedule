import { Plugin } from "obsidian";
import { DEFAULT_SETTINGS, DailyScheduleSettingTab, type DailyScheduleSettings } from "./settings";
import { ScheduleView, VIEW_TYPE } from "./view";

export default class DailySchedulePlugin extends Plugin {
  settings: DailyScheduleSettings = DEFAULT_SETTINGS;
  private refreshIntervalId: number | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.registerView(VIEW_TYPE, (leaf) => new ScheduleView(leaf, this));

    this.addSettingTab(new DailyScheduleSettingTab(this.app, this));

    this.addRibbonIcon("calendar-clock", "Open daily schedule", () => {
      this.activateView();
    });

    this.addCommand({
      id: "open-daily-schedule",
      name: "Open daily schedule",
      callback: () => this.activateView(),
    });

    this.addCommand({
      id: "refresh-daily-schedule",
      name: "Refresh daily schedule",
      callback: () => this.refreshView(),
    });

    this.app.workspace.onLayoutReady(() => {
      this.startRefreshInterval();
    });
  }

  onunload(): void {
    this.stopRefreshInterval();
  }

  async loadSettings(): Promise<void> {
    const data = await this.loadData();
    this.settings = { ...DEFAULT_SETTINGS, ...data };
  }

  async updateSettings(partial: Partial<DailyScheduleSettings>): Promise<void> {
    this.settings = { ...this.settings, ...partial };
    await this.saveData({ ...this.settings });

    // Restart refresh interval if it changed
    if ("refreshIntervalMinutes" in partial) {
      this.stopRefreshInterval();
      this.startRefreshInterval();
    }

    // Refresh view if calendar-relevant settings changed
    if (
      "calendars" in partial ||
      "ignorePatterns" in partial ||
      "myEmails" in partial ||
      "peopleFolders" in partial
    ) {
      this.refreshView();
    }
  }

  private async activateView(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE);
    if (existing.length > 0) {
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }

    const leaf = this.app.workspace.getRightLeaf(false);
    if (leaf) {
      await leaf.setViewState({ type: VIEW_TYPE, active: true });
      this.app.workspace.revealLeaf(leaf);
    }
  }

  private refreshView(): void {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE);
    for (const leaf of leaves) {
      const view = leaf.view;
      if (view instanceof ScheduleView) {
        view.refresh();
      }
    }
  }

  private startRefreshInterval(): void {
    this.stopRefreshInterval();
    const ms = this.settings.refreshIntervalMinutes * 60 * 1000;
    this.refreshIntervalId = this.registerInterval(
      window.setInterval(() => this.refreshView(), ms),
    );
  }

  private stopRefreshInterval(): void {
    if (this.refreshIntervalId !== null) {
      window.clearInterval(this.refreshIntervalId);
      this.refreshIntervalId = null;
    }
  }
}
