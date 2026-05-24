import { describe, expect, it } from "vitest";

import {
  chatCommandHelpSections,
  chatHelp,
  chatPromptCommandRows,
  isClearRunDetailsCommand,
} from "../commands.js";
import { createInitialChatState } from "../state.js";

describe("chat command metadata", () => {
  it("uses shared metadata for help and prompt hints", () => {
    const state = createInitialChatState({
      sessionId: "session-a",
      cwd: "/repo",
      dryRun: true,
    });

    expect(chatHelp).toContain("Workflow:\n");
    expect(chatHelp).toContain("Run History:\n");
    expect(chatHelp).toContain("Details:\n");
    expect(chatHelp).toContain("Session:\n");
    expect(chatHelp).toContain("System:\n");
    expect(chatHelp).toContain("/workflow <name-or-path>");
    expect(chatHelp).toContain("  /clear or /details clear - closes the current panel");
    expect(chatCommandHelpSections.map((section) => section.title)).toEqual([
      "Workflow",
      "Run History",
      "Details",
      "Session",
      "System",
    ]);
    expect(chatPromptCommandRows(state)).toEqual([
      "/workflows  /workflow <name-or-path>  /project [path]",
      "/sessions  /tags  /help",
    ]);
    expect(chatPromptCommandRows({ ...state, showHelpPanel: true })).toEqual([
      "/clear  /workflow <name>  /runs",
      "/session  /project  /exit",
    ]);
  });

  it("keeps run detail clear aliases centralized", () => {
    expect(isClearRunDetailsCommand("/clear")).toBe(true);
    expect(isClearRunDetailsCommand("/details clear")).toBe(true);
    expect(isClearRunDetailsCommand("/details exec-1")).toBe(false);
  });
});
