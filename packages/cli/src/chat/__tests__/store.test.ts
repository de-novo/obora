import type { WorkflowRunSummary } from "@obora/sdk";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { createInitialChatState } from "../state.js";
import {
  deleteChatSessionState,
  findChatRunDetail,
  groupChatSessionSummaries,
  listChatRunDetails,
  listChatSessionSummaries,
  loadChatSessionState,
  renameChatSessionState,
  saveChatSessionState,
} from "../store.js";

const runSummary: WorkflowRunSummary = {
  executionId: "exec-123",
  workflowName: "release-readiness",
  status: "completed",
  startedAt: "2026-05-24T00:00:00.000Z",
  endedAt: "2026-05-24T00:00:01.000Z",
  durationMs: 1000,
  completedStepCount: 1,
  totalStepCount: 1,
  message: "Workflow completed: 1/1 steps completed.",
  steps: [
    {
      name: "collect",
      status: "completed",
      agent: "developer",
      model: "openrouter/owl-alpha",
      outputPreview: "Collected context.",
      outputFormat: "text",
      toolsUsed: ["file_read"],
      artifacts: ["README.md"],
      task: "Collect context",
      methodology: "Standard agent execution",
      decisions: [],
      issues: [],
      dependencies: [],
    },
  ],
};

describe("chat session store", () => {
  it("persists, restores, and lists chat sessions by updated time", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "obora-chat-store-"));
    const first = {
      ...createInitialChatState({
        sessionId: "session-one",
        cwd,
        projectRoot: join(cwd, "project-a"),
        tags: ["release", "urgent"],
        dryRun: false,
        workflowTarget: "release-readiness",
      }),
      status: "ready" as const,
      lastRunTask: "perform the release check",
      lastRunWorkflowLocator: {
        id: "project:release-readiness",
        scope: "project" as const,
        name: "release-readiness",
        path: join(cwd, ".obora", "workflows", "release-readiness.yaml"),
        displayPath: ".obora/workflows/release-readiness.yaml",
        editable: true,
        sourceDir: join(cwd, ".obora", "workflows"),
        stepCount: 1,
        projectRoot: join(cwd, "project-a"),
      },
    };
    const second = {
      ...createInitialChatState({
        sessionId: "session-two",
        cwd,
        projectRoot: join(cwd, "project-b"),
        tags: ["support"],
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
      lastRunTask: "perform the release check",
      lastRunWorkflowLocator: {
        name: "release-readiness",
        displayPath: ".obora/workflows/release-readiness.yaml",
      },
    });
    expect(summaries.map((summary) => summary.sessionId).sort()).toEqual([
      "session-one",
      "session-two",
    ]);
    expect(summaries.find((summary) => summary.sessionId === "session-one")).toMatchObject({
      messageCount: 1,
      projectRoot: join(cwd, "project-a"),
      tags: ["release", "urgent"],
      workflowTarget: "release-readiness",
      lastRunTask: "perform the release check",
      lastRunWorkflowName: "release-readiness",
    });
    await expect(listChatSessionSummaries({ cwd, tag: "release" })).resolves.toEqual([
      expect.objectContaining({ sessionId: "session-one", tags: ["release", "urgent"] }),
    ]);
    await expect(
      listChatSessionSummaries({ cwd, projectRoot: join(cwd, "project-b") })
    ).resolves.toEqual([expect.objectContaining({ sessionId: "session-two" })]);
  });

  it("renames and deletes persisted chat sessions", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "obora-chat-store-rename-"));
    const state = createInitialChatState({
      sessionId: "session-one",
      cwd,
      dryRun: true,
    });

    await saveChatSessionState({ cwd, state });

    await expect(
      renameChatSessionState({
        cwd,
        fromSessionId: "session-one",
        toSessionId: "session-renamed",
      })
    ).resolves.toMatchObject({ sessionId: "session-renamed" });
    await expect(loadChatSessionState({ cwd, sessionId: "session-one" })).resolves.toBeUndefined();
    await expect(loadChatSessionState({ cwd, sessionId: "session-renamed" })).resolves.toMatchObject(
      {
        sessionId: "session-renamed",
      }
    );
    await expect(deleteChatSessionState({ cwd, sessionId: "session-renamed" })).resolves.toBe(
      true
    );
    await expect(deleteChatSessionState({ cwd, sessionId: "session-renamed" })).resolves.toBe(
      false
    );
    await expect(
      renameChatSessionState({
        cwd,
        fromSessionId: "missing",
        toSessionId: "still-missing",
      })
    ).resolves.toBeUndefined();
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

  it("finds a persisted run summary across sessions or within a selected session", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "obora-chat-store-run-"));
    const state = {
      ...createInitialChatState({
        sessionId: "session-with-run",
        cwd,
        dryRun: false,
        workflowTarget: "release-readiness",
      }),
      messages: [
        {
          id: "assistant:run",
          role: "assistant" as const,
          content: "Workflow completed.",
          createdAt: "2026-05-24T00:00:01.000Z",
          runSummary,
        },
      ],
    };

    await saveChatSessionState({ cwd, state });

    await expect(findChatRunDetail({ cwd, executionId: "exec-123" })).resolves.toMatchObject({
      sessionId: "session-with-run",
      messageId: "assistant:run",
      workflowTarget: "release-readiness",
      runSummary: {
        executionId: "exec-123",
        steps: [expect.objectContaining({ toolsUsed: ["file_read"] })],
      },
    });
    await expect(
      findChatRunDetail({ cwd, sessionId: "session-with-run", executionId: "missing" })
    ).resolves.toBeUndefined();
  });

  it("lists persisted run summaries from messages and restored session fields", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "obora-chat-store-runs-"));
    const messageRun = {
      ...runSummary,
      executionId: "exec-message",
      startedAt: "2026-05-24T00:00:00.000Z",
    };
    const lastRun = {
      ...runSummary,
      executionId: "exec-last",
      startedAt: "2026-05-25T00:00:00.000Z",
    };
    const state = {
      ...createInitialChatState({
        sessionId: "session-with-runs",
        cwd,
        dryRun: false,
        workflowTarget: "release-readiness",
      }),
      lastRunSummary: lastRun,
      messages: [
        {
          id: "assistant:run",
          role: "assistant" as const,
          content: "Workflow completed.",
          createdAt: "2026-05-24T00:00:01.000Z",
          runSummary: messageRun,
        },
      ],
    };

    await saveChatSessionState({ cwd, state });

    await expect(listChatRunDetails({ cwd })).resolves.toEqual([
      expect.objectContaining({
        sessionId: "session-with-runs",
        messageId: "state:lastRunSummary",
        runSummary: expect.objectContaining({ executionId: "exec-last" }),
      }),
      expect.objectContaining({
        sessionId: "session-with-runs",
        messageId: "assistant:run",
        runSummary: expect.objectContaining({ executionId: "exec-message" }),
      }),
    ]);
    await expect(
      findChatRunDetail({ cwd, executionId: "exec-last" })
    ).resolves.toMatchObject({
      messageId: "state:lastRunSummary",
      runSummary: { executionId: "exec-last" },
    });
  });

  it("filters persisted run summaries by project, tag, status, and session", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "obora-chat-store-run-filters-"));
    const projectA = join(cwd, "project-a");
    const projectB = join(cwd, "project-b");
    const completedRun = {
      ...runSummary,
      executionId: "exec-completed",
      status: "completed" as const,
      startedAt: "2026-05-25T00:00:00.000Z",
    };
    const failedRun = {
      ...runSummary,
      executionId: "exec-failed",
      status: "failed" as const,
      startedAt: "2026-05-24T00:00:00.000Z",
    };

    await saveChatSessionState({
      cwd,
      state: {
        ...createInitialChatState({
          sessionId: "session-release",
          cwd,
          projectRoot: projectA,
          tags: ["release"],
          dryRun: false,
        }),
        lastRunSummary: completedRun,
      },
    });
    await saveChatSessionState({
      cwd,
      state: {
        ...createInitialChatState({
          sessionId: "session-support",
          cwd,
          projectRoot: projectB,
          tags: ["support"],
          dryRun: false,
        }),
        lastRunSummary: failedRun,
      },
    });

    await expect(listChatRunDetails({ cwd, projectRoot: projectA })).resolves.toEqual([
      expect.objectContaining({ runSummary: expect.objectContaining({ executionId: "exec-completed" }) }),
    ]);
    await expect(listChatRunDetails({ cwd, tag: "support" })).resolves.toEqual([
      expect.objectContaining({ runSummary: expect.objectContaining({ executionId: "exec-failed" }) }),
    ]);
    await expect(listChatRunDetails({ cwd, status: "failed" })).resolves.toEqual([
      expect.objectContaining({ runSummary: expect.objectContaining({ executionId: "exec-failed" }) }),
    ]);
    await expect(
      listChatRunDetails({ cwd, sessionId: "session-support", projectRoot: projectA })
    ).resolves.toEqual([]);
    await expect(
      listChatRunDetails({ cwd, sessionId: "session-support", tag: "release" })
    ).resolves.toEqual([]);
    await expect(
      listChatRunDetails({ cwd, sessionId: "session-support", tag: "support", status: "failed" })
    ).resolves.toEqual([
      expect.objectContaining({ runSummary: expect.objectContaining({ executionId: "exec-failed" }) }),
    ]);
  });

  it("groups chat session summaries by project, tag, or day", () => {
    const summaries = [
      {
        sessionId: "session-one",
        status: "ready" as const,
        cwd: "/repo",
        projectRoot: "/repo/project-a",
        tags: ["release", "urgent"],
        messageCount: 2,
        updatedAt: "2026-05-24T10:00:00.000Z",
      },
      {
        sessionId: "session-two",
        status: "completed" as const,
        cwd: "/repo",
        tags: [],
        messageCount: 1,
        updatedAt: "2026-05-25T10:00:00.000Z",
      },
    ];

    expect(groupChatSessionSummaries(summaries, "project")).toEqual([
      expect.objectContaining({
        group: "/repo",
        sessions: [expect.objectContaining({ sessionId: "session-two" })],
      }),
      expect.objectContaining({
        group: "/repo/project-a",
        sessions: [expect.objectContaining({ sessionId: "session-one" })],
      }),
    ]);
    expect(groupChatSessionSummaries(summaries, "tag")).toEqual([
      expect.objectContaining({
        group: "release",
        sessions: [expect.objectContaining({ sessionId: "session-one" })],
      }),
      expect.objectContaining({
        group: "untagged",
        sessions: [expect.objectContaining({ sessionId: "session-two" })],
      }),
      expect.objectContaining({
        group: "urgent",
        sessions: [expect.objectContaining({ sessionId: "session-one" })],
      }),
    ]);
    expect(
      groupChatSessionSummaries(
        summaries.filter((summary) => summary.tags.includes("release")),
        "tag",
        "release"
      )
    ).toEqual([
      expect.objectContaining({
        group: "release",
        sessions: [expect.objectContaining({ sessionId: "session-one" })],
      }),
    ]);
    expect(groupChatSessionSummaries(summaries, "day")).toEqual([
      expect.objectContaining({
        group: "2026-05-24",
        sessions: [expect.objectContaining({ sessionId: "session-one" })],
      }),
      expect.objectContaining({
        group: "2026-05-25",
        sessions: [expect.objectContaining({ sessionId: "session-two" })],
      }),
    ]);
  });
});
