import type { ChatSessionState } from "./types.js";
import { runStatusFilterUsage } from "./run-status-filter.js";

interface ChatCommandHelpEntry {
  readonly command: string;
  readonly description: string;
  readonly group: ChatCommandHelpGroup;
}

export interface ChatCommandHelpSection {
  readonly title: string;
  readonly entries: ReadonlyArray<{
    readonly command: string;
    readonly description: string;
  }>;
}

type ChatCommandHelpGroup = "workflow" | "run" | "session" | "details" | "system";

const chatCommandHelpGroupTitles: Readonly<Record<ChatCommandHelpGroup, string>> = {
  workflow: "Workflow",
  run: "Run History",
  session: "Session",
  details: "Details",
  system: "System",
};

const chatCommandHelpGroupOrder: ReadonlyArray<ChatCommandHelpGroup> = [
  "workflow",
  "run",
  "details",
  "session",
  "system",
];

const chatCommandHelpEntries: ReadonlyArray<ChatCommandHelpEntry> = [
  {
    command: "/workflow <name-or-path>",
    description: "selects a reusable workflow",
    group: "workflow",
  },
  {
    command: "/workflows [scope]",
    description: "lists reusable workflows",
    group: "workflow",
  },
  {
    command: "/project [path]",
    description: "shows or changes the session project root",
    group: "session",
  },
  {
    command: "/sessions here or /sessions [tag]",
    description: "lists recent sessions by project or tag",
    group: "session",
  },
  {
    command: "/sessions --project [path]",
    description: "filters sessions by project",
    group: "session",
  },
  {
    command: "/session 1 or /session <id>",
    description: "switches sessions",
    group: "session",
  },
  {
    command: "/session next, /session prev, or /session open",
    description: "moves or opens the selected session choice",
    group: "session",
  },
  {
    command: "/session rename 1 or /session rename <id> <new-id>",
    description: "renames a session",
    group: "session",
  },
  {
    command: "/session delete 1 or /session delete <id>",
    description: "deletes a session",
    group: "session",
  },
  {
    command: "/workflow 1",
    description: "selects from the last workflow list",
    group: "workflow",
  },
  {
    command: "/workflow next, /workflow prev, or /workflow open",
    description: "moves or opens the selected workflow choice",
    group: "workflow",
  },
  {
    command: "/run <task>",
    description: "runs the current workflow",
    group: "workflow",
  },
  {
    command: "/retry",
    description: "reruns the last workflow task",
    group: "workflow",
  },
  {
    command: "/retry status",
    description: "shows what /retry will rerun",
    group: "workflow",
  },
  {
    command: "/retry 1 or /retry <executionId>",
    description: "reruns a retryable run from history",
    group: "run",
  },
  {
    command: "/details next, /details prev, /details open, or /retry open",
    description: "moves, opens, or retries the selected run choice",
    group: "run",
  },
  {
    command: "/run #1 <task>",
    description: "runs one task with a listed workflow",
    group: "workflow",
  },
  {
    command: "/run --workflow <name-or-path> <task>",
    description: "runs one task with another workflow",
    group: "workflow",
  },
  {
    command: "/runs",
    description: "lists workflow runs in this chat",
    group: "run",
  },
  {
    command: "/runs --all",
    description: "lists persisted runs across sessions",
    group: "run",
  },
  {
    command: "/runs --session 1 or /runs --session <id>",
    description: "lists persisted runs for one session",
    group: "run",
  },
  {
    command: `/runs failed, /runs --project [path], /runs --tag <tag>, or /runs --status <${runStatusFilterUsage()}>`,
    description: "filters persisted runs",
    group: "run",
  },
  {
    command: "/details 1 or /details <executionId>",
    description: "shows latest or selected step results",
    group: "details",
  },
  {
    command: "/clear or /details clear",
    description: "closes the current panel",
    group: "details",
  },
  {
    command: "/session",
    description: "shows current session metadata",
    group: "session",
  },
  {
    command: "/tags [a,b]",
    description: "shows or updates session tags",
    group: "session",
  },
  {
    command: "/exit",
    description: "quits",
    group: "system",
  },
];

const commandHelpEntriesForGroup = (
  group: ChatCommandHelpGroup
): ReadonlyArray<ChatCommandHelpEntry> =>
  chatCommandHelpEntries.filter((entry) => entry.group === group);

export const chatCommandHelpSections: ReadonlyArray<ChatCommandHelpSection> =
  chatCommandHelpGroupOrder.map((group) => ({
    title: chatCommandHelpGroupTitles[group],
    entries: commandHelpEntriesForGroup(group).map(({ command, description }) => ({
      command,
      description,
    })),
  }));

export const chatHelp = [
  "Commands:",
  ...chatCommandHelpSections.flatMap((section) => [
    "",
    `${section.title}:`,
    ...section.entries.map(
      (entry) => `  ${entry.command} - ${entry.description}`
    ),
  ]),
].join("\n");

export const isClearRunDetailsCommand = (input: string): boolean =>
  input === "/clear" || input === "/details clear";

export const chatPromptCommandRows = (state: ChatSessionState): ReadonlyArray<string> => {
  if (state.showHelpPanel) return ["/clear  /workflow <name>  /runs", "/session  /project  /exit"];
  if (state.inspectedRunSummary) {
    return state.runChoices && state.runChoices.length > 0
      ? [
          "Enter open  Tab next  Esc close  Ctrl+R retry",
          "/clear  /details 1  /retry 1  /details <runId>",
          "/runs  /session  /project  /help",
        ]
      : ["Esc close  Ctrl+R retry", "/clear  /runs  /details <runId>", "/session  /project  /help"];
  }
  if (state.runChoices && state.runChoices.length > 0) {
    return [
      "Enter open  Tab next  Esc close  Ctrl+R retry",
      "/details open  /details next  /details prev  /retry open",
      "/details 1  /retry 1  /details <runId>",
      "/runs --project  /runs --tag <tag>  /runs failed",
    ];
  }
  if (state.sessionChoices && state.sessionChoices.length > 0) {
    return [
      "Enter open  Tab next  Esc close",
      "/session open  /session next  /session prev",
      "/session 1  /session <id>  /session rename 1 <id>",
      "/session delete 1  /sessions here  /clear",
    ];
  }
  if (state.workflowLocator) {
    return state.lastRunSummary
      ? ["/details  /retry  /run <task>  /runs", "/workflows  /session  /project  /help"]
      : ["/run <task>  /runs  /workflows", "/session  /project  /tags  /help"];
  }
  return state.workflowChoices && state.workflowChoices.length > 0
    ? [
        "Enter open  Tab next  Esc close",
        "/workflow open  /workflow next  /workflow prev",
        "/workflow 1  /workflow <name>  /run #1 <task>",
        "/workflows [scope]  /project  /clear",
      ]
    : ["/workflows  /workflow <name-or-path>  /project [path]", "/sessions  /tags  /help"];
};
