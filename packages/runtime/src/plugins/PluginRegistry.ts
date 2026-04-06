import type { AnyPlugin, OboraPlugin, PluginType } from "./types.js";
import { assertValidPlugin } from "./validator.js";

export interface RegisterOptions {
  replace?: boolean;
}

export class PluginRegistry {
  private readonly byName = new Map<string, AnyPlugin>();
  private readonly byType = new Map<PluginType, Map<string, AnyPlugin>>();

  async register(plugin: AnyPlugin, options: RegisterOptions = {}): Promise<void> {
    assertValidPlugin(plugin);

    const existing = this.byName.get(plugin.name);
    if (existing && !options.replace) {
      throw new Error(`Plugin '${plugin.name}' is already registered`);
    }

    if (existing) {
      await this.unregister(existing.name);
    }

    let bucket = this.byType.get(plugin.type);
    if (!bucket) {
      bucket = new Map<string, AnyPlugin>();
      this.byType.set(plugin.type, bucket);
    }

    bucket.set(plugin.name, plugin);
    this.byName.set(plugin.name, plugin);
    await plugin.onLoad?.();
  }

  async registerAll(plugins: readonly AnyPlugin[], options: RegisterOptions = {}): Promise<void> {
    for (const plugin of plugins) {
      await this.register(plugin, options);
    }
  }

  async unregister(name: string): Promise<void> {
    const plugin = this.byName.get(name);
    if (!plugin) {
      return;
    }

    this.byName.delete(name);
    this.byType.get(plugin.type)?.delete(name);
    await plugin.onUnload?.();
  }

  get<T extends OboraPlugin>(type: PluginType, name: string): T {
    const plugin = this.byType.get(type)?.get(name);
    if (!plugin) {
      throw new Error(`Plugin '${name}' of type '${type}' was not found`);
    }

    return plugin as unknown as T;
  }

  has(type: PluginType, name: string): boolean {
    return this.byType.get(type)?.has(name) ?? false;
  }

  list(type?: PluginType): OboraPlugin[] {
    if (!type) {
      return [...this.byName.values()];
    }

    return [...(this.byType.get(type)?.values() ?? [])];
  }

  async clear(): Promise<void> {
    const names = [...this.byName.keys()];
    for (const name of names) {
      await this.unregister(name);
    }
  }
}
