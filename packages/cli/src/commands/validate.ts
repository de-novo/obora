/**
 * obora validate command
 * @module @obora/cli/commands/validate
 */

import * as fs from "node:fs";
import * as path from "node:path";

import { parseAndValidate, type ValidationResult, type ValidationError } from "@obora/core";
import chalk from "chalk";
import { Command } from "commander";

/**
 * Options for validate command
 */
interface ValidateOptions {
  /** Validate all workflow files */
  all: boolean;
  /** Validate specific file */
  file?: string;
  /** Treat warnings as errors */
  strict: boolean;
}

/**
 * Color-coded symbols for output
 */
const SYMBOLS = {
  success: chalk.green("✓"),
  error: chalk.red("✗"),
  warning: chalk.yellow("⚠"),
  info: chalk.blue("ℹ"),
} as const;

/**
 * Format a validation error for display
 */
function formatError(error: ValidationError, filePath: string): string {
  const location = error.path ? `${chalk.dim(`[${filePath}:${error.path}]`)}` : "";
  const message = `${SYMBOLS.error} ${location} ${chalk.red(error.message)}`;

  if (error.suggestion) {
    return `${message}\n  ${chalk.dim("→")} ${chalk.cyan(error.suggestion)}`;
  }

  return message;
}

/**
 * Format a validation warning for display
 */
function formatWarning(warning: ValidationError, filePath: string): string {
  const location = warning.path ? `${chalk.dim(`[${filePath}:${warning.path}]`)}` : "";
  return `${SYMBOLS.warning} ${location} ${chalk.yellow(warning.message)}`;
}

/**
 * Validate a single workflow file
 */
function validateFile(filePath: string): ValidationResult {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return parseAndValidate(content);
  } catch (error) {
    return {
      isValid: false,
      errors: [
        {
          code: "FILE_ERROR",
          message: error instanceof Error ? error.message : "Unknown error",
          path: filePath,
          suggestion: "Check file permissions and format",
        },
      ],
      warnings: [],
    };
  }
}

/**
 * Find all workflow files in a directory
 */
function findWorkflowFiles(dir: string): string[] {
  const files: string[] = [];

  if (!fs.existsSync(dir)) {
    return files;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // Recursively search subdirectories
      files.push(...findWorkflowFiles(fullPath));
    } else if (entry.name.endsWith(".yaml") || entry.name.endsWith(".yml")) {
      files.push(fullPath);
    }
  }

  return files.sort();
}

/**
 * Print validation result summary
 */
function printSummary(total: number, passed: number, failed: number, warnings: number): void {
  console.log("");
  console.log(chalk.bold("Results:"));

  const parts: string[] = [];

  if (passed > 0) {
    parts.push(`${chalk.green(passed)} passed`);
  }

  if (failed > 0) {
    parts.push(`${chalk.red(failed)} failed`);
  }

  if (warnings > 0) {
    parts.push(`${chalk.yellow(warnings)} warning${warnings === 1 ? "" : "s"}`);
  }

  console.log(`  ${parts.join(", ")} (${total} total)`);
}

/**
 * Main validate command handler
 */
export function validateCommand(): Command {
  const cmd = new Command("validate")
    .description("Validate workflow YAML files")
    .option("--all", "Validate all workflow files in .obora/workflows and .obora/features")
    .option("-f, --file <path>", "Validate a specific workflow file")
    .option("--strict", "Treat warnings as errors")
    .action((options: ValidateOptions) => {
      let files: string[] = [];

      if (options.file) {
        // Validate specific file
        if (!fs.existsSync(options.file)) {
          console.error(`${SYMBOLS.error} File not found: ${chalk.red(options.file)}`);
          process.exit(1);
        }

        files = [path.resolve(options.file)];
      } else if (options.all) {
        // Validate all workflow files
        const oboraDir = path.join(process.cwd(), ".obora");

        // Check .obora/workflows
        const workflowsDir = path.join(oboraDir, "workflows");
        files.push(...findWorkflowFiles(workflowsDir));

        // Check .obora/features
        const featuresDir = path.join(oboraDir, "features");
        files.push(...findWorkflowFiles(featuresDir));

        if (files.length === 0) {
          console.log(
            `${SYMBOLS.warning} No workflow files found in .obora/workflows or .obora/features`
          );
          process.exit(0);
        }
      } else {
        // Default behavior: validate if no options, show help
        cmd.help();
        return;
      }

      // Validate files
      let totalErrors = 0;
      let totalWarnings = 0;
      let passedCount = 0;
      let failedCount = 0;

      for (const file of files) {
        console.log("");
        console.log(`${SYMBOLS.info} Checking ${chalk.dim(path.relative(process.cwd(), file))}`);

        const result = validateFile(file);

        if (result.isValid && result.warnings.length === 0) {
          console.log(`${SYMBOLS.success} ${chalk.green("Valid")}${chalk.dim(" - no issues")}`);
          passedCount++;
        } else {
          console.log("");
          failedCount++;

          // Print errors
          for (const error of result.errors) {
            console.log(formatError(error, file));
            totalErrors++;
          }

          // Print warnings
          for (const warning of result.warnings) {
            console.log(formatWarning(warning, file));
            totalWarnings++;
          }
        }
      }

      // Print summary
      printSummary(files.length, passedCount, failedCount, totalWarnings);

      // Exit with appropriate code
      if (totalErrors > 0) {
        process.exit(1);
      }

      if (options.strict && totalWarnings > 0) {
        process.exit(2);
      }

      process.exit(0);
    });

  return cmd;
}
