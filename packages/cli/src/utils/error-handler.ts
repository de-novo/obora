import { OboraError } from "@obora/sdk";

import { CLIError } from "./cli-error.js";
import { ExitCode } from "./exit-codes.js";
import { formatter } from "./formatter.js";

function isVerboseEnabled(verbose?: boolean): boolean {
  if (typeof verbose === "boolean") {
    return verbose;
  }

  return process.argv.includes("--verbose");
}

const VALUE_OPTIONS = new Set([
  "--input",
  "-i",
  "--var",
  "-v",
  "--policy",
  "--agents",
  "--config",
  "--model",
  "--provider",
  "--output-dir",
  "--timeout",
  "--debug-file",
]);

function parseValueOptionToken(
  token: string
): { optionName: string; optionValue: string | null } | null {
  if (VALUE_OPTIONS.has(token)) {
    return { optionName: token, optionValue: null };
  }

  for (const optionName of VALUE_OPTIONS) {
    const prefix = `${optionName}=`;
    if (token.startsWith(prefix)) {
      return {
        optionName,
        optionValue: token.slice(prefix.length),
      };
    }
  }

  return null;
}

export function parseCommandContext(commandPath: string[]): {
  activeCommand: string | null;
  inputValue: string | null;
  commandArgument: string | null;
} {
  let activeCommand: string | null = null;
  let inputValue: string | null = null;
  let commandArgument: string | null = null;

  for (let i = 0; i < commandPath.length; i += 1) {
    const token = commandPath[i];
    const parsedValueOption = parseValueOptionToken(token);
    if (parsedValueOption) {
      const optionValue = parsedValueOption.optionValue ?? commandPath[i + 1] ?? null;
      if (parsedValueOption.optionName === "--input" || parsedValueOption.optionName === "-i") {
        inputValue = optionValue;
      }
      if (parsedValueOption.optionValue === null) {
        i += 1;
      }
      continue;
    }

    if (token.startsWith("-")) {
      continue;
    }

    if (!activeCommand) {
      activeCommand = token;
      continue;
    }

    if (!commandArgument) {
      commandArgument = token;
    }
  }

  return { activeCommand, inputValue, commandArgument };
}

function inferStdinHint(context: {
  activeCommand: string | null;
  inputValue: string | null;
  commandArgument: string | null;
}): string | null {
  if (context.inputValue !== "@-") {
    return null;
  }

  if (context.activeCommand === "judge") {
    return `cat artifacts/submission.json | obora judge${context.commandArgument ? ` ${context.commandArgument}` : ""} --input @- --dry-run`;
  }

  if (context.activeCommand === "run") {
    return `printf '{"key":"value"}' | obora run ${context.commandArgument ?? "<workflow.yaml>"} --input @- --dry-run`;
  }

  return null;
}

function inferNextCommand(err: unknown): string | null {
  const message =
    err instanceof Error
      ? err.message.toLowerCase()
      : typeof err === "string"
        ? err.toLowerCase()
        : "";
  const code = err instanceof OboraError ? err.code : null;
  const exitCode = err instanceof CLIError ? err.exitCode : null;
  const commandPath = process.argv.slice(2);
  const commandContext = parseCommandContext(commandPath);
  const isJudgeCommand = commandContext.activeCommand === "judge";

  if (
    commandContext.activeCommand === "dlq" ||
    commandContext.activeCommand === "runs" ||
    commandContext.activeCommand === "artifact" ||
    commandContext.activeCommand === "knowledge" ||
    commandContext.activeCommand === "audit" ||
    commandContext.activeCommand === "models" ||
    commandContext.activeCommand === "policy" ||
    message.includes("dlq entry") ||
    message.includes("dlq store") ||
    message.includes("dlq config") ||
    message.includes("run not found") ||
    message.includes("persisted run") ||
    message.includes("invalid runs ") ||
    message.includes("artifact not found") ||
    message.includes("artifact download failed") ||
    message.includes("failed to resolve artifact") ||
    message.includes("artifact json output requires") ||
    message.includes("knowledge schema") ||
    message.includes("knowledge file") ||
    message.includes("knowledge limit") ||
    message.includes("knowledge min-confidence") ||
    message.includes("invalid audit ") ||
    message.includes("audit timeline") ||
    message.includes("unsupported models provider") ||
    message.includes("unsupported policy file format") ||
    message.includes("invalid policy/workflow yaml")
  ) {
    return null;
  }

  if (message.includes("no stdin json detected")) {
    return inferStdinHint(commandContext);
  }

  if (
    code?.startsWith("ADAPTER_") ||
    message.includes("api key") ||
    message.includes("auth") ||
    message.includes("provider") ||
    message.includes("model") ||
    message.includes("llm") ||
    message.includes("stub mode")
  ) {
    return "obora doctor";
  }

  if (
    code === "ORCH_5001" ||
    message.includes("workflow not found") ||
    message.includes("no such file or directory")
  ) {
    return "obora init --quickstart";
  }

  if (
    code?.startsWith("POLICY_") ||
    exitCode === ExitCode.VALIDATION_ERROR ||
    message.includes("invalid json") ||
    message.includes("yaml") ||
    message.includes("schema") ||
    message.includes("binding") ||
    message.includes("validation")
  ) {
    return isJudgeCommand ? "obora judge --dry-run" : "obora run <workflow.yaml> --dry-run";
  }

  return null;
}

function printNextCommandHint(err: unknown): void {
  const command = inferNextCommand(err);
  if (!command) {
    return;
  }

  formatter.info(`Run: ${command}`);
}

export async function handleCommandAction(
  action: () => Promise<void>,
  options?: { verbose?: boolean }
): Promise<void> {
  try {
    await action();
    process.exitCode = ExitCode.SUCCESS;
  } catch (err: unknown) {
    const verbose = isVerboseEnabled(options?.verbose);

    if (err instanceof CLIError) {
      formatter.error(err.message);
      if (verbose && err.stack) {
        formatter.error(err.stack);
      }
      printNextCommandHint(err);
      process.exitCode = err.exitCode;
    } else if (err instanceof OboraError) {
      const cliErr = CLIError.fromOboraError(err);
      formatter.error(`[${err.code}] ${err.message}`);
      if (verbose && err.stack) {
        formatter.error(err.stack);
      }
      printNextCommandHint(err);
      process.exitCode = cliErr.exitCode;
    } else if (err instanceof Error) {
      formatter.error(err.message);
      if (verbose && err.stack) {
        formatter.error(err.stack);
      }
      printNextCommandHint(err);
      process.exitCode = ExitCode.CLI_ERROR;
    } else {
      formatter.error(`Unexpected error: ${String(err)}`);
      printNextCommandHint(err);
      process.exitCode = ExitCode.CLI_ERROR;
    }
  }
}

export { inferNextCommand };
