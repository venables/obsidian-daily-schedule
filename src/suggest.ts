import { AbstractInputSuggest, App, TFile, TFolder } from "obsidian"

abstract class PathSuggest<T> extends AbstractInputSuggest<T> {
  constructor(
    app: App,
    private readonly inputEl: HTMLInputElement
  ) {
    super(app, inputEl)
  }

  selectSuggestion(value: T, evt: MouseEvent | KeyboardEvent): void {
    const picked = this.toPath(value)
    this.inputEl.value = picked
    this.inputEl.dispatchEvent(new Event("input"))
    this.close()
    super.selectSuggestion(value, evt)
  }

  protected abstract toPath(value: T): string
}

export class FolderSuggest extends PathSuggest<TFolder> {
  getSuggestions(query: string): TFolder[] {
    const lower = query.toLowerCase()
    const matches: TFolder[] = []
    for (const file of this.app.vault.getAllLoadedFiles()) {
      if (file instanceof TFolder && file.path.toLowerCase().includes(lower)) {
        matches.push(file)
      }
    }
    return matches.toSorted((a, b) => a.path.localeCompare(b.path))
  }

  renderSuggestion(folder: TFolder, el: HTMLElement): void {
    el.setText(folder.path || "/")
  }

  protected toPath(folder: TFolder): string {
    return folder.path
  }
}

export class MarkdownFileSuggest extends PathSuggest<TFile> {
  getSuggestions(query: string): TFile[] {
    const lower = query.toLowerCase()
    return this.app.vault
      .getMarkdownFiles()
      .filter((f) => f.path.toLowerCase().includes(lower))
      .toSorted((a, b) => a.path.localeCompare(b.path))
  }

  renderSuggestion(file: TFile, el: HTMLElement): void {
    el.setText(file.path)
  }

  protected toPath(file: TFile): string {
    return file.path
  }
}
