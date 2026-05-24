import type { ChatSessionState } from "./types.js";

interface ChatCommandHelpEntry {
  readonly command: string;
  readonly description: string;
}

const chatCommandHelpEntries: ReadonlyArray<ChatCommandHelpEntry> = [
  {
    command: "/workflow <name-or-path>",
    description: "selects a reusable workflow",
  },
  {
    command: "/workflows [scope]",
    description: "lists reusable workflows",
  },
  {
    command: "/project [path]",
    description: "shows or changes the session project root",
  },
  {
    command: "/sessions [tag]",
    description: "lists recent sessions",
  },
  {
    command: "/sessions --project [path]",
    description: "filters sessions by project",
  },
  {
    command: "/session 1 or /session <id>",
    description: "switches sessions",
  },
  {
    command: "/session rename <id-or-number> <new-id>",
    description: "renames a session",
  },
  {
    command: "/session delete <id-or-number>",
    description: "deletes a session",
  },
  {
    command: "/workflow 1",
    description: "selects from the last workflow list",
  },
  {
    command: "/run <task>",
    description: "runs the current workflow",
  },
  {
    command: "/run #1 <task>",
    description: "runs one task with a listed workflow",
  },
  {
    command: "/run --workflow <name-or-path> <task>",
    description: "runs one task with another workflow",
  },
  {
    command: "/runs",
    description: "lists workflow runs in this chat",
  },
  {
    command: "/runs --all",
    description: "lists persisted runs across sessions",
  },
  {
    command: "/runs --session <id-or-number>",
    description: "lists persisted runs for one session",
  },
  {
    command: "/runs --project [path], /runs --tag <tag>, or /runs --status <status>",
    description: "filters persisted runs",
  },
  {
    command: "/details <executionId-or-number>",
    description: "shows step results",
  },
  {
    command: "/clear or /details clear",
    description: "closes the current run detail view",
  },
  {
    command: "/session",
    description: "shows current session metadata",
  },
  {
    command: "/tags [a,b]",
    description: "shows or updates session tags",
  },
  {
    command: "/exit",
    description: "quits",
  },
];

export const chatHelp = `Commands: ${chatCommandHelpEntries
  .map((entry) => `${entry.command} ${entry.description}`)
  .join(", ")}.`;

export const isClearRunDetailsCommand = (input: string): boolean =>
  input === "/clear" || input === "/details clear";

export const chatPromptCommandRows = (state: ChatSessionState): ReadonlyArray<string> => {
  if (state.inspectedRunSummary) return ["/clear  /runs  /details <runId>", "/session  /project  /help"];
  if (state.runChoices && state.runChoices.length > 0) {
    return [
      "1  /details <runId>  /runs",
      "/runs --project  /runs --tag <tag>  /runs --status failed",
    ];
  }
  if (state.workflowLocator) {
    return ["/run <task>  /runs  /workflows", "/session  /project  /tags  /help"];
  }
  return state.workflowChoices && state.workflowChoices.length > 0
    ? ["/workflow 1  /run #1 <task>  /workflows [scope]", "/project  /sessions  /help"]
    : ["/workflows  /workflow <name-or-path>  /project [path]", "/sessions  /tags  /help"];
};
