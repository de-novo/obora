import { Command } from "commander";

import { runChatSession } from "../chat/session.js";
import { formatChatRunDetail } from "../chat/run-detail-format.js";
import {
  findChatRunDetail,
  groupChatSessionSummaries,
  listChatRunDetails,
  listChatSessionSummaries,
  loadChatSessionState,
} from "../chat/store.js";
import type { ChatSessionGroupBy } from "../chat/store.js";
import type { ChatCommandOptions } from "../chat/types.js";
import { CLIError } from "../utils/cli-error.js";
import { handleCommandAction } from "../utils/error-handler.js";
import { ExitCode } from "../utils/exit-codes.js";
import { formatter } from "../utils/formatter.js";
import { getGlobalOpts } from "../utils/global-opts.js";

const parseSessionGroupBy = (value: string | undefined): ChatSessionGroupBy | undefined =>
  value === "project" || value === "tag" || value === "day" ? value : undefined;

export function createChatCommand(): Command {
  return new Command("chat")
    .description("Start an interactive workflow chat TUI")
    .argument("[workflow]", "Workflow name or YAML path to run for chat messages")
    .option("--workflow <workflow>", "Workflow name or YAML path")
    .option("--scope <scope>", "Workflow scope to resolve (project, global, all)")
    .option("--project <path>", "Project root for scoped workflow discovery")
    .option("--global-workflows-dir <path>", "Global workflow directory override")
    .option("--session <id>", "Chat session id")
    .option("--list-sessions", "List persisted chat sessions")
    .option("--group-sessions <group>", "Group listed sessions by project, tag, or day")
    .option("--filter-tag <tag>", "Only list sessions with the given tag")
    .option("--filter-project <path>", "Only list sessions for a project root, or current")
    .option("--filter-run-status <status>", "Only list persisted workflow runs with the given status")
    .option("--show-session", "Show the persisted chat session selected by --session")
    .option("--list-runs", "List persisted workflow runs, optionally scoped by --session")
    .option("--show-run <executionId>", "Show a persisted workflow run summary by execution id")
    .option("--once <message>", "Run one chat message and exit")
    .option("--dry-run", "Validate the selected workflow without live execution")
    .option("--provider <name>", "LLM provider override for workflow runs")
    .option("--model <name>", "LLM model override for workflow runs")
    .option("--config <path>", "obora config.yaml path")
    .option("--agents <path>", "agents.yaml path")
    .option("--policy <path>", "Policy file path")
    .option("--timeout <ms>", "Execution timeout in milliseconds")
    .option("--tags <tags>", "Comma-separated tags to store on the chat session")
    .option("--json", "Output final chat state as JSON")
    .action(async function (
      this: Command,
      workflow: string | undefined,
      options: ChatCommandOptions & { json?: boolean }
    ) {
      const globalOpts = getGlobalOpts(this);
      await handleCommandAction(
        async () => {
          if (options.listSessions) {
            const sessions = await listChatSessionSummaries({
              cwd: process.cwd(),
              ...(options.filterTag ? { tag: options.filterTag } : {}),
              ...(options.filterProject
                ? {
                    projectRoot:
                      options.filterProject === "current" ? process.cwd() : options.filterProject,
                  }
                : {}),
            });
            const groupBy = parseSessionGroupBy(options.groupSessions);
            const grouped = groupBy
              ? groupChatSessionSummaries(sessions, groupBy, options.filterTag)
              : undefined;
            if (options.groupSessions && !groupBy) {
              throw new CLIError(
                `Invalid session group: ${options.groupSessions}. Expected project, tag, or day.`,
                ExitCode.CLI_ERROR
              );
            }
            if (options.json || globalOpts.json) {
              formatter.json(grouped ?? sessions);
            } else {
              formatter.table(
                (grouped ?? [{ group: "sessions", sessions }]).flatMap((group) =>
                  group.sessions.map((session) => ({
                    group: group.group,
                    ...session,
                    tags: session.tags.join(", "),
                  }))
                )
              );
            }
            return;
          }

          if (options.showSession) {
            if (!options.session) {
              throw new CLIError("--show-session requires --session <id>", ExitCode.CLI_ERROR);
            }
            const state = await loadChatSessionState({
              cwd: process.cwd(),
              sessionId: options.session,
            });
            if (!state) {
              throw new CLIError(`Chat session not found: ${options.session}`, ExitCode.CLI_ERROR);
            }
            formatter.json(state);
            return;
          }

          if (options.listRuns) {
            const runs = await listChatRunDetails({
              cwd: process.cwd(),
              ...(options.session ? { sessionId: options.session } : {}),
              ...(options.filterTag ? { tag: options.filterTag } : {}),
              ...(options.filterProject
                ? {
                    projectRoot:
                      options.filterProject === "current" ? process.cwd() : options.filterProject,
                  }
                : {}),
              ...(options.filterRunStatus ? { status: options.filterRunStatus } : {}),
            });
            if (options.json || globalOpts.json) {
              formatter.json(runs);
            } else {
              formatter.table(
                runs.map((detail) => ({
                  sessionId: detail.sessionId,
                  executionId: detail.runSummary.executionId,
                  workflowName: detail.runSummary.workflowName,
                  status: detail.runSummary.status,
                  task: detail.runTask ?? "-",
                  retry: detail.runTask
                    ? (detail.runWorkflowLocator?.name ?? detail.runSummary.workflowName)
                    : "-",
                  steps: `${detail.runSummary.completedStepCount}/${detail.runSummary.totalStepCount}`,
                  startedAt: detail.runSummary.startedAt,
                }))
              );
            }
            return;
          }

          if (options.showRun) {
            const detail = await findChatRunDetail({
              cwd: process.cwd(),
              executionId: options.showRun,
              ...(options.session ? { sessionId: options.session } : {}),
            });
            if (!detail) {
              throw new CLIError(`Chat run not found: ${options.showRun}`, ExitCode.CLI_ERROR);
            }
            if (options.json || globalOpts.json) {
              formatter.json(detail);
            } else {
              console.log(formatChatRunDetail(detail));
            }
            return;
          }

          const finalState = await runChatSession({
            cwd: process.cwd(),
            input: process.stdin,
            output: process.stdout,
            commandOptions: {
              ...options,
              workflow: options.workflow ?? workflow,
            },
          });

          if (options.json || globalOpts.json) {
            formatter.json(finalState);
          }
        },
        { verbose: Boolean(globalOpts.verbose) }
      );
    });
}
