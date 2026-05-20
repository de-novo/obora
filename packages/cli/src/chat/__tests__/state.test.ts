import { describe, expect, it } from "vitest";

import {
  appendChatMessage,
  createChatMessage,
  createInitialChatState,
  setChatStatus,
  visibleChatMessages,
} from "../state.js";

describe("chat state helpers", () => {
  it("creates an initial state with a system hint", () => {
    const state = createInitialChatState({
      sessionId: "session-a",
      cwd: "/repo",
      dryRun: true,
      workflowTarget: "release-readiness",
    });

    expect(state).toMatchObject({
      sessionId: "session-a",
      cwd: "/repo",
      dryRun: true,
      workflowTarget: "release-readiness",
      status: "idle",
    });
    expect(state.messages[0]).toMatchObject({
      role: "system",
      content: expect.stringContaining("Obora chat TUI started"),
    });
  });

  it("appends messages and returns the visible tail", () => {
    const state = createInitialChatState({
      sessionId: "session-a",
      cwd: "/repo",
      dryRun: false,
    });
    const withMessage = appendChatMessage(
      state,
      createChatMessage("user", "hello", () => new Date("2026-05-20T00:00:00.000Z"))
    );

    expect(withMessage.messages).toHaveLength(2);
    expect(visibleChatMessages(withMessage, 1)).toEqual([
      expect.objectContaining({ role: "user", content: "hello" }),
    ]);
  });

  it("updates status and clears stale errors", () => {
    const state = setChatStatus(
      createInitialChatState({ sessionId: "s", cwd: "/repo", dryRun: false }),
      "failed",
      "boom"
    );

    expect(state.lastError).toBe("boom");
    expect(setChatStatus(state, "ready").lastError).toBeUndefined();
  });
});
