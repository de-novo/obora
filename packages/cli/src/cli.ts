import { Command } from "commander";

import { createRunCommand } from "./commands/run.js";
import { createTestCommand } from "./commands/test.js";
import { createPluginCommand } from "./commands/plugin.js";
import { createAuditCommand } from "./commands/audit.js";
import { createPolicyCommand } from "./commands/policy.js";
import { createInitCommand } from "./commands/init.js";

export function createCLI(): Command {
  const program = new Command("obora")
    .description("Obora AI Control Runtime CLI")
    .version("0.1.0");

  program.addCommand(createInitCommand());
  program.addCommand(createRunCommand());
  program.addCommand(createTestCommand());
  program.addCommand(createPluginCommand());
  program.addCommand(createAuditCommand());
  program.addCommand(createPolicyCommand());

  return program;
}
