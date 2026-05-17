import { getDefaultAuthFilePath, maskProviderAuth } from "@obora/adapters";
import { loadConfig } from "@obora/sdk";
import { Command } from "commander";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";

import { handleCommandAction } from "../utils/error-handler.js";
import { formatter } from "../utils/formatter.js";
import { getGlobalOpts, type GlobalOptions } from "../utils/global-opts.js";

interface ConfigShowOptions {
  json?: boolean;
  sources?: boolean;
}

interface ConfigGetOptions {
  json?: boolean;
}

function shouldOutputJson(localJson: boolean | undefined, globalOpts: GlobalOptions): boolean {
  return Boolean(localJson || globalOpts.json);
}

function getValueByPath(obj: unknown, path: string): unknown {
  const keys = path.split(".");
  return keys.reduce<unknown>((current, key) => {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[key];
  }, obj);
}

async function loadAuthInfo() {
  const authPath = getDefaultAuthFilePath();
  try {
    const content = await readFile(authPath, "utf-8");
    const parsed = JSON.parse(content) as { version?: number; providers?: Record<string, unknown> };
    if (parsed.providers) {
      return Object.entries(parsed.providers).map(([provider, auth]) => ({
        provider,
        ...(typeof auth === "object" && auth !== null
          ? maskProviderAuth(auth as { type: string; apiKey?: string; token?: string; accessToken?: string })
          : {}),
      }));
    }
  } catch {
    // Auth file not found or invalid
  }
  return [];
}

async function loadRawConfigFile(path: string): Promise<unknown | undefined> {
  try {
    const content = await readFile(path, "utf-8");
    return parseYaml(content) as unknown;
  } catch {
    return undefined;
  }
}

async function loadRawConfigSources() {
  const globalPath = join(homedir(), ".obora", "config.yaml");
  const [globalConfig, projectConfig] = await Promise.all([
    loadRawConfigFile(globalPath),
    loadConfig().catch(() => undefined),
  ]);

  const sources: Array<{ name: string; path: string; config: unknown }> = [];

  if (globalConfig) {
    sources.push({ name: "global", path: globalPath, config: globalConfig });
  }

  if (projectConfig) {
    const meta = (projectConfig as unknown as { [key: symbol]: { sources: string[] } | undefined })[
      Symbol.for("obora.config.meta")
    ];
    const projectPath = meta?.sources.find((s) => s !== globalPath);
    if (projectPath) {
      const rawProject = await loadRawConfigFile(projectPath);
      if (rawProject) {
        sources.push({ name: "project", path: projectPath, config: rawProject });
      }
    }
  }

  return sources;
}

export function createConfigCommand(): Command {
  const config = new Command("config").description("Inspect Obora configuration");

  config
    .command("show")
    .description("Show merged configuration with sources and auth")
    .option("--json", "Output as JSON")
    .option("--sources", "Show individual source configs")
    .action(async function (this: Command, options: ConfigShowOptions) {
      const globalOpts = getGlobalOpts(this);
      await handleCommandAction(
        async () => {
          const mergedConfig = await loadConfig();
          const authEntries = await loadAuthInfo();

          if (shouldOutputJson(options.json, globalOpts)) {
            const result: Record<string, unknown> = {
              merged: mergedConfig ?? null,
              auth: authEntries,
            };

            if (options.sources) {
              const sources = await loadRawConfigSources();
              result.sources = sources;
            }

            formatter.json(result);
            return;
          }

          // Human-readable output
          formatter.info("Configuration");

          if (mergedConfig) {
            formatter.step(`Merged config (active)`);
            console.log(JSON.stringify(mergedConfig, null, 2));
          } else {
            formatter.step("No configuration found");
          }

          if (options.sources) {
            formatter.info("Sources");
            const sources = await loadRawConfigSources();
            sources.forEach((source) => {
              formatter.step(`${source.name} (${source.path})`);
              console.log(JSON.stringify(source.config, null, 2));
            });
          }

          formatter.info("Auth");
          if (authEntries.length > 0) {
            formatter.table(authEntries as Array<Record<string, unknown>>);
          } else {
            formatter.step("No auth entries found");
          }
        },
        { verbose: Boolean(globalOpts.verbose) }
      );
    });

  config
    .command("get <path>")
    .description("Get a configuration value by dot-notation path (e.g., agents.architect.model)")
    .option("--json", "Output as JSON")
    .action(async function (this: Command, path: string, options: ConfigGetOptions) {
      const globalOpts = getGlobalOpts(this);
      await handleCommandAction(
        async () => {
          const mergedConfig = await loadConfig();
          const value = getValueByPath(mergedConfig, path);

          if (shouldOutputJson(options.json, globalOpts)) {
            formatter.json({ path, value: value ?? null });
            return;
          }

          if (value === undefined) {
            formatter.warn(`No value found at path: ${path}`);
            return;
          }

          formatter.info(`${path}`);
          if (typeof value === "object") {
            console.log(JSON.stringify(value, null, 2));
          } else {
            console.log(String(value));
          }
        },
        { verbose: Boolean(globalOpts.verbose) }
      );
    });

  return config;
}
