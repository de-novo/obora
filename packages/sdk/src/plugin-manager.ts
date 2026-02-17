import { PluginLoader, type PluginLoaderOptions } from "./plugin-loader.js";
import {
  PluginRegistry,
  type PluginRegistryOptions,
  type RegisterOptions,
} from "./plugin-registry.js";
import type { LoadedPlugin, PluginDescriptor } from "./plugin-types.js";
import { resolvePluginType } from "./plugin-type-map.js";

export interface PluginManagerOptions extends PluginLoaderOptions, PluginRegistryOptions {}

export class PluginManager {
  readonly loader: PluginLoader;
  readonly registry: PluginRegistry;

  constructor(options: PluginManagerOptions = {}) {
    const { searchPaths, cwd, allowOverride } = options;
    this.loader = new PluginLoader({ searchPaths, cwd });
    this.registry = new PluginRegistry({ allowOverride });
  }

  async discoverAndRegister(registerOptions?: RegisterOptions): Promise<LoadedPlugin[]> {
    const loaded = await this.loader.scanAndLoad();

    for (const plugin of loaded) {
      this.registry.register(plugin, registerOptions);
    }

    return loaded;
  }

  async loadAndRegister(
    descriptor: PluginDescriptor,
    registerOptions?: RegisterOptions,
  ): Promise<LoadedPlugin> {
    const loaded = await this.loader.load(descriptor);
    this.registry.register(loaded, registerOptions);
    return loaded;
  }

  getByType(typeOrAlias: string): LoadedPlugin[] {
    const type = resolvePluginType(typeOrAlias);
    return this.registry.getAll(type);
  }

  getPlugin(typeOrAlias: string, name: string): LoadedPlugin | undefined {
    const type = resolvePluginType(typeOrAlias);
    return this.registry.get(type, name);
  }

  unregister(typeOrAlias: string, name: string): boolean {
    const type = resolvePluginType(typeOrAlias);
    return this.registry.unregister(type, name);
  }
}
