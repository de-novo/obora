import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { Command } from "commander";

import { handleCommandAction } from "../utils/error-handler.js";
import { formatter } from "../utils/formatter.js";
import { getGlobalOpts } from "../utils/global-opts.js";

export async function runInit(options: Record<string, unknown>): Promise<void> {
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

  if (options.json) {
    formatter.json({ initialized: true, path: dir });
  } else if (!options.quiet) {
    formatter.success("Obora project initialized.");
  }
}

export function createInitCommand(): Command {
  return new Command("init")
    .description("Initialize a new Obora project")
    .option("--template <name>", "Project template", "default")
    .option("-y, --yes", "Skip prompts, use defaults")
    .action(async function (this: Command, options) {
      const mergedOptions = { ...getGlobalOpts(this), ...options };
      await handleCommandAction(async () => {
        await runInit(mergedOptions);
      }, { verbose: Boolean(mergedOptions.verbose) });
    });
}
