import { OboraRuntime, loadConfig } from "@obora/sdk";
import { Command } from "commander";

import { CLIError } from "../utils/cli-error.js";
import { handleCommandAction } from "../utils/error-handler.js";
import { ExitCode } from "../utils/exit-codes.js";
import { formatter } from "../utils/formatter.js";
import { getGlobalOpts, type GlobalOptions } from "../utils/global-opts.js";

const COLORS = {
  reset: "\x1b[0m",
  blue: "\x1b[34m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  gray: "\x1b[90m",
} as const;

const colorForCategory = (category: string): string => {
  if (category === "consensus") return COLORS.blue;
  if (category === "policy") return COLORS.yellow;
  if (category === "recovery") return COLORS.red;
  return COLORS.gray;
};

function shouldOutputJson(localJson: boolean | undefined, globalOpts: GlobalOptions): boolean {
  return Boolean(localJson || globalOpts.json);
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parseLimitOption(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new CLIError(`Invalid audit limit: ${value}`, ExitCode.VALIDATION_ERROR);
  }
  return parsed;
}

async function createAuditRuntime(globalOpts: GlobalOptions) {
  const config = await loadConfig();
  const persistence = (config as Record<string, unknown>).persistence as
    | { enabled?: boolean; adapter?: string; sqlite?: { path?: string }; custom?: unknown }
    | undefined;

  const requestedAdapter = (persistence?.adapter as "sqlite" | "custom" | undefined) ?? "sqlite";
  const customConfig = persistence?.custom as
    | { instance?: import("@obora/runtime").StorageAdapter }
    | undefined;
  const canUseCustom = requestedAdapter === "custom" && !!customConfig?.instance;

  if (requestedAdapter === "custom" && !canUseCustom && !globalOpts.quiet) {
    formatter.warn(
      "Custom storage adapter is not injectable via CLI config; falling back to sqlite adapter."
    );
  }

  return new OboraRuntime({
    persistence: {
      enabled: persistence?.enabled ?? true,
      adapter: canUseCustom ? "custom" : "sqlite",
      sqlite: { path: persistence?.sqlite?.path ?? "./data/obora.db" },
      ...(canUseCustom ? { custom: { instance: customConfig!.instance! } } : {}),
    },
  });
}

async function runAuditQuery(
  options: { execution?: string; type?: string; limit?: string; json?: boolean },
  globalOpts: GlobalOptions
): Promise<void> {
  const limit = parseLimitOption(options.limit, 20);
  const message = "audit query is not yet connected to an audit store.";
  const payload = {
    command: "audit query",
    options: { ...options, limit },
    connected: false,
    message,
  };

  if (shouldOutputJson(options.json, globalOpts)) {
    formatter.json(payload);
  } else if (!globalOpts.quiet) {
    formatter.warn(message);
  }
}

async function runAuditTail(
  options: { execution?: string; json?: boolean },
  globalOpts: GlobalOptions
): Promise<void> {
  const message = "audit tail is not yet connected to an audit store.";
  const payload = {
    command: "audit tail",
    options,
    connected: false,
    message,
  };

  if (shouldOutputJson(options.json, globalOpts)) {
    formatter.json(payload);
  } else if (!globalOpts.quiet) {
    formatter.warn(message);
  }
}

async function runAuditReplay(
  runId: string,
  options: { step?: string; json?: boolean },
  globalOpts: GlobalOptions
): Promise<void> {
  const runtime = await (async () => {
    try {
      return await createAuditRuntime(globalOpts);
    } catch (error) {
      if (error instanceof CLIError) throw error;
      throw new CLIError(
        `Failed to initialize audit runtime: ${getErrorMessage(error)}`,
        ExitCode.EXECUTION_FAILED
      );
    }
  })();

  const timeline = await (async () => {
    try {
      return await runtime.getRunAuditTimeline(runId, options.step);
    } catch (error) {
      throw new CLIError(
        `Failed to replay audit timeline: ${getErrorMessage(error)}`,
        ExitCode.EXECUTION_FAILED
      );
    }
  })();

  if (shouldOutputJson(options.json, globalOpts)) {
    formatter.json({ runId, stepName: options.step, count: timeline.length, timeline });
    return;
  }

  if (timeline.length === 0) {
    formatter.warn(
      `No audit events found for run '${runId}'${options.step ? ` (step: ${options.step})` : ""}.`
    );
    return;
  }

  if (!globalOpts.quiet) {
    formatter.info(
      `Audit replay for run ${runId}${options.step ? ` (step: ${options.step})` : ""}`
    );
    timeline.forEach((event) => {
      const category = `[${event.category}]`;
      const voteSuffix = event.vote
        ? ` vote=${event.vote.decision}${typeof event.vote.confidence === "number" ? `(${event.vote.confidence})` : ""}`
        : "";
      const line = `${event.timestamp} ${category} ${event.stepName} ${event.actor} ${event.action}${voteSuffix}`;
      const color = globalOpts.noColor ? "" : colorForCategory(event.category);
      const reset = globalOpts.noColor ? "" : COLORS.reset;
      console.log(`${color}${line}${reset}`);
    });
  }
}

export function createAuditCommand(): Command {
  const cmd = new Command("audit").description("Query and manage audit trail");

  cmd
    .command("query")
    .description("Query audit events")
    .option("--execution <id>", "Filter by execution ID")
    .option("--type <type>", "Filter by event type")
    .option("--limit <n>", "Max results", "20")
    .option("--json", "Output as JSON")
    .action(async function (
      this: Command,
      options: { execution?: string; type?: string; limit?: string; json?: boolean }
    ) {
      const globalOpts = getGlobalOpts(this);
      await handleCommandAction(() => runAuditQuery(options, globalOpts), {
        verbose: Boolean(globalOpts.verbose),
      });
    });

  cmd
    .command("tail")
    .description("Stream audit events in real-time")
    .option("--execution <id>", "Filter by execution ID")
    .option("--json", "Output as JSON")
    .action(async function (this: Command, options: { execution?: string; json?: boolean }) {
      const globalOpts = getGlobalOpts(this);
      await handleCommandAction(() => runAuditTail(options, globalOpts), {
        verbose: Boolean(globalOpts.verbose),
      });
    });

  cmd
    .command("replay <runId>")
    .description("Show structured audit replay timeline")
    .option("--step <stepName>", "Filter by step name")
    .option("--json", "Output as JSON")
    .action(async function (
      this: Command,
      runId: string,
      options: { step?: string; json?: boolean }
    ) {
      const globalOpts = getGlobalOpts(this);
      await handleCommandAction(() => runAuditReplay(runId, options, globalOpts), {
        verbose: Boolean(globalOpts.verbose),
      });
    });

  return cmd;
}
