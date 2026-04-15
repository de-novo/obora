/**
 * obora validate command
 * @module @obora/cli/commands/validate
 */

import * as fs from "node:fs";
import * as path from "node:path";

import { parseAndValidate, type ValidationError, type ValidationResult } from "@obora/runtime";
import { Command } from "commander";

import { CLIError } from "../errors.js";
import { handleCommandAction } from "../utils/error-handler.js";
import { ExitCode } from "../utils/exit-codes.js";
import { formatter } from "../utils/formatter.js";
import { getGlobalOpts, type GlobalOptions } from "../utils/global-opts.js";
import { validatePath } from "../utils/path-utils.js";

interface ValidateOptions {
  all?: boolean;
  file?: string;
  strict?: boolean;
  format?: "default" | "json";
  verbose?: boolean;
  json?: boolean;
}

interface ValidateSummary {
  total: number;
  passed: number;
  failed: number;
  warnings: number;
}

const SYMBOLS = {
  success: "✅",
  error: "❌",
  warning: "⚠️",
  info: "ℹ",
} as const;

function shouldOutputJson(options: ValidateOptions, globalOpts: GlobalOptions): boolean {
  return Boolean(options.json || options.format === "json" || globalOpts.json);
}

function formatIssue(kind: "error" | "warning", issue: ValidationError, filePath: string): string {
  const symbol = kind === "error" ? SYMBOLS.error : SYMBOLS.warning;
  const location = issue.path
    ? `[${path.relative(process.cwd(), filePath)}:${issue.path}]`
    : `[${path.relative(process.cwd(), filePath)}]`;
  const lines = [`${symbol} ${location} ${issue.message}`];

  if (issue.suggestion) {
    lines.push(`  → ${issue.suggestion}`);
  }

  return lines.join("\n");
}

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

function findWorkflowFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true }) as fs.Dirent[];
  } catch (error) {
    throw new CLIError(
      `Failed to scan workflow directory: ${dir}: ${error instanceof Error ? error.message : String(error)}`,
      ExitCode.EXECUTION_FAILED
    );
  }

  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findWorkflowFiles(fullPath));
    } else if (entry.name.endsWith(".yaml") || entry.name.endsWith(".yml")) {
      files.push(fullPath);
    }
  }

  return files.sort();
}

function resolveValidateFiles(options: ValidateOptions): string[] {
  if (options.file) {
    let resolvedPath: string;
    try {
      resolvedPath = validatePath(options.file, process.cwd());
    } catch {
      throw new CLIError(`Invalid validate file path: ${options.file}`, ExitCode.VALIDATION_ERROR);
    }

    if (!fs.existsSync(resolvedPath)) {
      throw new CLIError(`Validate file not found: ${options.file}`, ExitCode.VALIDATION_ERROR);
    }

    return [resolvedPath];
  }

  const oboraDir = path.join(process.cwd(), ".obora");
  return [
    ...findWorkflowFiles(path.join(oboraDir, "workflows")),
    ...findWorkflowFiles(path.join(oboraDir, "features")),
  ];
}

function summarizeResults(results: Map<string, ValidationResult>): ValidateSummary {
  let passed = 0;
  let failed = 0;
  let warnings = 0;

  for (const result of results.values()) {
    if (result.errors.length > 0) {
      failed += 1;
    } else {
      passed += 1;
    }
    warnings += result.warnings.length;
  }

  return {
    total: results.size,
    passed,
    failed,
    warnings,
  };
}

function buildJsonPayload(
  files: string[],
  results: Map<string, ValidationResult>
): Record<string, unknown> {
  const output: Record<
    string,
    {
      valid: boolean;
      errors: ValidationError[];
      warnings: ValidationError[];
    }
  > = {};

  for (const file of files) {
    const result = results.get(file);
    if (!result) continue;
    output[file] = {
      valid: result.isValid,
      errors: result.errors,
      warnings: result.warnings,
    };
  }

  return {
    summary: summarizeResults(results),
    results: output,
  };
}

function printTextResults(
  files: string[],
  results: Map<string, ValidationResult>,
  options: ValidateOptions
): void {
  const summary = summarizeResults(results);

  for (const file of files) {
    const result = results.get(file);
    if (!result) continue;

    console.log("");
    console.log(`${SYMBOLS.info} Checking ${path.relative(process.cwd(), file)}`);

    if (result.errors.length === 0 && result.warnings.length === 0) {
      console.log(`${SYMBOLS.success} Valid - no issues`);
      continue;
    }

    for (const error of result.errors) {
      console.log(formatIssue("error", error, file));
    }

    for (const warning of result.warnings) {
      console.log(formatIssue("warning", warning, file));
    }

    if (options.verbose && result.errors.length === 0 && result.warnings.length > 0) {
      console.log(`${SYMBOLS.info} Detailed validation warnings printed above.`);
    }
  }

  console.log("");
  console.log("Results:");
  console.log(
    `  ${summary.passed} passed, ${summary.failed} failed, ${summary.warnings} warning${summary.warnings === 1 ? "" : "s"} (${summary.total} total)`
  );
}

export async function runValidate(
  options: ValidateOptions,
  globalOpts: GlobalOptions
): Promise<void> {
  const files = resolveValidateFiles(options);
  const jsonOutput = shouldOutputJson(options, globalOpts);

  if (files.length === 0) {
    if (jsonOutput) {
      formatter.json({
        summary: {
          total: 0,
          passed: 0,
          failed: 0,
          warnings: 0,
        },
        results: {},
      });
    } else {
      formatter.info("No workflow files found in .obora/workflows or .obora/features");
    }
    return;
  }

  const results = new Map<string, ValidationResult>();
  for (const file of files) {
    results.set(file, validateFile(file));
  }

  const summary = summarizeResults(results);

  if (jsonOutput) {
    formatter.json(buildJsonPayload(files, results));
  } else {
    printTextResults(files, results, options);
  }

  if (summary.failed > 0) {
    throw new CLIError("Validation failed with errors", ExitCode.VALIDATION_ERROR);
  }

  if (options.strict && summary.warnings > 0) {
    throw new CLIError("Validation failed with warnings in strict mode", ExitCode.VALIDATION_ERROR);
  }
}

export function createValidateCommand(): Command {
  return new Command("validate")
    .description("Validate workflow YAML files")
    .option("--all", "Validate all workflow files in .obora/workflows and .obora/features")
    .option("-f, --file <path>", "Validate a specific workflow file")
    .option("--strict", "Treat warnings as errors")
    .option("-o, --format <type>", "Output format (default, json)", "default")
    .option("--json", "Output structured validation results as JSON")
    .option("-v, --verbose", "Show detailed output")
    .action(async function (this: Command, options: ValidateOptions) {
      const globalOpts = getGlobalOpts(this);
      await handleCommandAction(() => runValidate(options, globalOpts), {
        verbose: Boolean(globalOpts.verbose || options.verbose),
      });
    });
}

export const validateCommand = createValidateCommand;
