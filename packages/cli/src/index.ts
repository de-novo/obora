import { fileURLToPath } from "node:url";

import { createCLI } from "./cli.js";
import { CLIError } from "./errors.js";

export async function main() {
  const program = createCLI();

  try {
    await program.parseAsync(process.argv);
  } catch (err) {
    if (err instanceof CLIError) {
      if (err.message) {
        console.error(err.message);
      }
      process.exit(err.exitCode);
    }
    throw err;
  }
}

const isDirectExecution = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectExecution) {
  void main();
}
