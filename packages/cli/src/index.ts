import { createRequire } from "node:module";

import { Command } from "commander";

import { createInitCommand } from "./commands/init.js";
import { createNewCommand } from "./commands/new.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json");

const program = new Command();

program.name("obora").description("AI Agent-based workflow automation tool").version(version);

// Register commands
program.addCommand(createInitCommand());
program.addCommand(createNewCommand());

export function main() {
  program.parse();
}
