import { readFile, readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

import type { LoadedPlugin, PluginDescriptor } from "./plugin-types.js";
import { validatePluginMetadata } from "./plugin-validator.js";
import { OboraError, OboraErrorCode } from "./runtime-errors.js";

export interface PluginLoaderOptions {
  /** Paths to scan for plugins (default: node_modules in cwd) */
  searchPaths?: string[];
  /** Working directory (default: process.cwd()) */
  cwd?: string;
  /** Optional logger for warnings */
  logger?: { warn?: (message: string, ...args: unknown[]) => void };
}

function isErrnoCode(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === code;
}

export class PluginLoader {
  private readonly searchPaths: string[];
  private readonly cwd: string;
  private readonly logger?: { warn?: (message: string, ...args: unknown[]) => void };

  constructor(options?: PluginLoaderOptions) {
    this.cwd = options?.cwd ?? process.cwd();
    this.searchPaths = options?.searchPaths ?? [join(this.cwd, "node_modules")];
    this.logger = options?.logger;
  }

  /**
   * Scan search paths for packages with `obora` metadata in package.json.
   * Returns validated plugin descriptors.
   */
  async scan(): Promise<PluginDescriptor[]> {
    return this.searchPaths.reduce<Promise<PluginDescriptor[]>>(async (previousDescriptors, searchPath) => {
      const descriptors = await previousDescriptors;
      try {
        const entries = await readdir(searchPath);
        const discovered = await entries.reduce<Promise<PluginDescriptor[]>>(async (previousEntries, entry) => {
          const entryDescriptors = await previousEntries;
          if (entry.startsWith("@")) {
            const scopePath = join(searchPath, entry);
            const scopeEntries = await readdir(scopePath).catch((error: unknown) => {
              if (isErrnoCode(error, "ENOENT")) {
                return [] as string[];
              }

              throw error;
            });
            const scopeDescriptors = await scopeEntries.reduce<Promise<PluginDescriptor[]>>(
              async (previousScopeEntries, scopeEntry) => {
                const scoped = await previousScopeEntries;
              const pkgPath = join(scopePath, scopeEntry);
              const descriptor = await this.tryReadPlugin(pkgPath, `${entry}/${scopeEntry}`).catch(
                (error: unknown) => {
                  if (error instanceof OboraError) {
                    return null;
                  }

                  throw error;
                },
              );
                return descriptor ? [...scoped, descriptor] : scoped;
              },
              Promise.resolve([])
            );
            return [...entryDescriptors, ...scopeDescriptors];
          } else {
            const pkgPath = join(searchPath, entry);
            const descriptor = await this.tryReadPlugin(pkgPath, entry).catch((error: unknown) => {
              if (error instanceof OboraError) {
                return null;
              }

              throw error;
            });
            return descriptor ? [...entryDescriptors, descriptor] : entryDescriptors;
          }
        }, Promise.resolve([]));
        return [...descriptors, ...discovered];
      } catch (error: unknown) {
        if (isErrnoCode(error, "ENOENT")) {
          // Search path doesn't exist, skip
          return descriptors;
        }

        throw error;
      }
    }, Promise.resolve([]));
  }

  /**
   * Load a plugin by dynamically importing its exports module.
   */
  async load(descriptor: PluginDescriptor): Promise<LoadedPlugin> {
    const modulePath = resolve(descriptor.packagePath, descriptor.metadata.exports);
    if (!modulePath.startsWith(descriptor.packagePath + "/")) {
      throw OboraError.pluginLoadFailed(descriptor.metadata.name);
    }

    try {
      const module = await import(modulePath);
      return { descriptor, module };
    } catch (error) {
      throw OboraError.pluginLoadFailed(descriptor.metadata.name);
    }
  }

  /**
   * Scan and load all discovered plugins.
   */
  async scanAndLoad(): Promise<LoadedPlugin[]> {
    const descriptors = await this.scan();
    return descriptors.reduce<Promise<LoadedPlugin[]>>(async (previousLoaded, descriptor) => {
      const loaded = await previousLoaded;
      return [...loaded, await this.load(descriptor)];
    }, Promise.resolve([]));
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

      if (error instanceof SyntaxError) {
        // Malformed package.json
        return null;
      }

      if (this.logger?.warn) {
        this.logger.warn(`[plugin-loader] Failed to load plugin '${packageName}':`, error);
      }
      return null;
    }
  }
}
