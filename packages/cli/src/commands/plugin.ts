import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { PluginLoader, PluginManager } from "@obora/sdk";
import { Command } from "commander";

import { CLIError } from "../utils/cli-error.js";
import { handleCommandAction } from "../utils/error-handler.js";
import { ExitCode } from "../utils/exit-codes.js";
import { formatter } from "../utils/formatter.js";
import { getGlobalOpts, type GlobalOptions } from "../utils/global-opts.js";

const execFileAsync = promisify(execFile);

interface PluginCommandOptions {
  json?: boolean;
}

function shouldOutputJson(localJson: boolean | undefined, globalOpts: GlobalOptions): boolean {
  return Boolean(localJson || globalOpts.json);
}

async function scanPlugins() {
  const manager = new PluginManager({ cwd: process.cwd() });
  const loader = new PluginLoader({ cwd: process.cwd() });

  try {
    return {
      manager,
      plugins: await loader.scan(),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CLIError(`Failed to scan plugins: ${message}`, ExitCode.EXECUTION_FAILED);
  }
}

async function runNpmCommand(args: string[]): Promise<void> {
  try {
    await execFileAsync("npm", args, { cwd: process.cwd() });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CLIError(`npm ${args.join(" ")} failed: ${message}`, ExitCode.EXECUTION_FAILED);
  }
}

export function createPluginCommand(): Command {
  const cmd = new Command("plugin").description("Manage plugins");

  cmd
    .command("list")
    .description("List installed plugins")
    .option("--json", "Output as JSON")
    .action(async function (this: Command, options: PluginCommandOptions = {}) {
      const globalOpts = getGlobalOpts(this);
      await handleCommandAction(
        async () => {
          const { plugins } = await scanPlugins();

          const rows = plugins.map((plugin) => ({
            name: plugin.metadata.name,
            type: plugin.metadata.type,
            version: plugin.version,
            path: plugin.packagePath,
          }));

          if (shouldOutputJson(options.json, globalOpts)) {
            formatter.json({ command: "plugin list", plugins: rows });
            return;
          }

          if (rows.length === 0) {
            if (!globalOpts.quiet) {
              formatter.info("No Obora plugins discovered.");
            }
            return;
          }

          if (!globalOpts.quiet) {
            formatter.table(rows);
          }
        },
        { verbose: Boolean(globalOpts.verbose) }
      );
    });

  cmd
    .command("install <name>")
    .description("Install a plugin")
    .option("--json", "Output as JSON")
    .action(async function (this: Command, name: string, options: PluginCommandOptions = {}) {
      const globalOpts = getGlobalOpts(this);
      await handleCommandAction(
        async () => {
          await runNpmCommand(["install", name]);
          const { plugins } = await scanPlugins();
          const installed = plugins.find(
            (plugin) => plugin.packageName === name || plugin.metadata.name === name
          );

          if (!installed) {
            throw new CLIError(
              `Plugin installation not detected after npm install: ${name}`,
              ExitCode.EXECUTION_FAILED
            );
          }

          if (shouldOutputJson(options.json, globalOpts)) {
            formatter.json({ command: "plugin install", name, installed: true, plugin: installed });
          } else if (!globalOpts.quiet) {
            formatter.success(`Installed plugin: ${installed.metadata.name}`);
          }
        },
        { verbose: Boolean(globalOpts.verbose) }
      );
    });

  cmd
    .command("remove <name>")
    .description("Remove a plugin")
    .option("--json", "Output as JSON")
    .action(async function (this: Command, name: string, options: PluginCommandOptions = {}) {
      const globalOpts = getGlobalOpts(this);
      await handleCommandAction(
        async () => {
          await runNpmCommand(["uninstall", name]);
          const { plugins } = await scanPlugins();
          const remaining = plugins.find(
            (plugin) => plugin.packageName === name || plugin.metadata.name === name
          );

          if (remaining) {
            throw new CLIError(
              `Plugin still present after npm uninstall: ${name}`,
              ExitCode.EXECUTION_FAILED
            );
          }

          if (shouldOutputJson(options.json, globalOpts)) {
            formatter.json({ command: "plugin remove", name, removed: true });
          } else if (!globalOpts.quiet) {
            formatter.success(`Removed plugin: ${name}`);
          }
        },
        { verbose: Boolean(globalOpts.verbose) }
      );
    });

  cmd
    .command("inspect <name>")
    .description("Inspect plugin details")
    .option("--json", "Output as JSON")
    .action(async function (this: Command, name: string, options: PluginCommandOptions = {}) {
      const globalOpts = getGlobalOpts(this);
      await handleCommandAction(
        async () => {
          const { manager, plugins } = await scanPlugins();

          const descriptor = plugins.find(
            (plugin) => plugin.packageName === name || plugin.metadata.name === name
          );
          if (!descriptor) {
            throw new CLIError(`Plugin not found: ${name}`, ExitCode.VALIDATION_ERROR);
          }

          const loaded = await manager.loadAndRegister(descriptor).catch((error: unknown) => {
            const message = error instanceof Error ? error.message : String(error);
            throw new CLIError(
              `Failed to inspect plugin ${name}: ${message}`,
              ExitCode.EXECUTION_FAILED
            );
          });

          const detail = {
            packageName: descriptor.packageName,
            version: descriptor.version,
            path: descriptor.packagePath,
            metadata: descriptor.metadata,
            exports: Object.keys((loaded.module as Record<string, unknown>) ?? {}),
          };

          if (shouldOutputJson(options.json, globalOpts)) {
            formatter.json({ command: "plugin inspect", name, plugin: detail });
          } else if (!globalOpts.quiet) {
            formatter.json(detail);
          }
        },
        { verbose: Boolean(globalOpts.verbose) }
      );
    });

  return cmd;
}
