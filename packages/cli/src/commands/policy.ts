import { Command } from "commander";

export function createPolicyCommand(): Command {
  const cmd = new Command("policy").description("Policy management");

  cmd
    .command("validate <path>")
    .description("Validate policy/workflow YAML")
    .action(async (path) => {
      console.log(`[stub] obora policy validate ${path}`);
    });

  return cmd;
}
