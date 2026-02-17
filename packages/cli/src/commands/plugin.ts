import { Command } from "commander";

import { handleCommandAction } from "../utils/error-handler.js";
import { formatter } from "../utils/formatter.js";
import { getGlobalOpts } from "../utils/global-opts.js";

export function createPluginCommand(): Command {
  const cmd = new Command("plugin").description("Manage plugins");

  cmd.command("list").description("List installed plugins").action(async function (this: Command, _options) {
    await handleCommandAction(async () => {
      const globalOpts = getGlobalOpts(this);
      if (!globalOpts.quiet && !globalOpts.json) {
        formatter.info("[stub] obora plugin list");
      }
    });
  });

  cmd.command("install <name>").description("Install a plugin").action(async function (this: Command, name, options) {
    await handleCommandAction(async () => {
      const globalOpts = getGlobalOpts(this);
      if (globalOpts.json) {
        formatter.json({ command: "plugin install", name, stub: true });
      } else if (!globalOpts.quiet) {
        formatter.info(`[stub] obora plugin install ${name}`);
      }
    });
  });

  cmd.command("remove <name>").description("Remove a plugin").action(async function (this: Command, name, options) {
    await handleCommandAction(async () => {
      const globalOpts = getGlobalOpts(this);
      if (globalOpts.json) {
        formatter.json({ command: "plugin remove", name, stub: true });
      } else if (!globalOpts.quiet) {
        formatter.info(`[stub] obora plugin remove ${name}`);
      }
    });
  });

  cmd.command("inspect <name>").description("Inspect plugin details").action(async function (this: Command, name, options) {
    await handleCommandAction(async () => {
      const globalOpts = getGlobalOpts(this);
      if (globalOpts.json) {
        formatter.json({ command: "plugin inspect", name, stub: true });
      } else if (!globalOpts.quiet) {
        formatter.info(`[stub] obora plugin inspect ${name}`);
      }
    });
  });

  return cmd;
}
