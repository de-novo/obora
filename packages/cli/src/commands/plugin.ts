import { Command } from "commander";

import { CLIError } from "../utils/cli-error.js";
import { ExitCode } from "../utils/exit-codes.js";

async function handleStub(fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    process.exitCode = ExitCode.SUCCESS;
  } catch (err: unknown) {
    if (err instanceof CLIError) {
      console.error(err.message);
      process.exitCode = err.exitCode;
    } else {
      console.error("Unexpected error:", err);
      process.exitCode = ExitCode.CLI_ERROR;
    }
  }
}

export function createPluginCommand(): Command {
  const cmd = new Command("plugin").description("Manage plugins");

  cmd.command("list").description("List installed plugins").action(async () => {
    await handleStub(async () => {
      console.log("[stub] obora plugin list");
    });
  });

  cmd.command("install <name>").description("Install a plugin").action(async (name) => {
    await handleStub(async () => {
      console.log(`[stub] obora plugin install ${name}`);
    });
  });

  cmd.command("remove <name>").description("Remove a plugin").action(async (name) => {
    await handleStub(async () => {
      console.log(`[stub] obora plugin remove ${name}`);
    });
  });

  cmd.command("inspect <name>").description("Inspect plugin details").action(async (name) => {
    await handleStub(async () => {
      console.log(`[stub] obora plugin inspect ${name}`);
    });
  });

  return cmd;
}
