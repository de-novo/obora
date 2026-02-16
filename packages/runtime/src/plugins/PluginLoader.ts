import path from "node:path";
import { pathToFileURL } from "node:url";

import type { AnyPlugin } from "./types.js";
import { PluginRegistry } from "./PluginRegistry.js";

export class PluginLoader {
  private readonly loaded = new Map<string, AnyPlugin>();

  constructor(private readonly registry: PluginRegistry) {}

  async load(plugin: AnyPlugin, options: { replace?: boolean } = {}): Promise<void> {
    await this.registry.register(plugin, options);
    this.loaded.set(plugin.name, plugin);
  }

  async loadFromModule(modulePath: string, exportName = "default", options: { replace?: boolean } = {}): Promise<void> {
    const absolutePath = path.isAbsolute(modulePath) ? modulePath : path.resolve(process.cwd(), modulePath);
    const moduleUrl = pathToFileURL(absolutePath).href;
    const moduleExports = await import(moduleUrl);
    const candidate = moduleExports[exportName] as AnyPlugin | (() => AnyPlugin | Promise<AnyPlugin>);

    if (!candidate) {
      throw new Error(`Export '${exportName}' was not found in module '${modulePath}'`);
    }

    const plugin = typeof candidate === "function" ? await candidate() : candidate;
    await this.load(plugin, options);
  }

  async unload(name: string): Promise<void> {
    if (!this.loaded.has(name)) {
      return;
    }

    await this.registry.unregister(name);
    this.loaded.delete(name);
  }

  async unloadAll(): Promise<void> {
    const names = [...this.loaded.keys()];
    for (const name of names) {
      await this.unload(name);
    }
  }

  listLoaded(): string[] {
    return [...this.loaded.keys()];
  }
}
