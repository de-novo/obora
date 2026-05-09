/**
 * obora validate command
 */

import * as fs from "node:fs";
import * as path from "node:path";

import { parseAndValidate, type ValidationError, type ValidationResult } from "@obora/runtime";
import { OboraError, Workflow } from "@obora/sdk";
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

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function buildOneFileValidationSuggestion(filePath: string): string {
  const relativePath = path.relative(process.cwd(), filePath) || filePath;
  const quotedPath = shellQuote(relativePath);
  return `Fix the reported one-file workflow errors, then run \`obora expand --json -- ${quotedPath}\` to inspect the expanded workflow.`;
}

function validateFileContent(content: string, filePath: string): ValidationResult {
  const parsed = (() => {
    try {
      return { ok: true as const, value: parseYaml(content) as unknown };
    } catch {
      return { ok: false as const };
    }
  })();

  if (!parsed.ok) {
    return parseAndValidate(content);
  }

  if (!Workflow.getStopSemantics(parsed.value)) {
    return parseAndValidate(content);
  }

  try {
    Workflow.create(parsed.value);
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

  const entries = (() => {
    try {
      return fs.readdirSync(dir, { withFileTypes: true }) as fs.Dirent[];
    } catch (error) {
      throw new CLIError(
        `Failed to scan workflow directory: ${dir}: ${error instanceof Error ? error.message : String(error)}`,
        ExitCode.EXECUTION_FAILED
      );
    }
  })();

  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return findWorkflowFiles(fullPath);
    }
    return entry.name.endsWith(".yaml") || entry.name.endsWith(".yml") ? [fullPath] : [];
  }).sort();
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
    const resolvedPath = (() => {
      try {
        return validatePath(requestedTarget, process.cwd());
      } catch {
        throw new CLIError(
          `Invalid validate file path: ${requestedTarget}`,
          ExitCode.VALIDATION_ERROR
        );
      }
    })();

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
  return Array.from(results.values()).reduce<ValidateSummary>(
    (summary, result) => ({
      total: summary.total,
      passed: summary.passed + (result.errors.length > 0 ? 0 : 1),
      failed: summary.failed + (result.errors.length > 0 ? 1 : 0),
      warnings: summary.warnings + result.warnings.length,
    }),
    { total: results.size, passed: 0, failed: 0, warnings: 0 }
  );
}

function buildJsonPayload(
  files: string[],
  results: Map<string, ValidationResult>
): Record<string, unknown> {
  const output = Object.fromEntries(
    files.flatMap((file) => {
      const result = results.get(file);
      return result
        ? [
            [
              file,
              {
                valid: result.isValid,
                errors: result.errors,
                warnings: result.warnings,
              },
            ] as const,
          ]
        : [];
    })
  ) as Record<
    string,
    {
      valid: boolean;
      errors: ValidationError[];
      warnings: ValidationError[];
    }
  >;

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

  files.forEach((file) => {
    const result = results.get(file);
    if (!result) return;

    console.log("");
    console.log(`${SYMBOLS.info} Checking ${path.relative(process.cwd(), file)}`);

    if (result.errors.length === 0 && result.warnings.length === 0) {
      console.log(`${SYMBOLS.success} Valid - no issues`);
      return;
    }

    result.errors.forEach((error) => {
      console.log(formatIssue("error", error, file));
    });

    result.warnings.forEach((warning) => {
      console.log(formatIssue("warning", warning, file));
    });

    if (options.verbose && result.errors.length === 0 && result.warnings.length > 0) {
      console.log(`${SYMBOLS.info} Detailed validation warnings printed above.`);
    }
  });

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

  const results = new Map<string, ValidationResult>(
    files.map((file) => [file, validateFile(file)] as const)
  );

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
