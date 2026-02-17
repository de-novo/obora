import { readFile, readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

import type { LoadedPlugin, PluginDescriptor } from "./plugin-types.js";
import { validatePluginMetadata } from "./plugin-validator.js";
import { OboraError, OboraErrorCode } from "./runtime.js";

export interface PluginLoaderOptions {
  /** Paths to scan for plugins (default: node_modules in cwd) */
  searchPaths?: string[];
  /** Working directory (default: process.cwd()) */
  cwd?: string;
}

export class PluginLoader {
  private readonly searchPaths: string[];
  private readonly cwd: string;

  constructor(options?: PluginLoaderOptions) {
    this.cwd = options?.cwd ?? process.cwd();
    this.searchPaths = options?.searchPaths ?? [join(this.cwd, "node_modules")];
  }

  /**
   * Scan search paths for packages with `obora` metadata in package.json.
   * Returns validated plugin descriptors.
   */
  async scan(): Promise<PluginDescriptor[]> {
    const descriptors: PluginDescriptor[] = [];

    for (const searchPath of this.searchPaths) {
      try {
        const entries = await readdir(searchPath);
        for (const entry of entries) {
          if (entry.startsWith("@")) {
            const scopePath = join(searchPath, entry);
            const scopeEntries = await readdir(scopePath).catch(() => [] as string[]);
            for (const scopeEntry of scopeEntries) {
              const pkgPath = join(scopePath, scopeEntry);
              const descriptor = await this.tryReadPlugin(pkgPath, `${entry}/${scopeEntry}`);
              if (descriptor) descriptors.push(descriptor);
            }
          } else {
            const pkgPath = join(searchPath, entry);
            const descriptor = await this.tryReadPlugin(pkgPath, entry);
            if (descriptor) descriptors.push(descriptor);
          }
        }
      } catch {
        // Search path doesn't exist, skip
      }
    }

    return descriptors;
  }

  /**
   * Load a plugin by dynamically importing its exports module.
   */
  async load(descriptor: PluginDescriptor): Promise<LoadedPlugin> {
    const modulePath = resolve(descriptor.packagePath, descriptor.metadata.exports);
    try {
      const module = await import(modulePath);
      return { descriptor, module };
    } catch (error) {
      throw new OboraError(
        `Failed to load plugin "${descriptor.metadata.name}" from ${modulePath}: ${error instanceof Error ? error.message : String(error)}`,
        OboraErrorCode.SDK_PLUGIN_LOAD_FAILED,
      );
    }
  }

  /**
   * Scan and load all discovered plugins.
   */
  async scanAndLoad(): Promise<LoadedPlugin[]> {
    const descriptors = await this.scan();
    const loaded: LoadedPlugin[] = [];

    for (const descriptor of descriptors) {
      loaded.push(await this.load(descriptor));
    }

    return loaded;
  }

  private async tryReadPlugin(pkgPath: string, packageName: string): Promise<PluginDescriptor | null> {
    try {
      const pkgJsonPath = join(pkgPath, "package.json");
      const pkgStat = await stat(pkgJsonPath).catch(() => null);
      if (!pkgStat?.isFile()) {
        return null;
      }

      const content = await readFile(pkgJsonPath, "utf-8");
      const pkg = JSON.parse(content) as {
        name?: string;
        version?: string;
        obora?: unknown;
      };

      if (!pkg.obora) {
        return null;
      }

      const metadata = validatePluginMetadata(packageName, pkg.obora);
      return {
        packageName: pkg.name ?? packageName,
        version: pkg.version ?? "0.0.0",
        packagePath: pkgPath,
        metadata,
      };
    } catch (error) {
      if (error instanceof OboraError) {
        throw error;
      }

      return null;
    }
  }
}
