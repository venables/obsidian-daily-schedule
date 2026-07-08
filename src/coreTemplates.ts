import type { App } from "obsidian"

// The core "Templates" plugin is not in obsidian.d.ts. We poke at
// `app.internalPlugins` defensively and fall back to our own defaults when the
// plugin is disabled or a future Obsidian release reshapes this surface.
export interface CoreTemplatesFormats {
  readonly dateFormat: string | null
  readonly timeFormat: string | null
}

export const NO_CORE_FORMATS: CoreTemplatesFormats = {
  dateFormat: null,
  timeFormat: null
}

interface InternalPluginInstance {
  readonly enabled?: boolean
  readonly instance?: {
    readonly options?: {
      readonly dateFormat?: unknown
      readonly timeFormat?: unknown
    }
  }
}

interface InternalPluginsHost {
  readonly internalPlugins?: {
    readonly plugins?: {
      readonly templates?: InternalPluginInstance
    }
  }
}

function asFormat(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null
}

// Reads the date/time formats the user configured in the core Templates
// plugin, so our {{date}} / {{time}} substitutions match what the core
// plugin itself would have produced.
export function getCoreTemplatesFormats(app: App): CoreTemplatesFormats {
  // eslint-disable-next-line typescript-eslint/no-unsafe-type-assertion -- internalPlugins is not in obsidian.d.ts
  const host = app as unknown as InternalPluginsHost
  const plugin = host.internalPlugins?.plugins?.templates
  if (!plugin?.enabled) {
    return NO_CORE_FORMATS
  }
  const options = plugin.instance?.options
  return {
    dateFormat: asFormat(options?.dateFormat),
    timeFormat: asFormat(options?.timeFormat)
  }
}
