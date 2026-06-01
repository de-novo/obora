import { mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";

import { Command } from "commander";

import { runChatSession } from "../chat/session.js";
import {
  formatChatRunAuditBundle,
  formatChatRunDetail,
  formatChatRunDiffPreview,
} from "../chat/run-detail-format.js";
import {
  formatChatSessionDetail,
  formatChatSessionExport,
} from "../chat/session-detail-format.js";
import {
  formatCompactChatRunOptions,
  formatChatRunOptionsOrDefault,
} from "../chat/run-options-format.js";
import { isRunStatusFilter, runStatusFilterUsage } from "../chat/run-status-filter.js";
import {
  findChatRunDetail,
  groupChatSessionSummaries,
  listChatRunDetails,
  listChatSessionSummaries,
  listChatSessionStates,
  loadChatSessionState,
} from "../chat/store.js";
import type { ChatSessionGroupBy, ChatSessionSummaryGroup } from "../chat/store.js";
import type { ChatRunDetail } from "../chat/store.js";
import type { ChatSessionState } from "../chat/types.js";
import type { ChatCommandOptions } from "../chat/types.js";
import { CLIError } from "../utils/cli-error.js";
import { handleCommandAction } from "../utils/error-handler.js";
import { ExitCode } from "../utils/exit-codes.js";
import { formatter } from "../utils/formatter.js";
import { getGlobalOpts } from "../utils/global-opts.js";

const parseSessionGroupBy = (value: string | undefined): ChatSessionGroupBy | undefined =>
  value === "project" || value === "tag" || value === "day" ? value : undefined;

const resolveFromCommandCwd = (path: string): string => resolve(process.cwd(), path);

const chatStoreCwd = (options: ChatCommandOptions): string =>
  options.project ? resolveFromCommandCwd(options.project) : process.cwd();

const filterProjectRoot = (
  value: string | undefined,
  storeCwd: string
): string | undefined => (value === "current" ? storeCwd : value);

const saveDiffOutputPath = (
  detail: ChatRunDetail,
  baseCwd: string,
  outputPath: string
): string =>
  isAbsolute(outputPath)
    ? outputPath
    : resolve(detail.projectRoot ?? baseCwd, outputPath);

const saveChatRunOutput = async (
  detail: ChatRunDetail,
  baseCwd: string,
  outputPath: string,
  body: string
): Promise<string> => {
  const resolvedPath = saveDiffOutputPath(detail, baseCwd, outputPath);
  await mkdir(dirname(resolvedPath), { recursive: true });
  await writeFile(resolvedPath, body, "utf-8");
  return resolvedPath;
};

const saveChatRunDiffPreview = async (
  detail: ChatRunDetail,
  baseCwd: string,
  outputPath: string
): Promise<string> => {
  const body = formatChatRunDiffPreview(detail);
  if (!body) {
    throw new CLIError(
      `Chat run has no repository changes to save: ${detail.runSummary.executionId}`,
      ExitCode.CLI_ERROR
    );
  }
  return saveChatRunOutput(detail, baseCwd, outputPath, body);
};

const saveChatRunAuditBundle = (
  detail: ChatRunDetail,
  baseCwd: string,
  outputPath: string
): Promise<string> =>
  saveChatRunOutput(detail, baseCwd, outputPath, formatChatRunAuditBundle(detail));

const saveChatSessionExport = (
  state: ChatSessionState,
  baseCwd: string,
  outputPath: string
): Promise<string> => {
  const resolvedPath = isAbsolute(outputPath)
    ? outputPath
    : resolve(state.projectRoot ?? baseCwd, outputPath);
  return mkdir(dirname(resolvedPath), { recursive: true })
    .then(() => writeFile(resolvedPath, formatChatSessionExport(state), "utf-8"))
    .then(() => resolvedPath);
};

interface ChatSessionExportBundle {
  readonly schemaVersion: 1;
  readonly exportedAt: string;
  readonly storeRoot: string;
  readonly filters: {
    readonly tag?: string;
    readonly projectRoot?: string;
  };
  readonly sessions: ReadonlyArray<ChatSessionState>;
}

const saveChatSessionBundle = ({
  states,
  storeCwd,
  outputPath,
  tag,
  projectRoot,
}: {
  readonly states: ReadonlyArray<ChatSessionState>;
  readonly storeCwd: string;
  readonly outputPath: string;
  readonly tag?: string;
  readonly projectRoot?: string;
}): Promise<string> => {
  const resolvedPath = isAbsolute(outputPath) ? outputPath : resolve(storeCwd, outputPath);
  const bundle: ChatSessionExportBundle = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    storeRoot: storeCwd,
    filters: {
      ...(tag ? { tag } : {}),
      ...(projectRoot ? { projectRoot } : {}),
    },
    sessions: states,
  };
  return mkdir(dirname(resolvedPath), { recursive: true })
    .then(() => writeFile(resolvedPath, `${JSON.stringify(bundle, null, 2)}\n`, "utf-8"))
    .then(() => resolvedPath);
};

const sessionRetryColumn = (session: ChatSessionSummaryGroup["sessions"][number]): string =>
  session.lastRunTask && session.lastRunWorkflowName ? session.lastRunWorkflowName : "-";

const formatSessionTableRows = (
  groups: ReadonlyArray<ChatSessionSummaryGroup>
): Array<Record<string, unknown>> =>
  groups.flatMap((group) =>
    group.sessions.map((session) => ({
      group: group.group,
      sessionId: session.sessionId,
      status: session.status,
      project: session.projectRoot ?? session.cwd,
      workflow: session.workflowTarget ?? "-",
      retry: sessionRetryColumn(session),
      lastTask: session.lastRunTask ?? "-",
      tags: session.tags.length > 0 ? session.tags.join(", ") : "-",
      messages: session.messageCount,
      updatedAt: session.updatedAt,
    }))
  );

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
    .option("--save-session <path>", "With --show-session, save a chat session export to a file")
    .option("--export-sessions <path>", "With --list-sessions, save matching sessions to a JSON bundle")
    .option("--list-runs", "List persisted workflow runs, optionally scoped by --session")
    .option("--show-run <executionId>", "Show a persisted workflow run summary by execution id")
    .option("--save-diff <path>", "With --show-run, save repository diff preview to a file")
    .option("--save-audit <path>", "With --show-run, save a chat run audit bundle to a file")
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
          const storeCwd = chatStoreCwd(options);
          if (options.saveDiff && !options.showRun) {
            throw new CLIError("--save-diff requires --show-run <executionId>", ExitCode.CLI_ERROR);
          }
          if (options.saveAudit && !options.showRun) {
            throw new CLIError("--save-audit requires --show-run <executionId>", ExitCode.CLI_ERROR);
          }
          if (options.saveSession && !options.showSession) {
            throw new CLIError(
              "--save-session requires --show-session --session <id>",
              ExitCode.CLI_ERROR
            );
          }
          if (options.exportSessions && !options.listSessions) {
            throw new CLIError("--export-sessions requires --list-sessions", ExitCode.CLI_ERROR);
          }

          if (options.listSessions) {
            const selectedProjectRoot = filterProjectRoot(options.filterProject, storeCwd);
            const sessions = await listChatSessionSummaries({
              cwd: storeCwd,
              ...(options.filterTag ? { tag: options.filterTag } : {}),
              ...(options.filterProject ? { projectRoot: selectedProjectRoot } : {}),
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
            const exportSessionsPath = options.exportSessions;
            const exportedSessionsPath = exportSessionsPath
              ? await listChatSessionStates({
                  cwd: storeCwd,
                  ...(options.filterTag ? { tag: options.filterTag } : {}),
                  ...(options.filterProject ? { projectRoot: selectedProjectRoot } : {}),
                }).then((states) =>
                  saveChatSessionBundle({
                    states,
                    storeCwd,
                    outputPath: exportSessionsPath,
                    ...(options.filterTag ? { tag: options.filterTag } : {}),
                    ...(options.filterProject ? { projectRoot: selectedProjectRoot } : {}),
                  })
                )
              : undefined;
            if (options.json || globalOpts.json) {
              formatter.json(
                exportedSessionsPath
                  ? { sessions: grouped ?? sessions, exportedSessionsPath }
                  : grouped ?? sessions
              );
            } else {
              if (exportedSessionsPath) {
                console.log(`Exported chat sessions: ${exportedSessionsPath}`);
              }
              formatter.table(formatSessionTableRows(grouped ?? [{ group: "sessions", sessions }]));
            }
            return;
          }

          if (options.showSession) {
            if (!options.session) {
              throw new CLIError("--show-session requires --session <id>", ExitCode.CLI_ERROR);
            }
            const state = await loadChatSessionState({
              cwd: storeCwd,
              sessionId: options.session,
            });
            if (!state) {
              throw new CLIError(`Chat session not found: ${options.session}`, ExitCode.CLI_ERROR);
            }
            const savedSessionPath = options.saveSession
              ? await saveChatSessionExport(state, storeCwd, options.saveSession)
              : undefined;
            if (options.json || globalOpts.json) {
              formatter.json(savedSessionPath ? { ...state, savedSessionPath } : state);
            } else {
              if (savedSessionPath) {
                console.log(`Saved chat session export: ${savedSessionPath}`);
              }
              console.log(formatChatSessionDetail(state));
            }
            return;
          }

          if (options.listRuns) {
            if (options.filterRunStatus && !isRunStatusFilter(options.filterRunStatus)) {
              throw new CLIError(
                `Invalid run status filter: ${options.filterRunStatus}. Expected one of ${runStatusFilterUsage()}.`,
                ExitCode.CLI_ERROR
              );
            }
            const runs = await listChatRunDetails({
              cwd: storeCwd,
              ...(options.session ? { sessionId: options.session } : {}),
              ...(options.filterTag ? { tag: options.filterTag } : {}),
              ...(options.filterProject
                ? { projectRoot: filterProjectRoot(options.filterProject, storeCwd) }
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
                  project: detail.projectRoot ?? "-",
                  workflowName: detail.runSummary.workflowName,
                  status: detail.runSummary.status,
                  task: detail.runTask ?? "-",
                  retry: detail.runTask
                    ? (detail.runWorkflowLocator?.name ?? detail.runSummary.workflowName)
                    : "-",
                  options: formatCompactChatRunOptions(detail.runOptions) ?? "default",
                  steps: `${detail.runSummary.completedStepCount}/${detail.runSummary.totalStepCount}`,
                  startedAt: detail.runSummary.startedAt,
                }))
              );
            }
            return;
          }

          if (options.showRun) {
            const detail = await findChatRunDetail({
              cwd: storeCwd,
              executionId: options.showRun,
              ...(options.session ? { sessionId: options.session } : {}),
            });
            if (!detail) {
              throw new CLIError(`Chat run not found: ${options.showRun}`, ExitCode.CLI_ERROR);
            }
            const savedDiffPath = options.saveDiff
              ? await saveChatRunDiffPreview(detail, storeCwd, options.saveDiff)
              : undefined;
            const savedAuditPath = options.saveAudit
              ? await saveChatRunAuditBundle(detail, storeCwd, options.saveAudit)
              : undefined;
            if (options.json || globalOpts.json) {
              formatter.json(
                savedDiffPath || savedAuditPath
                  ? {
                      ...detail,
                      ...(savedDiffPath ? { savedDiffPath } : {}),
                      ...(savedAuditPath ? { savedAuditPath } : {}),
                    }
                  : detail
              );
            } else {
              if (savedDiffPath) {
                console.log(`Saved repository diff preview: ${savedDiffPath}`);
              }
              if (savedAuditPath) {
                console.log(`Saved chat run audit bundle: ${savedAuditPath}`);
              }
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
