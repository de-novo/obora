import { createRequire } from "node:module";

import { Command } from "commander";

const require = createRequire(import.meta.url);
const { version } = require("../package.json");

const program = new Command();

program.name("obora").description("AI Agent-based workflow automation tool").version(version);

// 서브커맨드 placeholder
program
  .command("init")
  .description("Initialize obora project")
  .action(() => console.log("obora init - coming soon"));

program
  .command("new <name>")
  .description("Create new feature")
  .action((name) => console.log(`obora new ${name} - coming soon`));

export function main() {
  program.parse();
}
