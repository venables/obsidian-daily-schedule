import type { App, TFile } from "obsidian"

// The core "Templates" plugin is not in obsidian.d.ts. We poke at
// `app.internalPlugins` defensively and only expose a callable when both the
// plugin is enabled and the method we depend on actually exists, so a future
// Obsidian release that reshapes this surface degrades to our own renderer
// instead of throwing.
export interface CoreTemplatesAPI {
  insertTemplate(file: TFile): unknown
}

interface InternalPluginInstance {
  readonly enabled?: boolean
  readonly instance?: {
    readonly insertTemplate?: unknown
  }
}

interface InternalPluginsHost {
  readonly internalPlugins?: {
    readonly plugins?: {
      readonly templates?: InternalPluginInstance
    }
  }
}

export function getCoreTemplatesAPI(app: App): CoreTemplatesAPI | null {
  // eslint-disable-next-line typescript-eslint/no-unsafe-type-assertion -- internalPlugins is not in obsidian.d.ts
  const host = app as unknown as InternalPluginsHost
  const plugin = host.internalPlugins?.plugins?.templates
  if (!plugin?.enabled) {
    return null
  }
  const insertTemplate = plugin.instance?.insertTemplate
  if (typeof insertTemplate !== "function") {
    return null
  }
  // eslint-disable-next-line typescript-eslint/no-unsafe-type-assertion -- guarded by the typeof check above
  const instance = plugin.instance as {
    insertTemplate: (file: TFile) => unknown
  }
  return {
    insertTemplate: (file) => instance.insertTemplate(file)
  }
}
