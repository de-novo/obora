import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { createInitialChatState } from "../state.js";
import { listChatSessionSummaries, loadChatSessionState, saveChatSessionState } from "../store.js";

describe("chat session store", () => {
  it("persists, restores, and lists chat sessions by updated time", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "obora-chat-store-"));
    const first = {
      ...createInitialChatState({
        sessionId: "session-one",
        cwd,
        dryRun: false,
        workflowTarget: "release-readiness",
      }),
      status: "ready" as const,
    };
    const second = {
      ...createInitialChatState({
        sessionId: "session-two",
        cwd,
        dryRun: true,
      }),
      status: "completed" as const,
    };

    await saveChatSessionState({ cwd, state: first });
    await saveChatSessionState({ cwd, state: second });

    const restored = await loadChatSessionState({ cwd, sessionId: "session-one" });
    const summaries = await listChatSessionSummaries({ cwd });

    expect(restored).toMatchObject({
      sessionId: "session-one",
      workflowTarget: "release-readiness",
      status: "ready",
    });
    expect(summaries.map((summary) => summary.sessionId).sort()).toEqual([
      "session-one",
      "session-two",
    ]);
    expect(summaries.find((summary) => summary.sessionId === "session-one")).toMatchObject({
      messageCount: 1,
      workflowTarget: "release-readiness",
    });
  });

  it("returns empty results for a missing session store", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "obora-chat-store-missing-"));

    await expect(loadChatSessionState({ cwd, sessionId: "missing" })).resolves.toBeUndefined();
    await expect(listChatSessionSummaries({ cwd })).resolves.toEqual([]);
  });

  it("ignores malformed session records while listing and hides them on load", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "obora-chat-store-malformed-"));
    const storeDir = join(cwd, ".obora", "chat", "sessions");
    await mkdir(storeDir, { recursive: true });
    await writeFile(join(storeDir, "broken.json"), '{"schemaVersion":1,"updatedAt":"now"}', "utf-8");

    await expect(loadChatSessionState({ cwd, sessionId: "broken" })).resolves.toBeUndefined();
    await expect(listChatSessionSummaries({ cwd })).resolves.toEqual([]);
  });
});
