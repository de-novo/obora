import { runChatSession } from "../../chat/session.js";
import {
  findChatRunDetail,
  groupChatSessionSummaries,
  listChatSessionSummaries,
  loadChatSessionState,
} from "../../chat/store.js";
import { createCLI } from "../../cli.js";
import { createChatCommand } from "../chat.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../chat/session.js", () => ({
  runChatSession: vi.fn(),
}));

vi.mock("../../chat/store.js", () => ({
  findChatRunDetail: vi.fn(),
  groupChatSessionSummaries: vi.fn((sessions) => [{ group: "/repo", sessions }]),
  listChatSessionSummaries: vi.fn(),
  loadChatSessionState: vi.fn(),
}));

describe("chat command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("is registered as a top-level CLI command", () => {
    const names = createCLI().commands.map((command) => command.name());

    expect(names).toContain("chat");
  });

  it("starts a chat session with workflow argument and JSON output", async () => {
    vi.mocked(runChatSession).mockResolvedValue({
      sessionId: "session-a",
      status: "ready",
      cwd: "/repo",
      dryRun: true,
      workflowTarget: "release-readiness",
      messages: [],
    });

    await createChatCommand().parseAsync(
      [
        "release-readiness",
        "--once",
        "ship it",
        "--dry-run",
        "--session",
        "session-a",
        "--scope",
        "project",
        "--json",
      ],
      { from: "user" }
    );

    expect(runChatSession).toHaveBeenCalledWith(
      expect.objectContaining({
        cwd: process.cwd(),
        commandOptions: expect.objectContaining({
          workflow: "release-readiness",
          once: "ship it",
          dryRun: true,
          session: "session-a",
          scope: "project",
        }),
      })
    );
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('"sessionId": "session-a"'));
  });

  it("lets --workflow override the positional workflow", async () => {
    vi.mocked(runChatSession).mockResolvedValue({
      sessionId: "session-a",
      status: "ready",
      cwd: "/repo",
      dryRun: false,
      workflowTarget: "global-review",
      messages: [],
    });

    await createChatCommand().parseAsync(
      ["project-review", "--workflow", "global-review", "--once", "hello"],
      { from: "user" }
    );

    expect(runChatSession).toHaveBeenCalledWith(
      expect.objectContaining({
        commandOptions: expect.objectContaining({
          workflow: "global-review",
        }),
      })
    );
  });

  it("lists persisted chat sessions without starting the TUI", async () => {
    vi.mocked(listChatSessionSummaries).mockResolvedValue([
      {
        sessionId: "session-a",
        status: "ready",
        cwd: "/repo",
        workflowTarget: "release-readiness",
        tags: ["release"],
        messageCount: 4,
        updatedAt: "2026-05-24T00:00:00.000Z",
      },
    ]);

    await createChatCommand().parseAsync(["--list-sessions", "--json"], { from: "user" });

    expect(runChatSession).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('"sessionId": "session-a"'));
  });

  it("prints persisted chat sessions as a table without --json", async () => {
    const tableSpy = vi.spyOn(console, "table").mockImplementation(() => undefined);
    vi.mocked(listChatSessionSummaries).mockResolvedValue([
      {
        sessionId: "session-a",
        status: "ready",
        cwd: "/repo",
        tags: [],
        messageCount: 2,
        updatedAt: "2026-05-24T00:00:00.000Z",
      },
    ]);

    await createChatCommand().parseAsync(["--list-sessions"], { from: "user" });

    expect(runChatSession).not.toHaveBeenCalled();
    expect(tableSpy).toHaveBeenCalledWith([
      expect.objectContaining({ sessionId: "session-a" }),
    ]);
  });

  it("groups and filters persisted chat sessions without starting the TUI", async () => {
    vi.mocked(listChatSessionSummaries).mockResolvedValue([
      {
        sessionId: "session-a",
        status: "ready",
        cwd: "/repo",
        projectRoot: "/repo",
        tags: ["release"],
        messageCount: 4,
        updatedAt: "2026-05-24T00:00:00.000Z",
      },
    ]);
    vi.mocked(groupChatSessionSummaries).mockReturnValue([
      {
        group: "release",
        sessions: [
          {
            sessionId: "session-a",
            status: "ready",
            cwd: "/repo",
            projectRoot: "/repo",
            tags: ["release"],
            messageCount: 4,
            updatedAt: "2026-05-24T00:00:00.000Z",
          },
        ],
      },
    ]);

    await createChatCommand().parseAsync(
      ["--list-sessions", "--filter-tag", "release", "--group-sessions", "tag", "--json"],
      { from: "user" }
    );

    expect(runChatSession).not.toHaveBeenCalled();
    expect(listChatSessionSummaries).toHaveBeenCalledWith(
      expect.objectContaining({ cwd: process.cwd(), tag: "release" })
    );
    expect(groupChatSessionSummaries).toHaveBeenCalledWith(
      expect.any(Array),
      "tag",
      "release"
    );
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('"group": "release"'));
  });

  it("fails clearly for invalid chat session grouping", async () => {
    vi.mocked(listChatSessionSummaries).mockResolvedValue([]);

    await createChatCommand().parseAsync(["--list-sessions", "--group-sessions", "owner"], {
      from: "user",
    });

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("Invalid session group: owner")
    );
  });

  it("shows a persisted chat session selected by --session", async () => {
    vi.mocked(loadChatSessionState).mockResolvedValue({
      sessionId: "session-a",
      status: "ready",
      cwd: "/repo",
      dryRun: false,
      workflowTarget: "release-readiness",
      messages: [],
    });

    await createChatCommand().parseAsync(["--show-session", "--session", "session-a"], {
      from: "user",
    });

    expect(runChatSession).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('"sessionId": "session-a"'));
  });

  it("shows a persisted chat run selected by execution id", async () => {
    vi.mocked(findChatRunDetail).mockResolvedValue({
      sessionId: "session-a",
      messageId: "assistant:run",
      messageCreatedAt: "2026-05-24T00:00:01.000Z",
      workflowTarget: "release-readiness",
      runSummary: {
        executionId: "exec-123",
        workflowName: "release-readiness",
        status: "completed",
        startedAt: "2026-05-24T00:00:00.000Z",
        endedAt: "2026-05-24T00:00:01.000Z",
        durationMs: 1000,
        completedStepCount: 1,
        totalStepCount: 1,
        message: "Workflow completed: 1/1 steps completed.",
        steps: [],
      },
    });

    await createChatCommand().parseAsync(
      ["--show-run", "exec-123", "--session", "session-a"],
      { from: "user" }
    );

    expect(runChatSession).not.toHaveBeenCalled();
    expect(findChatRunDetail).toHaveBeenCalledWith(
      expect.objectContaining({ executionId: "exec-123", sessionId: "session-a" })
    );
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('"executionId": "exec-123"'));
  });

  it("fails clearly when a persisted chat run is missing", async () => {
    vi.mocked(findChatRunDetail).mockResolvedValue(undefined);

    await createChatCommand().parseAsync(["--show-run", "missing"], { from: "user" });

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("Chat run not found: missing")
    );
  });

  it("requires --session when showing a persisted chat session", async () => {
    await createChatCommand().parseAsync(["--show-session"], {
      from: "user",
    });

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("--show-session requires --session <id>")
    );
  });

  it("fails clearly when a persisted chat session is missing", async () => {
    vi.mocked(loadChatSessionState).mockResolvedValue(undefined);

    await createChatCommand().parseAsync(["--show-session", "--session", "missing"], {
      from: "user",
    });

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("Chat session not found: missing")
    );
  });
});
