import { Command } from "commander";

export function createPluginCommand(): Command {
  const cmd = new Command("plugin").description("Manage plugins");
  cmd.command("list").description("List installed plugins").action(async () => {
    console.log("[stub] obora plugin list");
  });
  cmd.command("install <name>").description("Install a plugin").action(async (name) => {
    console.log(`[stub] obora plugin install ${name}`);
  });
  cmd.command("remove <name>").description("Remove a plugin").action(async (name) => {
    console.log(`[stub] obora plugin remove ${name}`);
  });
  cmd.command("inspect <name>").description("Inspect plugin details").action(async (name) => {
    console.log(`[stub] obora plugin inspect ${name}`);
  });
  return cmd;
}
