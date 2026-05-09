import type { LoadedPlugin, PluginType } from "./plugin-types.js";
import { OboraError, OboraErrorCode } from "./runtime-errors.js";

export interface PluginRegistryOptions {
  allowOverride?: boolean;
}

export interface RegisterOptions {
  override?: boolean;
}

export class PluginRegistry {
  private readonly plugins = new Map<PluginType, Map<string, LoadedPlugin>>();
  private readonly allowOverride: boolean;

  constructor(options: PluginRegistryOptions = {}) {
    this.allowOverride = options.allowOverride ?? false;
  }

  register(plugin: LoadedPlugin, options: RegisterOptions = {}): void {
    const type = plugin.descriptor.metadata.type;
    const name = plugin.descriptor.metadata.name;

    const byType = this.plugins.get(type) ?? new Map<string, LoadedPlugin>();
    const existing = byType.get(name);
    const shouldOverride = options.override ?? this.allowOverride;

    if (existing && !shouldOverride) {
      throw OboraError.pluginConflict(name);
    }

    if (existing && shouldOverride) {
      // Conceptual lifecycle: plugin_unload(existing) -> plugin_load(new)
      byType.delete(name);
    }

    byType.set(name, plugin);
    this.plugins.set(type, byType);
  }

  unregister(type: PluginType, name: string): boolean {
    const byType = this.plugins.get(type);
    if (!byType) {
      return false;
    }

    const removed = byType.delete(name);
    if (byType.size === 0) {
      this.plugins.delete(type);
    }

    return removed;
  }

  get(type: PluginType, name: string): LoadedPlugin | undefined {
    return this.plugins.get(type)?.get(name);
  }

  getAll(type?: PluginType): LoadedPlugin[] {
    if (type) {
      return [...(this.plugins.get(type)?.values() ?? [])];
    }

    return [...this.plugins.values()].flatMap((byType) => [...byType.values()]);
  }

  has(type: PluginType, name: string): boolean {
    return this.plugins.get(type)?.has(name) ?? false;
  }

  clear(): void {
    this.plugins.clear();
  }
}
