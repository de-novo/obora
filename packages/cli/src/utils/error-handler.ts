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

  const optionName = Array.from(VALUE_OPTIONS).find((candidate) =>
    token.startsWith(`${candidate}=`)
  );
  return optionName
    ? {
        optionName,
        optionValue: token.slice(`${optionName}=`.length),
      }
    : null;
}

export function parseCommandContext(commandPath: string[]): {
  activeCommand: string | null;
  inputValue: string | null;
  commandArgument: string | null;
} {
  const context = commandPath.reduce(
    (state, token, index) => {
      if (state.skipNext) {
        return { ...state, skipNext: false };
      }
    const parsedValueOption = parseValueOptionToken(token);
    if (parsedValueOption) {
        const optionValue = parsedValueOption.optionValue ?? commandPath[index + 1] ?? null;
      if (parsedValueOption.optionName === "--input" || parsedValueOption.optionName === "-i") {
          return {
            ...state,
            inputValue: optionValue,
            skipNext: parsedValueOption.optionValue === null,
          };
      }
        return { ...state, skipNext: parsedValueOption.optionValue === null };
    }

    if (token.startsWith("-")) {
        return state;
    }

      if (!state.activeCommand) {
        return { ...state, activeCommand: token };
    }

      if (!state.commandArgument) {
        return { ...state, commandArgument: token };
      }

      return state;
    },
    {
      activeCommand: null as string | null,
      inputValue: null as string | null,
      commandArgument: null as string | null,
      skipNext: false,
    }
  );

  return {
    activeCommand: context.activeCommand,
    inputValue: context.inputValue,
    commandArgument: context.commandArgument,
  };
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
    commandContext.activeCommand === "agents" ||
    commandContext.activeCommand === "audit" ||
    commandContext.activeCommand === "models" ||
    commandContext.activeCommand === "policy" ||
    commandContext.activeCommand === "plugin" ||
    commandContext.activeCommand === "test" ||
    commandContext.activeCommand === "expand" ||
    commandContext.activeCommand === "doctor" ||
    commandContext.activeCommand === "auth" ||
    commandContext.activeCommand === "status" ||
    commandContext.activeCommand === "validate" ||
    commandContext.activeCommand === "init" ||
    commandContext.activeCommand === "quickstart" ||
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
    message.includes("agent not found in visible sources") ||
    message.includes("failed to load agent context") ||
    message.includes("failed to load agent inventory") ||
    message.includes("failed to build agent snapshot") ||
    message.includes("invalid agents scope") ||
    message.includes("agent override preview requires at least one of provider or model") ||
    message.includes("model-only override requires an existing provider in target config") ||
    message.includes("provider-only override requires an existing model in target config") ||
    message.includes("unsupported agent provider override") ||
    message.includes("unsupported agent model override") ||
    message.includes("failed to write agent override") ||
    message.includes("knowledge limit") ||
    message.includes("knowledge min-confidence") ||
    message.includes("invalid audit ") ||
    message.includes("audit timeline") ||
    message.includes("unsupported models provider") ||
    message.includes("unsupported policy file format") ||
    message.includes("invalid policy/workflow yaml") ||
    message.includes("plugin not found") ||
    message.includes("test target not found") ||
    message.includes("no test target provided") ||
    message.includes("unsupported test target") ||
    message.includes("expand source not found") ||
    message.includes("invalid expand yaml") ||
    message.includes("failed to expand workflow") ||
    message.includes("failed to load doctor config") ||
    message.includes("failed to resolve doctor configuration") ||
    message.includes("invalid auth type") ||
    message.includes("provider auth not found") ||
    message.includes("failed to load provider auth store") ||
    message.includes("failed to save provider auth") ||
    message.includes("failed to remove provider auth") ||
    message.includes("unsupported provider auth test target") ||
    message.includes("failed to test provider auth") ||
    message.includes("auth test failed for provider") ||
    message.includes("--apikey is required when --type=apikey") ||
    message.includes("--token is required when --type=token") ||
    message.includes("--accesstoken is required when --type=oauth") ||
    message.includes("failed to initialize scaffold") ||
    message.includes("invalid status limit") ||
    message.includes("failed to load status runtime") ||
    message.includes("failed to load status runs") ||
    message.includes("failed to load status dlq") ||
    message.includes("invalid execution timeout") ||
    message.includes("invalid validate file path") ||
    message.includes("validate file not found") ||
    message.includes("failed to scan workflow directory") ||
    message.includes("validation failed with errors") ||
    message.includes("validation failed with warnings in strict mode")
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
