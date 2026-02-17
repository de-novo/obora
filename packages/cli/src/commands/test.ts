import { Command } from "commander";

export function createTestCommand(): Command {
  return new Command("test")
    .description("Run workflow tests")
    .argument("[target]", "Workflow or test suite path")
    .option("--fixture <path>", "YAML fixture file")
    .option("--filter <pattern>", "Filter test cases by name")
    .action(async (target, options) => {
      console.log(`[stub] obora test ${target ?? "all"}`, options);
      process.exit(0);
    });
}
