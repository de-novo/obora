import type { ChatSessionState } from "./types.js";

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
    command: "/sessions [tag]",
    description: "lists recent sessions",
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
    command: "/session rename <id-or-number> <new-id>",
    description: "renames a session",
    group: "session",
  },
  {
    command: "/session delete <id-or-number>",
    description: "deletes a session",
    group: "session",
  },
  {
    command: "/workflow 1",
    description: "selects from the last workflow list",
    group: "workflow",
  },
  {
    command: "/run <task>",
    description: "runs the current workflow",
    group: "workflow",
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
    command: "/runs --session <id-or-number>",
    description: "lists persisted runs for one session",
    group: "run",
  },
  {
    command: "/runs --project [path], /runs --tag <tag>, or /runs --status <status>",
    description: "filters persisted runs",
    group: "run",
  },
  {
    command: "/details <executionId-or-number>",
    description: "shows step results",
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
  if (state.inspectedRunSummary) return ["/clear  /runs  /details <runId>", "/session  /project  /help"];
  if (state.runChoices && state.runChoices.length > 0) {
    return [
      "1  /details <runId>  /runs",
      "/runs --project  /runs --tag <tag>  /runs --status failed",
    ];
  }
  if (state.sessionChoices && state.sessionChoices.length > 0) {
    return ["1  /session <id>  /session rename 1 <id>", "/session delete 1  /sessions  /clear"];
  }
  if (state.workflowLocator) {
    return ["/run <task>  /runs  /workflows", "/session  /project  /tags  /help"];
  }
  return state.workflowChoices && state.workflowChoices.length > 0
    ? ["1  /workflow <name>  /run #1 <task>", "/workflows [scope]  /project  /clear"]
    : ["/workflows  /workflow <name-or-path>  /project [path]", "/sessions  /tags  /help"];
};
