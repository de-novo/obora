/**
 * obora validate command
 * @module @obora/cli/commands/validate
 */

import * as fs from "node:fs";
import * as path from "node:path";

import { OboraError, Workflow } from "@obora/sdk";
import { parseAndValidate, type ValidationError, type ValidationResult } from "@obora/runtime";
import { Command } from "commander";
import { parse as parseYaml } from "yaml";

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

interface ValidateTargetSelection {
  target?: string;
  options: ValidateOptions;
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

function buildOneFileValidationSuggestion(filePath: string): string {
  const relativePath = path.relative(process.cwd(), filePath) || filePath;
  return `Review one-file workflow fields, allowed keys, and required sections. Then run \`obora expand ${relativePath} --json\` to inspect the expanded workflow.`;
}

function validateFileContent(content: string, filePath: string): ValidationResult {
  let parsed: unknown;
  try {
    parsed = parseYaml(content);
  } catch {
    return parseAndValidate(content);
  }

  if (!Workflow.getStopSemantics(parsed)) {
    return parseAndValidate(content);
  }

  try {
    Workflow.create(parsed);
    return {
      isValid: true,
      errors: [],
      warnings: [],
    };
  } catch (error) {
    if (error instanceof OboraError) {
      return {
        isValid: false,
        errors: [
          {
            code: error.code,
            message: error.message,
            path: "",
            suggestion: buildOneFileValidationSuggestion(filePath),
          },
        ],
        warnings: [],
      };
    }

    throw error;
  }
}

function validateFile(filePath: string): ValidationResult {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return validateFileContent(content, filePath);
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

function resolveValidateFiles(selection: ValidateTargetSelection): string[] {
  const requestedTarget = selection.options.file ?? selection.target;

  if (selection.options.file && selection.target) {
    throw new CLIError(
      "Specify either a positional validate target or --file, not both.",
      ExitCode.VALIDATION_ERROR
    );
  }

  if (selection.options.all && requestedTarget) {
    throw new CLIError(
      "Cannot combine --all with a specific validate target.",
      ExitCode.VALIDATION_ERROR
    );
  }

  if (requestedTarget) {
    let resolvedPath: string;
    try {
      resolvedPath = validatePath(requestedTarget, process.cwd());
    } catch {
      throw new CLIError(
        `Invalid validate file path: ${requestedTarget}`,
        ExitCode.VALIDATION_ERROR
      );
    }

    if (!fs.existsSync(resolvedPath)) {
      throw new CLIError(`Validate file not found: ${requestedTarget}`, ExitCode.VALIDATION_ERROR);
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
  selection: ValidateTargetSelection,
  globalOpts: GlobalOptions
): Promise<void> {
  const files = resolveValidateFiles(selection);
  const jsonOutput = shouldOutputJson(selection.options, globalOpts);

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
    printTextResults(files, results, selection.options);
  }

  if (summary.failed > 0) {
    throw new CLIError("Validation failed with errors", ExitCode.VALIDATION_ERROR);
  }

  if (selection.options.strict && summary.warnings > 0) {
    throw new CLIError("Validation failed with warnings in strict mode", ExitCode.VALIDATION_ERROR);
  }
}

export function createValidateCommand(): Command {
  return new Command("validate")
    .description("Validate workflow YAML files")
    .argument("[target]", "Workflow file path to validate")
    .option("--all", "Validate all workflow files in .obora/workflows and .obora/features")
    .option("-f, --file <path>", "Validate a specific workflow file")
    .option("--strict", "Treat warnings as errors")
    .option("-o, --format <type>", "Output format (default, json)", "default")
    .option("--json", "Output structured validation results as JSON")
    .option("-v, --verbose", "Show detailed output")
    .action(async function (this: Command, target: string | undefined, options: ValidateOptions) {
      const globalOpts = getGlobalOpts(this);
      await handleCommandAction(() => runValidate({ target, options }, globalOpts), {
        verbose: Boolean(globalOpts.verbose || options.verbose),
      });
    });
}

export const validateCommand = createValidateCommand;
