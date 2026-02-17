import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { Command } from "commander";

import { CLIError } from "../utils/cli-error.js";
import { ExitCode } from "../utils/exit-codes.js";

export async function runInit(_options: Record<string, unknown>): Promise<void> {
  const dir = process.cwd();

  await mkdir(join(dir, "workflows"), { recursive: true });
  await mkdir(join(dir, "policies"), { recursive: true });
  await mkdir(join(dir, "tests"), { recursive: true });

  await writeFile(
    join(dir, "workflows", "example.yaml"),
    `name: example\nversion: "1.0"\nsteps:\n  - name: greet\n    agent: default\n`,
  );
  await writeFile(join(dir, "policies", "default.yaml"), `version: "1.0"\nrules: []\n`);
  await writeFile(
    join(dir, "obora.config.yaml"),
    `version: "1.0"\nworkflows: ./workflows\npolicies: ./policies\ntests: ./tests\n`,
  );

  console.log("✅ Obora project initialized.");
}

export function createInitCommand(): Command {
  return new Command("init")
    .description("Initialize a new Obora project")
    .option("--template <name>", "Project template", "default")
    .option("-y, --yes", "Skip prompts, use defaults")
    .action(async (options) => {
      try {
        await runInit(options);
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
    });
}
