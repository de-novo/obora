import { describe, expect, it } from "vitest";

import { chatHelp, chatPromptCommandRows, isClearRunDetailsCommand } from "../commands.js";
import { createInitialChatState } from "../state.js";

describe("chat command metadata", () => {
  it("uses shared metadata for help and prompt hints", () => {
    const state = createInitialChatState({
      sessionId: "session-a",
      cwd: "/repo",
      dryRun: true,
    });

    expect(chatHelp).toContain("/workflow <name-or-path>");
    expect(chatHelp).toContain("/clear or /details clear");
    expect(chatPromptCommandRows(state)).toEqual([
      "/workflows  /workflow <name-or-path>  /project [path]",
      "/sessions  /tags  /help",
    ]);
  });

  it("keeps run detail clear aliases centralized", () => {
    expect(isClearRunDetailsCommand("/clear")).toBe(true);
    expect(isClearRunDetailsCommand("/details clear")).toBe(true);
    expect(isClearRunDetailsCommand("/details exec-1")).toBe(false);
  });
});
