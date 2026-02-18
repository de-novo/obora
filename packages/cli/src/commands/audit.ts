import { Command } from "commander";

import { OboraRuntime, loadConfig } from "@obora/sdk";

import { handleCommandAction } from "../utils/error-handler.js";
import { formatter } from "../utils/formatter.js";
import { getGlobalOpts } from "../utils/global-opts.js";

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

export function createAuditCommand(): Command {
  const cmd = new Command("audit").description("Query and manage audit trail");

  cmd
    .command("query")
    .description("Query audit events")
    .option("--execution <id>", "Filter by execution ID")
    .option("--type <type>", "Filter by event type")
    .option("--limit <n>", "Max results", parseInt)
    .action(async function (this: Command, options) {
      const globalOpts = getGlobalOpts(this);
      await handleCommandAction(async () => {
        const message = "audit query is not yet connected to an audit store.";
        if (globalOpts.json) {
          formatter.json({ command: "audit query", options, connected: false, message });
        } else if (!globalOpts.quiet) {
          formatter.warn(message);
        }
      }, { verbose: Boolean(globalOpts.verbose) });
    });

  cmd
    .command("tail")
    .description("Stream audit events in real-time")
    .option("--execution <id>", "Filter by execution ID")
    .action(async function (this: Command, options) {
      const globalOpts = getGlobalOpts(this);
      await handleCommandAction(async () => {
        const message = "audit tail is not yet connected to an audit store.";
        if (globalOpts.json) {
          formatter.json({ command: "audit tail", options, connected: false, message });
        } else if (!globalOpts.quiet) {
          formatter.warn(message);
        }
      }, { verbose: Boolean(globalOpts.verbose) });
    });

  cmd
    .command("replay <runId>")
    .description("Show structured audit replay timeline")
    .option("--step <stepName>", "Filter by step name")
    .action(async function (this: Command, runId: string, options: { step?: string }) {
      const globalOpts = getGlobalOpts(this);
      await handleCommandAction(async () => {
        const config = await loadConfig();
        const persistence = (config as Record<string, unknown>).persistence as
          | { enabled?: boolean; adapter?: string; sqlite?: { path?: string }; custom?: unknown }
          | undefined;

        const requestedAdapter = (persistence?.adapter as "sqlite" | "custom" | undefined) ?? "sqlite";
        const customConfig = persistence?.custom as { instance?: import("@obora/runtime").StorageAdapter } | undefined;
        const canUseCustom = requestedAdapter === "custom" && !!customConfig?.instance;

        if (requestedAdapter === "custom" && !canUseCustom && !globalOpts.quiet) {
          formatter.warn("Custom storage adapter is not injectable via CLI config; falling back to sqlite adapter.");
        }

        const runtime = new OboraRuntime({
          persistence: {
            enabled: persistence?.enabled ?? true,
            adapter: canUseCustom ? "custom" : "sqlite",
            sqlite: { path: persistence?.sqlite?.path ?? "./data/obora.db" },
            ...(canUseCustom ? { custom: { instance: customConfig!.instance! } } : {}),
          },
        });

        const timeline = await runtime.getRunAuditTimeline(runId, options.step);

        if (globalOpts.json) {
          formatter.json({ runId, stepName: options.step, count: timeline.length, timeline });
          return;
        }

        if (timeline.length === 0) {
          formatter.warn(`No audit events found for run '${runId}'${options.step ? ` (step: ${options.step})` : ""}.`);
          return;
        }

        if (!globalOpts.quiet) {
          formatter.info(`Audit replay for run ${runId}${options.step ? ` (step: ${options.step})` : ""}`);
          for (const event of timeline) {
            const category = `[${event.category}]`;
            const voteSuffix = event.vote
              ? ` vote=${event.vote.decision}${typeof event.vote.confidence === "number" ? `(${event.vote.confidence})` : ""}`
              : "";
            const line = `${event.timestamp} ${category} ${event.stepName} ${event.actor} ${event.action}${voteSuffix}`;
            const color = globalOpts.noColor ? "" : colorForCategory(event.category);
            const reset = globalOpts.noColor ? "" : COLORS.reset;
            console.log(`${color}${line}${reset}`);
          }
        }
      }, { verbose: Boolean(globalOpts.verbose) });
    });

  return cmd;
}
