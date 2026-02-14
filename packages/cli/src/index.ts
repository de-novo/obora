import { createRequire } from "node:module";

import { Command } from "commander";

import { createAgentsCommand } from "./commands/agents.js";
import { createAuthCommand } from "./commands/auth.js";
import { createDoneCommand } from "./commands/done.js";
import { createDashboardCommand } from "./commands/dashboard.js";
import { createInitCommand } from "./commands/init.js";
import { createNewCommand } from "./commands/new.js";
import { createPlanCommand } from "./commands/plan.js";
import { createRunCommand } from "./commands/run.js";
import { createStatusCommand } from "./commands/status.js";
import { createSkillsCommand } from "./commands/skills.js";
import { validateCommand } from "./commands/validate.js";
import { CLIError } from "./errors.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json");

const program = new Command();

program.name("obora").description("AI Agent-based workflow automation tool").version(version);

// Register commands
program.addCommand(createInitCommand());
program.addCommand(createAuthCommand());
program.addCommand(createAgentsCommand());
program.addCommand(createSkillsCommand());
program.addCommand(createNewCommand());
program.addCommand(createPlanCommand());
program.addCommand(createRunCommand());
program.addCommand(createStatusCommand());
program.addCommand(createDoneCommand());
program.addCommand(createDashboardCommand());
program.addCommand(validateCommand());

export async function main() {
  try {
    await program.parseAsync(process.argv);
  } catch (err) {
    if (err instanceof CLIError) {
      if (err.message) {
        console.error(err.message);
      }
      process.exit(err.exitCode);
    }
    // Re-throw non-CLI errors
    throw err;
  }
}
